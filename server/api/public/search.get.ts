import { z } from 'zod'

const Query = z.object({
  q: z.string().max(200).optional(),
  place: z.string().max(200).optional(),
  kind: z.enum(['video', 'photo', 'pdf', 'audio']).optional(),
  branch: z.string().max(20).optional(),
  year: z.coerce.number().int().optional(),
})

// F-10 / F-11 : recherche limitée aux documents auxquels la session a droit
export default defineEventHandler(async (event) => {
  const q = parseValid(getQuery(event), Query)
  const inst = await getInstance()
  const access = await getAccess(event)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const [results, places] = await Promise.all([searchDocuments(inst, access, q), listPlaces(inst, access)])
  return { results, places }
})
