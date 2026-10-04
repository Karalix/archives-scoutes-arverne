export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const startYear = Number(getRouterParam(event, 'startYear'))
  const body = parseValid({ ...(await readBody(event)), startYear }, YearInput)
  if (!(await findYear(startYear))) throw problem(404, `Année ${scoutYearLabel(startYear)} introuvable`)
  return upsertYear(actor, body, isDryRun(event))
})
