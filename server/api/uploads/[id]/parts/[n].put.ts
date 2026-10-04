// T-04 : réception d'une partie. Authentifiée par session/jeton, ou par URL signée (I-13).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const n = Number(getRouterParam(event, 'n'))
  const q = getQuery(event)
  if (q.sig) {
    if (!(await verifyUploadPartSignature(id, n, q))) throw problem(403, 'URL de partie expirée ou invalide', { hint: `GET /api/uploads/${id} renvoie de nouvelles URL.` })
  }
  else {
    await requireActor(event, 'write')
  }
  const part = await receivePart(event, await getUpload(id), n)
  return { ok: true, ...part }
})
