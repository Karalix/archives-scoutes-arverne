import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'contributor')
  const id = getRouterParam(event, 'id')!
  const tok = await db.query.apiToken.findFirst({ where: and(eq(schema.apiToken.id, id), eq(schema.apiToken.instanceId, instanceId())) })
  if (!tok) throw problem(404, 'Jeton introuvable')
  if (tok.userId !== admin.userId && admin.role !== 'owner') throw problem(403, 'Seul son créateur ou un propriétaire peut révoquer ce jeton')
  await db.update(schema.apiToken).set({ revokedAt: Date.now() }).where(eq(schema.apiToken.id, id))
  await audit(admin, 'token.revoke', `token:${tok.name}`)
  return { ok: true }
})
