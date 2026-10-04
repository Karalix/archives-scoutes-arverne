export default defineEventHandler(async (event) => {
  const inst = await getInstance()
  const access = await getAccess(event)
  const doc = await getDocumentForFront(inst, access, getRouterParam(event, 'id')!)
  if (doc.protected) setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  setHeader(event, 'Cache-Control', 'private, no-store')
  return doc
})
