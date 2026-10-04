import { z } from 'zod'
import { eq } from 'drizzle-orm'

const Body = z.object({
  status: z.enum(['open', 'done', 'rejected']),
  // L-02 : retrait en un clic
  takedown: z.enum(['forcePrivate', 'hidden']).optional(),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'editor')
  const id = getRouterParam(event, 'id')!
  const body = await readValid(event, Body)
  const r = await db.query.report.findFirst({ where: eq(schema.report.id, id) })
  if (!r) throw problem(404, 'Signalement introuvable')
  if (body.takedown) {
    await upsertDocument(admin, { id: r.documentId, visibility: body.takedown })
  }
  await db.update(schema.report).set({ status: body.status, handledBy: admin.label, handledAt: Date.now() }).where(eq(schema.report.id, id))
  await audit(admin, 'report.handle', `report:${id}`, { status: r.status }, { status: body.status, takedown: body.takedown })
  return { ok: true }
})
