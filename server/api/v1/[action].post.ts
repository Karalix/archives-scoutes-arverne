// I-06 : opérations de lot — POST /api/v1/documents:batch, :publish, :unpublish, :trash
export default defineEventHandler(async (event) => {
  const action = getRouterParam(event, 'action')
  switch (action) {
    case 'documents:batch': {
      const actor = await requireActor(event, 'write')
      const { documents } = await readValid(event, BatchInput)
      const dryRun = isDryRun(event)
      return withIdempotency(event, actor, async () => {
        // Réponse ligne par ligne : jamais de tout-ou-rien silencieux
        const results = []
        for (const [index, input] of documents.entries()) {
          try {
            const r = await upsertDocument(actor, input, { dryRun })
            results.push(dryRun ? { index, ok: true, plan: r } : { index, ok: true, action: r.action, id: r.id, externalId: input.externalId ?? null })
          }
          catch (e: any) {
            results.push({ index, ok: false, externalId: input.externalId ?? null, status: e.statusCode ?? 500, error: e.data?.detail ?? e.message, hint: e.data?.hint })
          }
        }
        return { dryRun, ok: results.every(r => r.ok), results }
      })
    }
    case 'documents:publish':
    case 'documents:unpublish': {
      const actor = await requireActor(event, 'publish')
      const { ids } = await readValid(event, IdsInput)
      const results = await publishDocuments(actor, ids, action === 'documents:publish')
      return { ok: results.every(r => r.ok), results }
    }
    case 'documents:trash': {
      const actor = await requireActor(event, 'write')
      const { ids } = await readValid(event, IdsInput)
      const results = await trashDocuments(actor, ids)
      return { ok: results.every(r => r.ok), results }
    }
    default:
      throw problem(404, `Action inconnue : ${action}`, { hint: 'Actions : documents:batch, documents:publish, documents:unpublish, documents:trash' })
  }
})
