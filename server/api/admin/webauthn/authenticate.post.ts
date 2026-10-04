import { eq } from 'drizzle-orm'

// A-01 : connexion par passkey
export default defineWebAuthnAuthenticateEventHandler({
  async storeChallenge(_event, challenge, attemptId) {
    await kvSet(`webauthn:${attemptId}`, challenge, 5 * 60_000)
  },
  async getChallenge(_event, attemptId) {
    const c = await kvGet(`webauthn:${attemptId}`)
    if (!c) throw problem(400, 'Défi expiré')
    await kvDel(`webauthn:${attemptId}`)
    return c
  },
  async getCredential(_event, credentialID) {
    const k = await db.query.passkey.findFirst({ where: eq(schema.passkey.id, credentialID) })
    if (!k) throw problem(401, 'Passkey inconnue')
    return { id: k.id, publicKey: k.publicKey, counter: k.counter, backedUp: k.backedUp, transports: (k.transports ?? []) as any }
  },
  async onSuccess(event, { credential, authenticationInfo }) {
    const k = await db.query.passkey.findFirst({ where: eq(schema.passkey.id, credential.id) })
    const u = k && await db.query.adminUser.findFirst({ where: eq(schema.adminUser.id, k.userId) })
    if (!u || u.disabledAt) throw problem(401, 'Compte désactivé')
    await db.update(schema.passkey).set({ counter: authenticationInfo.newCounter }).where(eq(schema.passkey.id, credential.id))
    await openAdminSession(event, u)
  },
})
