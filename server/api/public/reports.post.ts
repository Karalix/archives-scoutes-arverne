import { z } from 'zod'

const Body = z.object({
  documentId: z.string().min(10).max(40),
  kind: z.enum(['takedown', 'error', 'other']),
  message: z.string().trim().min(5).max(2000),
  contact: z.string().trim().max(200).optional().default(''),
  website: z.string().optional(), // pot de miel anti-spam
  elapsed: z.number().optional(), // temps passé sur le formulaire (ms)
})

// F-12 : signalement / demande de retrait, sans e-mail envoyé
export default defineEventHandler(async (event) => {
  const body = await readValid(event, Body)
  if (body.website || (body.elapsed !== undefined && body.elapsed < 2500)) return { ok: true } // spam silencieusement ignoré
  await rateLimit(event, `report:${await ipHash(event)}`, { limit: 5, windowMs: 3600_000 })
  const doc = await db.query.document.findFirst({ where: (d, { eq }) => eq(d.id, body.documentId) })
  if (!doc) throw problem(404, 'Document introuvable')
  await db.insert(schema.report).values({
    id: newId(), instanceId: instanceId(), documentId: body.documentId, kind: body.kind,
    message: body.message, contact: body.contact, ipHash: await ipHash(event), createdAt: Date.now(),
  })
  return { ok: true }
})
