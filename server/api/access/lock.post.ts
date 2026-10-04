export default defineEventHandler(async (event) => {
  await closeFamilySession(event)
  return { ok: true }
})
