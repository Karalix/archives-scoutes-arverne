export default defineEventHandler(async (event) => {
  await closeAdminSession(event)
  return { ok: true }
})
