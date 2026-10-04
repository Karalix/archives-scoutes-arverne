// upsert_event : retrouvé par identifiant ou par titre dans l'année
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const body = await readValid(event, EventInputSchema)
  return withIdempotency(event, actor, async () => {
    const r = await upsertEvent(actor, body, isDryRun(event))
    if (r.action === 'create' && !isDryRun(event)) setResponseStatus(event, 201)
    return r
  })
})
