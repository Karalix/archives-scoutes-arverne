import { z } from 'zod'
import { eq } from 'drizzle-orm'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), size: z.number().int().positive(), filename: z.string().max(300) }),
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('detach') }),
])

// D-07 : envoi d'une vidéo vers Cloudflare Stream (tus direct depuis le navigateur)
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'contributor')
  const id = getRouterParam(event, 'id')!
  const body = await readValid(event, Body)
  const doc = await loadWritableDoc(admin, id)
  if (doc.kind !== 'video') throw problem(422, 'Seules les vidéos passent par Cloudflare Stream')
  const inst = await getInstance()
  if (body.action === 'create') {
    const r = await createStreamUpload(inst, body.size, `${doc.title} (${doc.id})`)
    await db.update(schema.document).set({ streamUid: r.uid, updatedAt: Date.now() }).where(eq(schema.document.id, id))
    await audit(admin, 'document.stream_upload', `document:${id}`, null, { uid: r.uid })
    return r
  }
  if (!doc.streamUid) throw problem(404, 'Aucune vidéo Stream rattachée')
  if (body.action === 'status') {
    const s = await streamStatus(inst, doc.streamUid)
    if (s.ready && !doc.duration) await db.update(schema.document).set({ duration: Math.round(s.duration), updatedAt: Date.now() }).where(eq(schema.document.id, id))
    return s
  }
  await deleteStreamVideo(inst, doc.streamUid).catch(() => {})
  await db.update(schema.document).set({ streamUid: null, updatedAt: Date.now() }).where(eq(schema.document.id, id))
  await audit(admin, 'document.stream_detach', `document:${id}`)
  return { ok: true }
})
