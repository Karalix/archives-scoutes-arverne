import { eq } from 'drizzle-orm'

// A-01 : ajout d'une passkey au compte connecté
export default defineWebAuthnRegisterEventHandler({
  async validateUser(userBody, event) {
    const admin = await requireAdmin(event)
    if (userBody.userName !== admin.email) throw problem(400, 'Utilisateur incohérent')
    return { userName: admin.email, displayName: admin.name }
  },
  async excludeCredentials(event) {
    const admin = await requireAdmin(event)
    const keys = await db.select().from(schema.passkey).where(eq(schema.passkey.userId, admin.userId))
    return keys.map(k => ({ id: k.id, transports: (k.transports ?? []) as any }))
  },
  async storeChallenge(_event, challenge, attemptId) {
    await kvSet(`webauthn:${attemptId}`, challenge, 5 * 60_000)
  },
  async getChallenge(_event, attemptId) {
    const c = await kvGet(`webauthn:${attemptId}`)
    if (!c) throw problem(400, 'Défi expiré')
    await kvDel(`webauthn:${attemptId}`)
    return c
  },
  async onSuccess(event, { credential }) {
    const admin = await requireAdmin(event)
    await db.insert(schema.passkey).values({
      id: credential.id, userId: admin.userId, publicKey: credential.publicKey, counter: credential.counter,
      backedUp: credential.backedUp, transports: credential.transports ?? [], name: 'Passkey', createdAt: Date.now(),
    })
    await audit(admin, 'passkey.add', `user:${admin.userId}`)
  },
})
