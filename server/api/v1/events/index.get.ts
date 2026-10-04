import { and, asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  const q = getQuery(event)
  const conds = [eq(schema.event.instanceId, instanceId())]
  if (q.year) {
    const y = await findYear(Number(q.year))
    if (!y) return []
    conds.push(eq(schema.event.yearId, y.id))
  }
  const rows = await db.select({ ev: schema.event, startYear: schema.year.startYear }).from(schema.event)
    .innerJoin(schema.year, eq(schema.year.id, schema.event.yearId))
    .where(and(...conds)).orderBy(asc(schema.year.startYear), asc(schema.event.sort), asc(schema.event.startDate))
  return rows.map(r => ({ ...r.ev, year: r.startYear }))
})
