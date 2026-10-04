import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'

type AdminUserRow = typeof schema.adminUser.$inferSelect

export async function openAdminSession(event: H3Event, u: AdminUserRow) {
  const session = await getUserSession(event)
  await replaceUserSession(event, {
    ...(session.family ? { family: session.family } : {}),
    user: { id: u.id, name: u.name, email: u.email, role: u.role },
    admin: { version: u.sessionVersion, loggedInAt: Date.now() },
  })
  await db.update(schema.adminUser).set({ lastLoginAt: Date.now() }).where(eq(schema.adminUser.id, u.id))
  event.context.access = undefined
}

export async function closeAdminSession(event: H3Event) {
  const session = await getUserSession(event)
  if (session.family) await replaceUserSession(event, { family: session.family })
  else await clearUserSession(event)
}

export async function countAdmins() {
  const rows = await db.select({ id: schema.adminUser.id }).from(schema.adminUser).where(eq(schema.adminUser.instanceId, instanceId()))
  return rows.length
}

/** Jeton d'installation (A-04) : variable d'environnement, sinon généré et affiché dans les logs. */
export async function installTokenMatches(token: string) {
  const env = useRuntimeConfig().installToken
  if (env) return timingSafeEqual(await sha256Hex(env), await sha256Hex(token))
  let stored = await kvGet('install-token')
  if (!stored) {
    const generated = randomToken(12)
    await kvSet('install-token', await sha256Hex(generated))
    console.warn(`[archives-scoutes] Jeton d'installation généré : ${generated} (définissez NUXT_INSTALL_TOKEN pour le fixer)`)
    stored = await kvGet('install-token')
  }
  return timingSafeEqual(stored!, await sha256Hex(token))
}
