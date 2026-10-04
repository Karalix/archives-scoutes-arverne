export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'editor')
  const inst = await getInstance()
  const { streamApiToken, ...settings } = inst.settings
  return {
    ...inst,
    settings: { ...settings, streamApiTokenSet: !!streamApiToken },
    effectivePivot: effectivePivot(accessInstance(inst), new Date()),
    currentScoutYear: scoutYearOf(new Date(), inst.switchMonth),
  }
})
