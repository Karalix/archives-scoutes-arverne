import { and, desc, eq, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'owner')
  const users = await db.select().from(schema.adminUser).where(eq(schema.adminUser.instanceId, instanceId())).orderBy(desc(schema.adminUser.createdAt))
  const invites = await db.select().from(schema.adminLink)
    .where(and(eq(schema.adminLink.instanceId, instanceId()), eq(schema.adminLink.kind, 'invite'), isNull(schema.adminLink.usedAt)))
  return {
    users: users.map(({ passwordHash: _p, ...u }) => u),
    invites: invites.filter(i => i.expiresAt > Date.now()).map(({ tokenHash: _t, ...i }) => i),
  }
})
