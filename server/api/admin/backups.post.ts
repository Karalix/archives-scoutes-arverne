export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'owner')
  return runWeeklyBackup()
})
