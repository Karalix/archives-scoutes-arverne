import { z } from 'zod'
import { and, eq, isNull, ne } from 'drizzle-orm'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), role: z.enum(['owner', 'editor', 'contributor']) }),
  z.object({ action: z.literal('disable') }),
  z.object({ action: z.literal('enable') }),
  z.object({ action: z.literal('revokeSessions') }),
  z.object({ action: z.literal('resetLink') }),
])

// A-02 / A-03 : rôles, désactivation, révocation immédiate des sessions, lien de réinitialisation
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'owner')
  const id = getRouterParam(event, 'id')!
  const body = await readValid(event, Body)
  const u = await db.query.adminUser.findFirst({ where: and(eq(schema.adminUser.id, id), eq(schema.adminUser.instanceId, instanceId())) })
  if (!u) throw problem(404, 'Compte introuvable')
  const otherOwners = async () => (await db.select({ id: schema.adminUser.id }).from(schema.adminUser)
    .where(and(eq(schema.adminUser.instanceId, instanceId()), eq(schema.adminUser.role, 'owner'), isNull(schema.adminUser.disabledAt), ne(schema.adminUser.id, id)))).length
  switch (body.action) {
    case 'role':
      if (u.role === 'owner' && body.role !== 'owner' && !(await otherOwners())) throw problem(409, 'Il doit rester au moins un propriétaire (D-05 : idéalement deux)')
      await db.update(schema.adminUser).set({ role: body.role, sessionVersion: u.sessionVersion + 1 }).where(eq(schema.adminUser.id, id))
      // Les jetons d'API sont plafonnés au rôle à l'usage (getTokenActor)
      await audit(admin, 'user.role', `user:${id}`, { role: u.role }, { role: body.role })
      return { ok: true }
    case 'disable':
      if (u.role === 'owner' && !(await otherOwners())) throw problem(409, 'Impossible de désactiver le dernier propriétaire')
      await db.update(schema.adminUser).set({ disabledAt: Date.now(), sessionVersion: u.sessionVersion + 1 }).where(eq(schema.adminUser.id, id))
      await db.update(schema.apiToken).set({ revokedAt: Date.now() }).where(and(eq(schema.apiToken.userId, id), isNull(schema.apiToken.revokedAt)))
      await audit(admin, 'user.disable', `user:${id}`)
      return { ok: true }
    case 'enable':
      await db.update(schema.adminUser).set({ disabledAt: null }).where(eq(schema.adminUser.id, id))
      await audit(admin, 'user.enable', `user:${id}`)
      return { ok: true }
    case 'revokeSessions':
      await db.update(schema.adminUser).set({ sessionVersion: u.sessionVersion + 1 }).where(eq(schema.adminUser.id, id))
      await audit(admin, 'user.revoke_sessions', `user:${id}`)
      return { ok: true }
    case 'resetLink': {
      const link = await createAdminLink(admin, { kind: 'reset', userId: id, email: u.email })
      return { ...link, url: `${getRequestURL(event).origin}${link.path}` }
    }
  }
})
