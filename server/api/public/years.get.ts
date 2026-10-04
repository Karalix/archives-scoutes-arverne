export default defineEventHandler(async (event) => {
  const inst = await getInstance()
  return listYearsForFront(inst, await getAccess(event))
})
