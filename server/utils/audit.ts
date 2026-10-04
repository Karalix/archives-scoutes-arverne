import type { Actor } from './auth'

/** Journal d'audit (A-17, I-03). */
export async function audit(actor: Actor | 'system', action: string, target: string | null, before?: unknown, after?: unknown) {
  await db.insert(schema.auditLog).values({
    id: newId(),
    instanceId: instanceId(),
    actor: actor === 'system' ? 'system' : actor.label,
    actorName: actor === 'system' ? 'Système' : actor.name,
    action,
    target,
    before: before ?? null,
    after: after ?? null,
    createdAt: Date.now(),
  })
}
