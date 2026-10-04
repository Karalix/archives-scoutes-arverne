import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const id = getRouterParam(event, 'id')!
  const ev = await db.query.event.findFirst({ where: eq(schema.event.id, id) })
  if (!ev) throw problem(404, 'Événement introuvable')
  // Les documents restent dans l'année, sans événement
  await db.update(schema.document).set({ eventId: null, updatedAt: Date.now() }).where(eq(schema.document.eventId, id))
  await db.delete(schema.event).where(eq(schema.event.id, id))
  await audit(actor, 'event.delete', `event:${id}`, ev, null)
  return { ok: true }
})
