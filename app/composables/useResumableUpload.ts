import type { FileVariant } from '~/composables/useAdmin'

// T-04 / A-06 : téléversement multipart reprenable (parties de 50 Mo, 3 en parallèle)

export const DIRECT_MAX = 50 * 1024 * 1024
const PARALLEL = 3
const MAX_ATTEMPTS = 8

interface UploadDescription {
  id: string
  status: 'pending' | 'completed' | 'aborted'
  size: number
  partSize: number
  partCount: number
  received: number[]
  missing: number[]
  partUrls?: { partNumber: number, url: string }[]
}

export interface FileMeta { duration?: number, width?: number, height?: number }

export interface UploadOptions {
  documentId: string
  variant: FileVariant
  blob: Blob
  filename: string
  mime: string
  meta?: FileMeta
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export interface UploadResult { ok: boolean, documentId: string, variant: string, size: number, mime: string | null, warnings: string[] }

/** Erreur HTTP lisible, avec le corps problem+json (I-10) quand il existe. */
export class UploadError extends Error {
  constructor(message: string, public status: number, public data: Record<string, any> | null = null) {
    super(message)
  }
}

const storeKey = (o: { documentId: string, variant: string, blob: Blob }) => `upload:${o.documentId}:${o.variant}:${o.blob.size}`

function readStore(key: string): string | null {
  try { return localStorage.getItem(key) }
  catch { return null }
}
function writeStore(key: string, v: string | null) {
  try {
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  }
  catch { /* stockage indisponible : la reprise après rechargement ne sera pas possible */ }
}

/** Un téléversement interrompu est-il mémorisé pour ce document et cette taille ? */
export function hasPendingUpload(documentId: string, variant: FileVariant, size: number) {
  return !!readStore(`upload:${documentId}:${variant}:${size}`)
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Annulé', 'AbortError')) }, { once: true })
})

/** PUT via XMLHttpRequest pour suivre la progression de l'envoi. */
export function xhrPut(url: string, body: Blob, opts: { contentType?: string, onProgress?: (loaded: number) => void, signal?: AbortSignal } = {}) {
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.withCredentials = true
    if (opts.contentType) xhr.setRequestHeader('Content-Type', opts.contentType)
    xhr.upload.onprogress = e => opts.onProgress?.(e.loaded)
    xhr.onload = () => {
      let data: any = null
      try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null }
      catch { data = null }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new UploadError(data?.detail || data?.title || `Erreur HTTP ${xhr.status}`, xhr.status, data))
    }
    xhr.onerror = () => reject(new UploadError('Connexion interrompue', 0))
    xhr.ontimeout = () => reject(new UploadError('Délai dépassé', 0))
    xhr.onabort = () => reject(new DOMException('Annulé', 'AbortError'))
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

function toUploadError(e: unknown): UploadError {
  if (e instanceof UploadError) return e
  const f = e as { statusCode?: number, data?: Record<string, any>, message?: string }
  return new UploadError(f?.data?.detail || f?.message || 'Erreur', f?.statusCode ?? 0, f?.data ?? null)
}

/** Envoi direct (≤ 50 Mo) : PUT /api/v1/documents/:id/files/:variant (I-09). */
export async function directUpload(o: UploadOptions): Promise<UploadResult> {
  const qs = new URLSearchParams({ filename: o.filename })
  if (o.meta?.duration) qs.set('duration', String(Math.round(o.meta.duration)))
  if (o.meta?.width) qs.set('width', String(o.meta.width))
  if (o.meta?.height) qs.set('height', String(o.meta.height))
  const url = `/api/v1/documents/${o.documentId}/files/${o.variant}?${qs}`
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await xhrPut(url, o.blob, { contentType: o.mime || 'application/octet-stream', signal: o.signal, onProgress: l => o.onProgress?.(l / o.blob.size) })
      o.onProgress?.(1)
      return r
    }
    catch (e) {
      if (!(e instanceof UploadError) || e.status !== 0 || attempt >= MAX_ATTEMPTS) throw e
      await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)), o.signal)
    }
  }
}

