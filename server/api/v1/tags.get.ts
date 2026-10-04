import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  return db.select().from(schema.tag).where(eq(schema.tag.instanceId, instanceId())).orderBy(asc(schema.tag.label))
})
