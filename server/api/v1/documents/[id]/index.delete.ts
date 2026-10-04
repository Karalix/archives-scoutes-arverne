// I-14 : au plus un passage en corbeille
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const [r] = await trashDocuments(actor, [getRouterParam(event, 'id')!])
  if (!r!.ok) throw problem(409, r!.error!)
  return r
})
