import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'publish')
  const startYear = Number(getRouterParam(event, 'startYear'))
  const y = await findYear(startYear)
  if (!y) throw problem(404, 'Année introuvable')
  const docs = await db.select({ id: schema.document.id }).from(schema.document).where(eq(schema.document.yearId, y.id)).limit(1)
  if (docs.length) throw problem(409, 'Année non vide', { hint: 'Déplacez ou supprimez définitivement ses documents d\'abord.' })
  await db.delete(schema.event).where(eq(schema.event.yearId, y.id))
  await db.delete(schema.year).where(eq(schema.year.id, y.id))
  await audit(actor, 'year.delete', `year:${startYear}`, y, null)
  return { ok: true }
})
