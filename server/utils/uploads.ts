import type { H3Event } from 'h3'
import { and, eq, sql } from 'drizzle-orm'
import type { Actor } from './auth'

export const PART_SIZE = 50 * 1024 * 1024 // S-03 / T-04 : 50 Mo
export const DIRECT_MAX = 50 * 1024 * 1024 // I-09 : envoi direct jusqu'à 50 Mo
export type FileVariant = 'main' | 'thumb' | 'captions' | 'original'
export const FILE_VARIANTS: FileVariant[] = ['main', 'thumb', 'captions', 'original']

const FIELD: Record<FileVariant, 'storageKey' | 'thumbKey' | 'captionsKey' | 'originalKey'> = {
  main: 'storageKey', thumb: 'thumbKey', captions: 'captionsKey', original: 'originalKey',
}

export async function loadWritableDoc(actor: Actor, documentId: string) {
  const doc = await db.query.document.findFirst({ where: and(eq(schema.document.id, documentId), eq(schema.document.instanceId, instanceId())) })
  if (!doc) throw problem(404, `Document ${documentId} introuvable`, { hint: 'Créez d\'abord le document (POST /api/v1/documents), puis envoyez ses fichiers.' })
  if (doc.status === 'trashed') throw problem(409, 'Document dans la corbeille')
  if (doc.status === 'published' && actor.role === 'contributor') throw problem(403, 'Un contributeur ne remplace pas les fichiers d\'un document publié')
  return doc
}

export function checkVariantSize(kind: string, variant: FileVariant, size: number) {
  const limit = variant === 'main' || variant === 'original' ? SIZE_LIMITS[kind] : SIZE_LIMITS[variant]
  if (limit && size > limit) throw problem(413, `Fichier trop volumineux (${formatBytes(size)} > ${formatBytes(limit)})`)
}

export async function checkQuota(extra: number) {
  const inst = await getInstance()
  const quota = inst.settings.quotaBytes
  if (!quota) return
  const { bytes } = await storageUsage()
  if (bytes + extra > quota) throw problem(413, `Quota de stockage atteint (${formatBytes(bytes)} / ${formatBytes(quota)})`, { hint: 'Un propriétaire peut relever le quota dans Paramètres.' })
}

export async function createUpload(event: H3Event, actor: Actor, input: { documentId: string, variant: FileVariant, filename: string, size: number, mime: string }) {
  const doc = await loadWritableDoc(actor, input.documentId)
  const inst = await getInstance()
  if (input.variant === 'original' && !inst.settings.keepOriginals) throw problem(409, 'Conservation des originaux désactivée (V-04)')
  checkVariantSize(doc.kind, input.variant, input.size)
  await checkQuota(input.size)
  const ext = input.variant === 'original' ? (input.filename.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : ''
  const key = storageKey(doc.id, input.variant, ext)
  const storage = useStorageDriver(event)
  const { uploadId } = await storage.createMultipart(key, { contentType: input.mime })
  const ts = Date.now()
  const row = {
    id: newId(), instanceId: instanceId(), documentId: doc.id, variant: input.variant, storageKey: key, uploadId,
    filename: input.filename, mime: input.mime, size: input.size, partSize: PART_SIZE, parts: [], status: 'pending' as const,
    createdBy: actor.label, createdAt: ts, updatedAt: ts,
  }
  await db.insert(schema.upload).values(row)
  return describeUpload(row, true)
}

type UploadRow = typeof schema.upload.$inferSelect

export function receivedParts(u: UploadRow) {
  // Dédoublonnage : la dernière réception d'une partie l'emporte
  const map = new Map<number, string>()
  for (const p of u.parts) map.set(p.partNumber, p.etag)
  return [...map.entries()].map(([partNumber, etag]) => ({ partNumber, etag })).sort((a, b) => a.partNumber - b.partNumber)
}

export async function describeUpload(u: UploadRow, withUrls = false) {
  const partCount = Math.max(1, Math.ceil(u.size / u.partSize))
  const received = receivedParts(u).map(p => p.partNumber)
  const missing = Array.from({ length: partCount }, (_, i) => i + 1).filter(n => !received.includes(n))
  return {
    id: u.id,
    documentId: u.documentId,
    variant: u.variant,
    status: u.status,
    size: u.size,
    partSize: u.partSize,
    partCount,
    received,
    missing,
    // I-12 / I-13 : URL signées (15 min) que l'agent alimente avec curl
    partUrls: withUrls ? await Promise.all(missing.map(async n => ({ partNumber: n, url: await signUploadPartUrl(u.id, n), method: 'PUT' }))) : undefined,
  }
}

export async function getUpload(id: string) {
  const u = await db.query.upload.findFirst({ where: and(eq(schema.upload.id, id), eq(schema.upload.instanceId, instanceId())) })
  if (!u) throw problem(404, 'Téléversement introuvable')
  return u
}

export async function receivePart(event: H3Event, u: UploadRow, partNumber: number) {
  if (u.status !== 'pending') throw problem(409, `Téléversement ${u.status === 'completed' ? 'déjà finalisé' : 'annulé'}`)
  const partCount = Math.max(1, Math.ceil(u.size / u.partSize))
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) throw problem(400, `Numéro de partie invalide (1 à ${partCount})`)
  const expected = partNumber < partCount ? u.partSize : u.size - u.partSize * (partCount - 1)
  const len = Number(getHeader(event, 'content-length'))
  if (len && len !== expected) throw problem(400, `Taille de partie incorrecte : ${len} octets reçus, ${expected} attendus`)
  const body = getRequestWebStream(event)
  if (!body) throw problem(400, 'Corps vide')
  const part = await useStorageDriver(event).uploadPart(u.storageKey, u.uploadId, partNumber, body, expected)
  // Ajout atomique (plusieurs parties peuvent arriver en parallèle)
  await db.run(sql`UPDATE upload SET parts = json_insert(parts, '$[#]', json(${JSON.stringify(part)})), updated_at = ${Date.now()} WHERE id = ${u.id}`)
  return part
}

