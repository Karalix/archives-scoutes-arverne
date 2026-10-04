export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const id = getRouterParam(event, 'id')!
  const body = parseValid({ ...(await readBody(event)), id }, DocumentInputSchema)
  const r = await upsertDocument(actor, body, { dryRun: isDryRun(event) })
  if (isDryRun(event)) return r
  const { doc, yearStart } = await loadDocWithYear(id)
  return serializeAdminDoc(doc, yearStart, true)
})
