import { z } from 'zod'

const Body = z.object({
  name: z.string().trim().min(1).max(60).regex(/^[\w .-]+$/, 'lettres, chiffres, espaces, . _ -'),
  scopes: z.array(z.enum(['read', 'write', 'publish'])).min(1),
  days: z.number().int().min(1).max(365).default(90),
})

// I-01 : jeton personnel affiché une seule fois, stocké haché, expiration 90 j par défaut
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'contributor')
  const body = await readValid(event, Body)
  const allowed = scopesForRole(admin.role)
  const denied = body.scopes.filter(s => !allowed.includes(s))
  if (denied.length) throw problem(403, `Votre rôle ne permet pas la portée : ${denied.join(', ')}`)
  const secret = `asc_${randomToken(30)}`
  const row = {
    id: newId(), instanceId: instanceId(), name: body.name, tokenHash: await sha256Hex(secret), prefix: secret.slice(0, 10),
    scopes: body.scopes, userId: admin.userId, createdAt: Date.now(), expiresAt: Date.now() + body.days * 86400_000, revokedAt: null, lastUsedAt: null,
  }
  await db.insert(schema.apiToken).values(row)
  await audit(admin, 'token.create', `token:${row.name}`, null, { scopes: row.scopes, expiresAt: row.expiresAt })
  return { id: row.id, name: row.name, token: secret, scopes: row.scopes, expiresAt: row.expiresAt }
})