/** Téléversement multipart reprenable : seules les parties manquantes sont envoyées. */
export async function resumableUpload(o: UploadOptions): Promise<UploadResult> {
  if (o.blob.size <= DIRECT_MAX) return directUpload(o)
  const key = storeKey(o)
  let desc: UploadDescription | null = null

  const saved = readStore(key)
  if (saved) {
    desc = await $fetch<UploadDescription>(`/api/uploads/${saved}`).catch(() => null)
    if (!desc || desc.status !== 'pending' || desc.size !== o.blob.size) desc = null
  }
  if (!desc) {
    try {
      desc = await $fetch<UploadDescription>('/api/uploads', {
        method: 'POST',
        body: { documentId: o.documentId, variant: o.variant, filename: o.filename, size: o.blob.size, mime: o.mime || 'application/octet-stream' },
      })
    }
    catch (e) { throw toUploadError(e) }
    writeStore(key, desc.id)
  }
  const id = desc.id
  const partSize = desc.partSize
  const partLen = (n: number) => Math.min(partSize, o.blob.size - (n - 1) * partSize)

  const loaded = new Map<number, number>()
  const report = () => {
    let sum = 0
    for (const v of loaded.values()) sum += v
    o.onProgress?.(Math.min(1, sum / o.blob.size))
  }

  for (let round = 0; round < 3; round++) {
    const urls = new Map((desc.partUrls ?? []).map(p => [p.partNumber, p.url]))
    for (const n of desc.received) loaded.set(n, partLen(n))
    report()

    let refreshing: Promise<void> | null = null
    const refreshUrls = () => {
      refreshing ??= $fetch<UploadDescription>(`/api/uploads/${id}`).then((d) => {
        for (const p of d.partUrls ?? []) urls.set(p.partNumber, p.url)
      }).finally(() => { refreshing = null })
      return refreshing
    }

    const queue = [...desc.missing]
    const worker = async () => {
      while (queue.length) {
        const n = queue.shift()!
        const start = (n - 1) * partSize
        const chunk = o.blob.slice(start, start + partLen(n))
        for (let attempt = 1; ; attempt++) {
          if (o.signal?.aborted) throw new DOMException('Annulé', 'AbortError')
          try {
            const url = urls.get(n) ?? `/api/uploads/${id}/parts/${n}`
            await xhrPut(url, chunk, { signal: o.signal, onProgress: (l) => { loaded.set(n, l); report() } })
            loaded.set(n, chunk.size)
            report()
            break
          }
          catch (e) {
            if (!(e instanceof UploadError)) throw e
            loaded.set(n, 0)
            if (e.status === 403) {
              // URL signée expirée : nouvelles URL
              if (attempt >= MAX_ATTEMPTS) throw e
              await refreshUrls().catch(() => {})
              continue
            }
            if ((e.status === 0 || e.status >= 500) && attempt < MAX_ATTEMPTS) {
              // Connexion coupée : nouvel essai avec délai croissant
              await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)), o.signal)
              continue
            }
            throw e
          }
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, Math.max(1, queue.length)) }, worker))

    try {
      const r = await $fetch<UploadResult>(`/api/uploads/${id}/complete`, { method: 'POST', body: o.meta ?? {} })
      writeStore(key, null)
      o.onProgress?.(1)
      return r
    }
    catch (e) {
      const err = toUploadError(e)
      if (err.status === 409 && Array.isArray(err.data?.missing)) {
        desc = await $fetch<UploadDescription>(`/api/uploads/${id}`)
        continue
      }
      // Fichier refusé (422, 415…) : le téléversement est consommé côté serveur
      if (err.status >= 400 && err.status < 500) writeStore(key, null)
      throw err
    }
  }
  throw new UploadError('Parties manquantes après plusieurs essais', 409)
}
