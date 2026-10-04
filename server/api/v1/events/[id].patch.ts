import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const id = getRouterParam(event, 'id')!
  const ev = await db.query.event.findFirst({ where: eq(schema.event.id, id) })
  if (!ev) throw problem(404, 'Événement introuvable')
  const y = await db.query.year.findFirst({ where: eq(schema.year.id, ev.yearId) })
  const body = parseValid({ year: y!.startYear, title: ev.title, ...(await readBody(event)), id }, EventInputSchema)
  return upsertEvent(actor, body, isDryRun(event))
})
