import { z } from 'zod'
import { eq } from 'drizzle-orm'

const Body = z.object({ action: z.enum(['revoke', 'share']), days: z.number().int().min(1).max(365).default(30) })

// R-06 : révocation explicite ; R-11 : lien de partage signé
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'editor')
  const id = getRouterParam(event, 'id')!
  const body = await readValid(event, Body)
  const pw = await db.query.accessPassword.findFirst({ where: eq(schema.accessPassword.id, id) })
  if (!pw) throw problem(404, 'Mot de passe introuvable')
  if (body.action === 'revoke') {
    await db.update(schema.accessPassword).set({ revokedAt: Date.now() }).where(eq(schema.accessPassword.id, id))
    await audit(admin, 'password.revoke', `password:${id}`, { revokedAt: null }, { revokedAt: Date.now() })
    return { ok: true }
  }
  if (pw.revokedAt) throw problem(409, 'Mot de passe révoqué')
  const exp = Math.floor(Date.now() / 1000) + body.days * 86400
  const key = await signShareKey(pw.id, pw.scoutYear, exp)
  await audit(admin, 'password.share_link', `password:${id}`, null, { days: body.days })
  return { url: `${getRequestURL(event).origin}/?cle=${encodeURIComponent(key)}`, expiresAt: exp * 1000 }
})
