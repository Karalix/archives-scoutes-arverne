// plan_import : classement proposé à valider, sans rien écrire
export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  const { files } = await readValid(event, PlanImportInput)
  return planImport(files)
})
