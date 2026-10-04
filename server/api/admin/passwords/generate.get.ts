export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'editor')
  const y = Number(getQuery(event).year) || scoutYearOf(new Date(), (await getInstance()).switchMonth)
  return { password: generatePassphrase(y) }
})
