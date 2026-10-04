import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  await db.delete(schema.passkey).where(and(eq(schema.passkey.id, getRouterParam(event, 'id')!), eq(schema.passkey.userId, admin.userId)))
  await audit(admin, 'passkey.remove', `user:${admin.userId}`)
  return { ok: true }
})
