// Reprise : liste des parties déjà reçues et URL signées des parties manquantes
export default defineEventHandler(async (event) => {
  await requireActor(event, 'write')
  return describeUpload(await getUpload(getRouterParam(event, 'id')!), true)
})
