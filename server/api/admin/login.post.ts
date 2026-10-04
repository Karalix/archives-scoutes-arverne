import { z } from 'zod'
import { and, eq } from 'drizzle-orm'

const Body = z.object({ email: z.string().trim().toLowerCase().min(3), password: z.string().min(1).max(200) })

// A-01 : identifiant (e-mail) + mot de passe ; L-12 : limitation de débit
export default defineEventHandler(async (event) => {
  const body = await readValid(event, Body)
  const ip = await ipHash(event)
  // Seuls les échecs comptent : 10 / 15 min par IP et par compte, délai progressif
  await assertNotRateLimited(event, `login:${ip}`)
  await assertNotRateLimited(event, `login-user:${body.email}`)
  const u = await db.query.adminUser.findFirst({ where: and(eq(schema.adminUser.instanceId, instanceId()), eq(schema.adminUser.email, body.email)) })
  const ok = u?.passwordHash && !u.disabledAt ? await verifyPassword(u.passwordHash, body.password) : false
  if (!u || !ok) {
    await logSecurity(event, 'admin_login_fail', body.email)
    await rateLimit(event, `login:${ip}`, { limit: 10, windowMs: 15 * 60_000, progressive: true })
    await rateLimit(event, `login-user:${body.email}`, { limit: 10, windowMs: 15 * 60_000, progressive: true })
    throw problem(401, 'Identifiants incorrects')
  }
  await resetRateLimit(`login-user:${body.email}`)
  await openAdminSession(event, u)
  return { ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } }
})
