import { z } from 'zod'

const Body = z.object({ action: z.enum(['restore', 'purge']) })

export default defineEventHandler(async (event) => {
  const body = await readValid(event, Body)
  const admin = await requireAdmin(event, body.action === 'purge' ? 'owner' : 'editor')
  const id = getRouterParam(event, 'id')!
  if (body.action === 'purge') {
    const d = await db.query.document.findFirst({ where: (t, { eq }) => eq(t.id, id) })
    if (d?.status !== 'trashed') throw problem(409, 'Seul un document en corbeille peut être supprimé définitivement')
  }
  if (body.action === 'restore') await restoreDocument(admin, id)
  else await purgeDocument(admin, id, useStorageDriver(event))
  return { ok: true }
})
