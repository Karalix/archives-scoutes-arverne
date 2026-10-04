export default defineEventHandler(async (event) => {
  const y = Number(getRouterParam(event, 'year'))
  if (!Number.isInteger(y)) throw problem(400, 'Année invalide')
  const inst = await getInstance()
  const access = await getAccess(event)
  const page = await getYearPage(inst, access, y)
  if (!page.public) setHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
  if (!page.public || access.admin || access.family) setHeader(event, 'Cache-Control', 'private, no-store')
  return page
})
