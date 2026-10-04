export default defineEventHandler(async (event) => {
  await requireActor(event, 'write')
  await abortUpload(event, await getUpload(getRouterParam(event, 'id')!))
  return { ok: true }
})
