import type { H3Event } from 'h3'
import { and, eq, isNull, sql } from 'drizzle-orm'

export async function passwordLookup(normalized: string) {
  return hmac(signingKey(), `pw:${normalized}`)
}

/** Ouvre une session famille (R-09) : cookie chiffré httpOnly avec maxYear et expiration. */
export async function openFamilySession(event: H3Event, pw: { id: string, scoutYear: number }, expiresAt?: number) {
  const inst = await getInstance()
  const days = inst.settings.familySessionDays || 30
  const session = await getUserSession(event)
  // Conserve la plus haute année déjà déverrouillée si elle est encore valide
  const current = session.family && session.family.expiresAt > Date.now() && session.family.maxYear > pw.scoutYear ? session.family : null
  const family = current ?? { maxYear: pw.scoutYear, passwordId: pw.id, expiresAt: expiresAt ?? Date.now() + days * 86400_000 }
  await setUserSession(event, { family })
  await db.update(schema.accessPassword)
    .set({ useCount: sql`${schema.accessPassword.useCount} + 1`, lastUsedAt: Date.now() })
    .where(eq(schema.accessPassword.id, pw.id))
  event.context.access = undefined
  return family
}

export async function closeFamilySession(event: H3Event) {
  const { family: _f, id: _id, ...rest } = await getUserSession(event) as any
  if (rest.user) await replaceUserSession(event, rest)
  else await clearUserSession(event)
}

export async function findActivePassword(normalized: string) {
  const lookup = await passwordLookup(normalized)
  return db.query.accessPassword.findFirst({
    where: and(eq(schema.accessPassword.instanceId, instanceId()), eq(schema.accessPassword.lookup, lookup), isNull(schema.accessPassword.revokedAt)),
  })
}
