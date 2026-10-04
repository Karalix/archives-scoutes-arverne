export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  await restoreDocument(actor, getRouterParam(event, 'id')!)
  return { ok: true }
})
