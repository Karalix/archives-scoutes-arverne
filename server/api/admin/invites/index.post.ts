import { z } from 'zod'

const Body = z.object({ email: z.email().optional(), name: z.string().max(100).optional(), role: z.enum(['owner', 'editor', 'contributor']) })

// A-03 : lien d'invitation à usage unique (7 jours), à transmettre soi-même
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'owner')
  const body = await readValid(event, Body)
  const link = await createAdminLink(admin, { kind: 'invite', ...body })
  return { ...link, url: `${getRequestURL(event).origin}${link.path}` }
})
