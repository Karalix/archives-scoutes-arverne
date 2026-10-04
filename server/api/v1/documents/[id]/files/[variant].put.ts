// I-09 : envoi direct jusqu'à 50 Mo (au-delà : multipart /api/uploads)
export default defineEventHandler(async (event) => {
  const actor = await requireActor(event, 'write')
  const variant = parseValid(getRouterParam(event, 'variant'), zVariant)
  const doc = await loadWritableDoc(actor, getRouterParam(event, 'id')!)
  const len = Number(getHeader(event, 'content-length'))
  if (!len) throw problem(411, 'En-tête Content-Length requis')
  if (len > DIRECT_MAX) throw problem(413, 'Fichier > 50 Mo', { hint: 'Utilisez le téléversement multipart : POST /api/uploads' })
  checkVariantSize(doc.kind, variant, len)
  await checkQuota(len)
  const inst = await getInstance()
  if (variant === 'original' && !inst.settings.keepOriginals) throw problem(409, 'Conservation des originaux désactivée (V-04)')
  const q = getQuery(event)
  const filename = String(q.filename ?? `${variant}`)
  const ext = variant === 'original' ? (filename.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : ''
  const key = storageKey(doc.id, variant, ext)
  const body = await readRawBody(event, false)
  if (!body) throw problem(400, 'Corps vide')
  await useStorageDriver(event).put(key, body as unknown as Uint8Array, { contentType: getHeader(event, 'content-type') || 'application/octet-stream' })
  const meta = parseValid({
    duration: q.duration ? Number(q.duration) : undefined,
    width: q.width ? Number(q.width) : undefined,
    height: q.height ? Number(q.height) : undefined,
  }, FileMetaInput)
  return finalizeFile(event, actor, doc, variant, key, filename, meta)
})
