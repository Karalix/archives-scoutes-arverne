import { and, eq, isNull } from 'drizzle-orm'
import type { Role } from '../db/schema'
import type { Actor } from './auth'

export const LINK_TTL = 7 * 24 * 3600_000 // A-03 : 7 jours

export async function createAdminLink(actor: Actor | 'cli', input: { kind: 'invite' | 'reset', email?: string, name?: string, role?: Role, userId?: string }) {
  const token = randomToken(24)
  const row = {
    id: newId(), instanceId: instanceId(), kind: input.kind, tokenHash: await sha256Hex(token),
    email: input.email?.toLowerCase() ?? null, name: input.name ?? null, role: input.role ?? null, userId: input.userId ?? null,
    createdBy: actor === 'cli' ? 'cli' : actor.label, createdAt: Date.now(), expiresAt: Date.now() + LINK_TTL, usedAt: null,
  }
  await db.insert(schema.adminLink).values(row)
  if (actor !== 'cli') await audit(actor, input.kind === 'invite' ? 'user.invite' : 'user.reset_link', input.userId ? `user:${input.userId}` : `invite:${row.id}`, null, { email: row.email, role: row.role })
  return { id: row.id, token, path: `/admin/lien/${token}`, expiresAt: row.expiresAt }
}

export async function findValidLink(token: string) {
  const link = await db.query.adminLink.findFirst({ where: and(eq(schema.adminLink.tokenHash, await sha256Hex(token)), isNull(schema.adminLink.usedAt)) })
  if (!link || link.expiresAt < Date.now()) throw problem(404, 'Lien invalide, déjà utilisé ou expiré', { hint: 'Demandez un nouveau lien au propriétaire de l\'instance.' })
  return link
}
