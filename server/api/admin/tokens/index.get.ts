import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'contributor')
  const rows = await db.select().from(schema.apiToken).where(eq(schema.apiToken.instanceId, instanceId())).orderBy(desc(schema.apiToken.createdAt))
  const users = await db.select({ id: schema.adminUser.id, name: schema.adminUser.name }).from(schema.adminUser)
  const names = new Map(users.map(u => [u.id, u.name]))
  return rows
    .filter(r => admin.role === 'owner' || r.userId === admin.userId)
    .map(({ tokenHash: _h, ...r }) => ({ ...r, userName: names.get(r.userId) ?? '?' }))
})
