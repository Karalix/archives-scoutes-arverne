import { eq } from 'drizzle-orm'
import { z } from 'zod'

const Body = z.object({
  token: z.string().min(1),
  email: z.email(),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(200),
  groupName: z.string().trim().min(1).max(120),
  pivotOffset: z.number().int().min(0).max(50).default(10),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  firstPassword: z.string().trim().min(8).max(100).optional(),
})

// A-04 / 9.1 : assistant de premier lancement
export default defineEventHandler(async (event) => {
  await rateLimit(event, `install:${await ipHash(event)}`, { limit: 10, windowMs: 15 * 60_000, progressive: true })
  const body = await readValid(event, Body)
  if (await countAdmins() > 0) throw problem(409, 'Instance déjà installée')
  if (!(await installTokenMatches(body.token))) {
    await logSecurity(event, 'install_token_fail')
    throw problem(401, 'Jeton d\'installation invalide', { hint: 'Il figure dans les secrets du Worker (NUXT_INSTALL_TOKEN) ou dans ses logs.' })
  }
  const inst = await getInstance()
  const ts = Date.now()
  const user = {
    id: newId(), instanceId: inst.id, email: body.email.toLowerCase(), name: body.name, role: 'owner' as const,
    passwordHash: await hashPassword(body.password), sessionVersion: 1, disabledAt: null, createdAt: ts, lastLoginAt: null,
  }
  await db.insert(schema.adminUser).values(user)
  await db.update(schema.instance).set({
    name: body.groupName,
    slug: slugify(body.groupName),
    pivotMode: 'sliding',
    pivotOffset: body.pivotOffset,
    primaryColor: body.primaryColor ?? inst.primaryColor,
    installedAt: ts,
    updatedAt: ts,
  }).where(eq(schema.instance.id, inst.id))
  invalidateInstanceCache()
  const actor = { kind: 'user' as const, userId: user.id, name: user.name, email: user.email, role: user.role, scopes: scopesForRole('owner'), label: `user:${user.id}` }
  await audit(actor, 'instance.install', `instance:${inst.id}`, null, { groupName: body.groupName, pivotOffset: body.pivotOffset })
  let created: { password: string, scoutYear: number } | null = null
  if (body.firstPassword) {
    const scoutYear = scoutYearOf(new Date(), inst.switchMonth)
    await createAccessPassword(actor, scoutYear, body.firstPassword)
    created = { password: normalizePassphrase(body.firstPassword), scoutYear }
  }
  await kvDel('install-token')
  await openAdminSession(event, user)
  return { ok: true, firstPassword: created }
})
