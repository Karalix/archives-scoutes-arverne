// Logo du groupe (public, F-01)
export default defineEventHandler(async (event) => {
  const inst = await getInstance()
  if (!inst.logoKey) throw createError({ statusCode: 404 })
  const obj = await useStorageDriver(event).get(inst.logoKey)
  if (!obj) throw createError({ statusCode: 404 })
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.contentType || 'image/png',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
