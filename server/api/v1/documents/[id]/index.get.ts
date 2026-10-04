// get_document
export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  const { doc, yearStart } = await loadDocWithYear(getRouterParam(event, 'id')!)
  return serializeAdminDoc(doc, yearStart, true)
})
