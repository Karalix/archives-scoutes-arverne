// T-04 : finalisation ; vérifie le type réel et la conformité vidéo (I-09)
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const meta = parseValid((await readBody(event).catch(() => ({}))) ?? {}, FileMetaInput)
  return completeUpload(event, actor, await getUpload(getRouterParam(event, 'id')!), meta)
})
