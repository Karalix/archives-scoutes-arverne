// Création d'un document (brouillon par défaut) ; idempotent par externalId et Idempotency-Key
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const body = await readValid(event, DocumentInputSchema)
  return withIdempotency(event, actor, async () => {
    const r = await upsertDocument(actor, body, { dryRun: isDryRun(event) })
    if (isDryRun(event)) return r
    if (r.action === 'create') setResponseStatus(event, 201)
    const { doc, yearStart } = await loadDocWithYear(r.id!)
    return { action: r.action, document: await serializeAdminDoc(doc, yearStart) }
  })
})