export interface FileMeta { duration?: number, width?: number, height?: number, chapters?: { start: number, title: string }[] }

export async function completeUpload(event: H3Event, actor: Actor, u: UploadRow, meta: FileMeta = {}) {
  if (u.status !== 'pending') throw problem(409, 'Téléversement déjà finalisé ou annulé')
  const parts = receivedParts(u)
  const partCount = Math.max(1, Math.ceil(u.size / u.partSize))
  if (parts.length !== partCount) {
    const missing = Array.from({ length: partCount }, (_, i) => i + 1).filter(n => !parts.some(p => p.partNumber === n))
    throw problem(409, `Parties manquantes : ${missing.join(', ')}`, { missing, hint: `GET /api/uploads/${u.id} renvoie les URL des parties restantes.` })
  }
  const storage = useStorageDriver(event)
  await storage.completeMultipart(u.storageKey, u.uploadId, parts)
  await db.update(schema.upload).set({ status: 'completed', updatedAt: Date.now() }).where(eq(schema.upload.id, u.id))
  const doc = await loadWritableDoc(actor, u.documentId)
  return finalizeFile(event, actor, doc, u.variant as FileVariant, u.storageKey, u.filename, meta)
}

/** Vérifie le fichier stocké (type réel, conformité vidéo) et l'attache au document. */
export async function finalizeFile(event: H3Event, actor: Actor, doc: typeof schema.document.$inferSelect, variant: FileVariant, key: string, filename: string, meta: FileMeta) {
  const storage = useStorageDriver(event)
  const head = await storage.head(key)
  if (!head) throw problem(500, 'Fichier introuvable après envoi')
  const read = async (offset: number, length: number) => {
    const r = await storage.get(key, { offset, length: Math.min(length, head.size - offset) })
    return new Uint8Array(await new Response(r!.body).arrayBuffer())
  }
  const first = await read(0, Math.min(64, head.size))
  const sniffed = sniffType(first)
  const allowed = VARIANT_TYPES[doc.kind]?.[variant] ?? []
  const reject = async (status: number, msg: string, extra: Record<string, unknown> = {}) => {
    await storage.delete(key)
    return problem(status, msg, extra)
  }
  if (variant !== 'original' && (!sniffed || !allowed.includes(sniffed))) {
    throw await reject(415, `Type de fichier ${sniffed ?? 'inconnu'} refusé pour « ${variant} » d'un document ${doc.kind}`, {
      hint: doc.kind === 'video' && variant === 'main' ? `Ré-encodez en MP4 H.264 : ${ffmpegCommand(filename)}` : `Types acceptés : ${allowed.join(', ')}`,
    })
  }
  if (sniffed === 'text/html') throw await reject(415, 'HTML/SVG refusé (L-13)')

  const patch: Partial<typeof schema.document.$inferSelect> = { updatedAt: Date.now() }
  let warnings: string[] = []
  if (variant === 'main') {
    patch.mime = sniffed!
    patch.size = head.size
    if (doc.kind === 'video') {
      const info = await analyzeMp4(read, head.size)
      const c = videoCompliance(info)
      if (!c.ok) {
        // I-09 : refus avec la commande ffmpeg exacte
        throw await reject(422, `Vidéo non conforme : ${c.problems.join(' ; ')}`, {
          problems: c.problems,
          ffmpeg: ffmpegCommand(filename, filename.replace(/\.[^.]+$/, '') + '_720p.mp4'),
          hint: `Encodez localement : ${ffmpegCommand(filename, filename.replace(/\.[^.]+$/, '') + '_720p.mp4')} puis renvoyez le fichier.`,
        })
      }
      patch.duration = Math.round(info.duration ?? meta.duration ?? 0) || null
      patch.width = info.width ?? meta.width ?? null
      patch.height = info.height ?? meta.height ?? null
      if (!doc.thumbKey) warnings.push(`Aucune vignette : envoyez-en une (variant thumb), par ex. ${ffmpegThumbCommand(filename, Math.round((patch.duration ?? 100) * 0.1))}`)
    }
    else {
      if (meta.duration) patch.duration = Math.round(meta.duration)
      if (meta.width) patch.width = meta.width
      if (meta.height) patch.height = meta.height
    }
    if (meta.chapters) patch.chapters = meta.chapters
  }
  if (variant === 'original') patch.originalSize = head.size
  const field = FIELD[variant]
  const previous = doc[field]
  ;(patch as any)[field] = key
  await db.update(schema.document).set(patch).where(eq(schema.document.id, doc.id))
  if (previous && previous !== key) await storage.delete(previous).catch(() => {})
  await audit(actor, 'document.file', `document:${doc.id}`, null, { variant, size: head.size, mime: sniffed })
  warnings = warnings.filter(Boolean)
  return { ok: true, documentId: doc.id, variant, size: head.size, mime: sniffed, warnings }
}

export async function abortUpload(event: H3Event, u: UploadRow) {
  if (u.status === 'pending') await useStorageDriver(event).abortMultipart(u.storageKey, u.uploadId).catch(() => {})
  await db.update(schema.upload).set({ status: 'aborted', updatedAt: Date.now() }).where(eq(schema.upload.id, u.id))
}

