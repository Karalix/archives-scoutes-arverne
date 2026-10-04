import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'editor')
  const form = await readMultipartFormData(event)
  const file = form?.find(f => f.name === 'file')
  if (!file?.data) throw problem(400, 'Fichier manquant')
  if (file.data.byteLength > 2 * 1024 * 1024) throw problem(413, 'Logo limité à 2 Mo')
  const type = sniffType(file.data)
  if (!type || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) throw problem(415, 'Logo PNG, JPEG ou WebP uniquement')
  const key = `${instanceId()}/site/logo`
  await useStorageDriver(event).put(key, file.data, { contentType: type })
  await db.update(schema.instance).set({ logoKey: key, updatedAt: Date.now() }).where(eq(schema.instance.id, instanceId()))
  invalidateInstanceCache()
  await audit(admin, 'instance.logo', `instance:${instanceId()}`)
  return { ok: true }
})
