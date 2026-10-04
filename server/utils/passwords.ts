import { and, eq, isNull } from 'drizzle-orm'
import type { Actor } from './auth'

/** R-07 : stockage en haché (scrypt), jamais en clair. Renvoie le mot de passe normalisé, affiché une seule fois. */
export async function createAccessPassword(actor: Actor, scoutYear: number, plain: string) {
  const normalized = normalizePassphrase(plain)
  if (normalized.length < 8) throw problem(422, 'Mot de passe trop court (8 caractères minimum)')
  const lookup = await passwordLookup(normalized)
  const dup = await db.query.accessPassword.findFirst({ where: and(eq(schema.accessPassword.lookup, lookup), isNull(schema.accessPassword.revokedAt)) })
  if (dup) throw problem(409, 'Ce mot de passe existe déjà')
  const row = {
    id: newId(), instanceId: instanceId(), scoutYear, lookup, hash: await hashPassword(normalized),
    createdAt: Date.now(), createdBy: actor.label, revokedAt: null, useCount: 0, lastUsedAt: null,
  }
  await db.insert(schema.accessPassword).values(row)
  await audit(actor, 'password.create', `password:${row.id}`, null, { scoutYear })
  return { id: row.id, scoutYear, password: normalized }
}
