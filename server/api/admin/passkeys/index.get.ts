import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const keys = await db.select().from(schema.passkey).where(eq(schema.passkey.userId, admin.userId))
  return keys.map(k => ({ id: k.id, name: k.name, createdAt: k.createdAt, backedUp: k.backedUp }))
})
