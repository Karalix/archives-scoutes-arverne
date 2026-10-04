import { desc, eq, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  const inst = await getInstance()
  const ai = accessInstance(inst)
  const years = await db.select().from(schema.year).where(eq(schema.year.instanceId, inst.id)).orderBy(desc(schema.year.startYear))
  const counts = await db.select({ yearId: schema.document.yearId, status: schema.document.status, n: sql<number>`count(*)` })
    .from(schema.document).where(eq(schema.document.instanceId, inst.id)).groupBy(schema.document.yearId, schema.document.status)
  return years.map(y => ({
    ...y,
    label: scoutYearLabel(y.startYear),
    public: isPublicYear(y.startYear, ai, new Date()),
    counts: Object.fromEntries(counts.filter(c => c.yearId === y.id).map(c => [c.status, Number(c.n)])),
  }))
})
