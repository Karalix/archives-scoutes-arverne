import { z } from 'zod'

const Body = z.object({ scoutYear: z.number().int().min(1900).max(2200), password: z.string().trim().min(8).max(100).optional() })

// R-07 : génération assistée, affichée une seule fois
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'editor')
  const body = await readValid(event, Body)
  const plain = body.password || generatePassphrase(body.scoutYear)
  return createAccessPassword(admin, body.scoutYear, plain)
})
