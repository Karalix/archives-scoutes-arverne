import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'owner')
  const id = getRouterParam(event, 'id')!
  await db.delete(schema.adminLink).where(and(eq(schema.adminLink.id, id), eq(schema.adminLink.instanceId, instanceId())))
  await audit(admin, 'user.invite_cancel', `invite:${id}`)
  return { ok: true }
})
