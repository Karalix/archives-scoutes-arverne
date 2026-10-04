// Créer ou compléter une année (upsert_year)
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const body = await readValid(event, YearInput)
  return withIdempotency(event, actor, async () => {
    const r = await upsertYear(actor, body, isDryRun(event))
    if (r.action === 'create' && !isDryRun(event)) setResponseStatus(event, 201)
    return r
  })
})
