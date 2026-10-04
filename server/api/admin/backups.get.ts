export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'owner')
  return (await listBackups()).map(b => ({ key: b.key, size: b.size, uploaded: b.uploaded }))
})
