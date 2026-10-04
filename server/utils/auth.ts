import type { H3Event } from 'h3'
import { and, eq, isNull } from 'drizzle-orm'
import type { FamilyAccess } from '#shared/utils/access'
import type { Role } from '../db/schema'

export const ADMIN_SESSION_MS = 7 * 24 * 3600 * 1000 // L-12
const ROLE_RANK: Record<Role, number> = { contributor: 1, editor: 2, owner: 3 }
export type Scope = 'read' | 'write' | 'publish'

export interface Actor {
  kind: 'user' | 'token'
  userId: string
  name: string
  email: string
  role: Role
  scopes: Scope[]
  tokenId?: string
  /** Identifiant affiché dans le journal d'audit : user:<id> ou token:<nom> (I-03). */
  label: string
}

export interface AccessContext {
  admin: Actor | null
  family: FamilyAccess | null
}

export function roleAtLeast(role: Role, min: Role) {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

export function scopesForRole(role: Role): Scope[] {
  return role === 'contributor' ? ['read', 'write'] : ['read', 'write', 'publish']
}

/** Contexte d'accès de la requête : admin (session) et/ou famille, validés en base. */
export async function getAccess(event: H3Event): Promise<AccessContext> {
  if (event.context.access) return event.context.access as AccessContext
  const session = await getUserSession(event)
  const ctx: AccessContext = { admin: null, family: null }
  const now = Date.now()

  if (session.user && session.admin && session.admin.loggedInAt + ADMIN_SESSION_MS > now) {
    const u = await db.query.adminUser.findFirst({ where: eq(schema.adminUser.id, session.user.id) })
    if (u && !u.disabledAt && u.sessionVersion === session.admin.version) {
      ctx.admin = { kind: 'user', userId: u.id, name: u.name, email: u.email, role: u.role, scopes: scopesForRole(u.role), label: `user:${u.id}` }
    }
  }

  if (session.family && session.family.expiresAt > now) {
    const pw = await db.query.accessPassword.findFirst({ where: eq(schema.accessPassword.id, session.family.passwordId) })
    if (pw) {
      ctx.family = { ...session.family, revoked: !!pw.revokedAt }
      if (pw.revokedAt) ctx.family = null // R-06 / critère 12.2 : un mot de passe révoqué invalide les sessions
    }
  }

  event.context.access = ctx
  return ctx
}

/** Acteur authentifié par jeton d'API (Authorization: Bearer). */
export async function getTokenActor(event: H3Event): Promise<Actor | null> {
  const auth = getHeader(event, 'authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const raw = auth.slice(7).trim()
  const hash = await sha256Hex(raw)
  const tok = await db.query.apiToken.findFirst({ where: and(eq(schema.apiToken.tokenHash, hash), isNull(schema.apiToken.revokedAt)) })
  if (!tok || (tok.expiresAt && tok.expiresAt < Date.now())) {
    throw problem(401, 'Jeton invalide, expiré ou révoqué', { hint: 'Créez un nouveau jeton dans Administration → Jetons d\'API.' })
  }
  const u = await db.query.adminUser.findFirst({ where: eq(schema.adminUser.id, tok.userId) })
  if (!u || u.disabledAt) throw problem(401, 'Le compte qui a créé ce jeton est désactivé')
  await rateLimit(event, `token:${tok.id}`, { limit: 600, windowMs: 60_000 })
  // I-02 : un jeton ne dépasse jamais le rôle de son créateur
  const allowed = scopesForRole(u.role)
  const scopes = tok.scopes.filter(s => allowed.includes(s))
  if (!tok.lastUsedAt || Date.now() - tok.lastUsedAt > 60_000) {
    await db.update(schema.apiToken).set({ lastUsedAt: Date.now() }).where(eq(schema.apiToken.id, tok.id))
  }
  return { kind: 'token', userId: u.id, name: u.name, email: u.email, role: u.role, scopes, tokenId: tok.id, label: `token:${tok.name}` }
}

/** Admin connecté par session, avec rôle minimal. Les réglages sensibles n'acceptent jamais de jeton (I-02). */
export async function requireAdmin(event: H3Event, min: Role = 'contributor'): Promise<Actor> {
  const { admin } = await getAccess(event)
  if (!admin) throw problem(401, 'Connexion administrateur requise')
  if (!roleAtLeast(admin.role, min)) throw problem(403, `Rôle « ${min} » requis`)
  return admin
}

/** Acteur par session admin ou jeton d'API, avec portée requise. */
export async function requireActor(event: H3Event, scope: Scope): Promise<Actor> {
  const actor = (await getTokenActor(event)) ?? (await getAccess(event)).admin
  if (!actor) throw problem(401, 'Authentification requise', { hint: 'Envoyez un jeton d\'API dans Authorization: Bearer <jeton>.' })
  if (!actor.scopes.includes(scope)) throw problem(403, `Portée « ${scope} » requise`, { hint: scope === 'publish' ? 'Ce jeton ne peut créer que des brouillons ; un éditeur publie depuis l\'admin.' : undefined })
  return actor
}
