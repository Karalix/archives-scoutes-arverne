import { z } from 'zod'
import { eq } from 'drizzle-orm'

const Body = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1).max(100).optional(),
  email: z.email().optional(),
  password: z.string().min(10).max(200),
})

// A-03 : acceptation d'une invitation ou réinitialisation de mot de passe
export default defineEventHandler(async (event) => {
  await rateLimit(event, `link:${await ipHash(event)}`, { limit: 10, windowMs: 15 * 60_000 })
  const body = await readValid(event, Body)
  const link = await findValidLink(body.token)
  const ts = Date.now()
  let user: typeof schema.adminUser.$inferSelect
  if (link.kind === 'invite') {
    const email = (link.email || body.email || '').toLowerCase()
    if (!email) throw problem(422, 'E-mail requis')
    const exists = await db.query.adminUser.findFirst({ where: (u, { and, eq }) => and(eq(u.instanceId, instanceId()), eq(u.email, email)) })
    if (exists) throw problem(409, 'Un compte existe déjà avec cet e-mail')
    user = {
      id: newId(), instanceId: instanceId(), email, name: body.name || link.name || email, role: link.role ?? 'contributor',
      passwordHash: await hashPassword(body.password), sessionVersion: 1, disabledAt: null, createdAt: ts, lastLoginAt: null,
    }
    await db.insert(schema.adminUser).values(user)
    await audit({ kind: 'user', userId: user.id, name: user.name, email, role: user.role, scopes: [], label: `user:${user.id}` }, 'user.join', `user:${user.id}`, null, { role: user.role, invitedBy: link.createdBy })
  }
  else {
    const u = await db.query.adminUser.findFirst({ where: eq(schema.adminUser.id, link.userId!) })
    if (!u) throw problem(404, 'Compte introuvable')
    // Nouvelle version de session : toutes les sessions ouvertes sont révoquées
    await db.update(schema.adminUser).set({ passwordHash: await hashPassword(body.password), sessionVersion: u.sessionVersion + 1 }).where(eq(schema.adminUser.id, u.id))
    user = { ...u, sessionVersion: u.sessionVersion + 1 }
    await audit({ kind: 'user', userId: u.id, name: u.name, email: u.email, role: u.role, scopes: [], label: `user:${u.id}` }, 'user.password_reset', `user:${u.id}`)
  }
  await db.update(schema.adminLink).set({ usedAt: ts }).where(eq(schema.adminLink.id, link.id))
  await openAdminSession(event, user)
  return { ok: true }
})
