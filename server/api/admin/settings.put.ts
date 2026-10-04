import { z } from 'zod'
import { eq } from 'drizzle-orm'

const Body = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  intro: z.string().max(4000).optional(),
  legal: z.string().max(20000).optional(),
  privacy: z.string().max(20000).optional(),
  contactEmail: z.string().max(200).optional(),
  pivotMode: z.enum(['fixed', 'sliding']).optional(),
  pivotYear: z.number().int().min(1900).max(2200).optional(),
  pivotOffset: z.number().int().min(0).max(50).optional(),
  switchMonth: z.number().int().min(1).max(12).optional(),
  branches: z.array(z.object({ key: z.string().trim().min(1).max(10), label: z.string().trim().min(1).max(60), color: z.string().optional() })).min(1).optional(),
  eventTypes: z.array(z.string().trim().min(1).max(60)).min(1).optional(),
  settings: z.object({
    publicDownloads: z.boolean(),
    keepOriginals: z.boolean(),
    quotaBytes: z.number().int().min(0),
    familySessionDays: z.number().int().min(1).max(365),
    takedownDelayDays: z.number().int().min(1).max(60),
    peopleField: z.boolean(),
    streamEnabled: z.boolean(),
    streamAccountId: z.string().max(100).optional(),
    streamApiToken: z.string().max(200).optional(),
    statsEnabled: z.boolean(),
  }).partial().optional(),
})

// A-12 / A-13 : identité, pivot, taxonomie (owner pour les réglages techniques)
export default defineEventHandler(async (event) => {
  const body = await readValid(event, Body)
  const technical = body.settings && Object.keys(body.settings).some(k => ['keepOriginals', 'quotaBytes', 'streamEnabled', 'streamAccountId', 'streamApiToken'].includes(k))
  const admin = await requireAdmin(event, technical ? 'owner' : 'editor')
  const inst = await getInstance()
  const patch: Record<string, unknown> = { updatedAt: Date.now() }
  for (const k of ['name', 'primaryColor', 'intro', 'legal', 'privacy', 'contactEmail', 'pivotMode', 'pivotYear', 'pivotOffset', 'switchMonth', 'branches', 'eventTypes'] as const) {
    if (body[k] !== undefined) patch[k] = body[k]
  }
  if (body.settings) {
    const s = { ...inst.settings, ...body.settings }
    if (body.settings.streamApiToken === '') s.streamApiToken = inst.settings.streamApiToken
    patch.settings = s
  }
  await db.update(schema.instance).set(patch).where(eq(schema.instance.id, inst.id))
  invalidateInstanceCache()
  const pivotKeys = ['pivotMode', 'pivotYear', 'pivotOffset', 'switchMonth']
  const pivotChanged = pivotKeys.some(k => k in patch && (patch as any)[k] !== (inst as any)[k])
  const redact = (o: any) => o?.settings?.streamApiToken ? { ...o, settings: { ...o.settings, streamApiToken: '***' } } : o
  await audit(admin, pivotChanged ? 'instance.pivot' : 'instance.settings', `instance:${inst.id}`,
    redact(Object.fromEntries(Object.keys(patch).map(k => [k, (inst as any)[k]]))), redact(patch))
  return { ok: true }
})
