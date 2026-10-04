import type { H3Event } from 'h3'

// StorageDriver (8.3) : r2-binding en production, fs en développement et tests.
// L'abstraction reste mince : elle sert les tests, pas un portage vers d'autres hébergeurs.

export interface StoredObject {
  key: string
  size: number
  etag: string
  contentType?: string
  uploaded?: Date
}

export interface RangeRequest { offset: number, length?: number }

export interface GetResult extends StoredObject {
  body: ReadableStream
  range?: { offset: number, length: number }
}

export interface UploadedPart { partNumber: number, etag: string }

export interface StorageDriver {
  name: string
  put(key: string, body: ReadableStream | ArrayBuffer | Uint8Array | Blob | string, opts?: { contentType?: string }): Promise<StoredObject>
  get(key: string, range?: RangeRequest): Promise<GetResult | null>
  head(key: string): Promise<StoredObject | null>
  delete(keys: string | string[]): Promise<void>
  list(prefix: string, cursor?: string): Promise<{ objects: StoredObject[], cursor?: string }>
  createMultipart(key: string, opts?: { contentType?: string }): Promise<{ uploadId: string }>
  uploadPart(key: string, uploadId: string, partNumber: number, body: ReadableStream | ArrayBuffer | Uint8Array, size?: number): Promise<UploadedPart>
  completeMultipart(key: string, uploadId: string, parts: UploadedPart[]): Promise<StoredObject>
  abortMultipart(key: string, uploadId: string): Promise<void>
}

/* ------------------------------ R2 (binding) ------------------------------ */

interface R2Like {
  put: (key: string, value: any, opts?: any) => Promise<any>
  get: (key: string, opts?: any) => Promise<any>
  head: (key: string) => Promise<any>
  delete: (keys: string | string[]) => Promise<void>
  list: (opts?: any) => Promise<any>
  createMultipartUpload: (key: string, opts?: any) => Promise<any>
  resumeMultipartUpload: (key: string, uploadId: string) => any
}

function r2Obj(o: any): StoredObject {
  return { key: o.key, size: o.size, etag: o.httpEtag ?? `"${o.etag}"`, contentType: o.httpMetadata?.contentType, uploaded: o.uploaded }
}

export function r2Driver(bucket: R2Like): StorageDriver {
  return {
    name: 'r2-binding',
    async put(key, body, opts) {
      return r2Obj(await bucket.put(key, body, { httpMetadata: { contentType: opts?.contentType } }))
    },
    async get(key, range) {
      const o = await bucket.get(key, range ? { range: range.length !== undefined ? { offset: range.offset, length: range.length } : { offset: range.offset } } : undefined)
      if (!o || !('body' in o)) return null
      const r = o.range as { offset?: number, length?: number } | undefined
      return {
        ...r2Obj(o),
        body: o.body,
        range: range ? { offset: r?.offset ?? range.offset, length: r?.length ?? (o.size - range.offset) } : undefined,
      }
    },
    async head(key) {
      const o = await bucket.head(key)
      return o ? r2Obj(o) : null
    },
    async delete(keys) {
      await bucket.delete(keys)
    },
    async list(prefix, cursor) {
      const r = await bucket.list({ prefix, cursor, limit: 1000 })
      return { objects: r.objects.map(r2Obj), cursor: r.truncated ? r.cursor : undefined }
    },
    async createMultipart(key, opts) {
      const mpu = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: opts?.contentType } })
      return { uploadId: mpu.uploadId }
    },
    async uploadPart(key, uploadId, partNumber, body, size) {
      const mpu = bucket.resumeMultipartUpload(key, uploadId)
      // R2 exige une longueur connue : FixedLengthStream dans le Worker, sinon mise en mémoire (≤ 50 Mo)
      let value: any = body
      if (body instanceof ReadableStream) {
        if (size && typeof (globalThis as any).FixedLengthStream === 'function') {
          const fls = new (globalThis as any).FixedLengthStream(size)
          body.pipeTo(fls.writable)
          value = fls.readable
        }
        else {
          value = await new Response(body).arrayBuffer()
        }
      }
      const p = await mpu.uploadPart(partNumber, value)
      return { partNumber: p.partNumber, etag: p.etag }
    },
    async completeMultipart(key, uploadId, parts) {
      const mpu = bucket.resumeMultipartUpload(key, uploadId)
      return r2Obj(await mpu.complete(parts.sort((a, b) => a.partNumber - b.partNumber)))
    },
    async abortMultipart(key, uploadId) {
      await bucket.resumeMultipartUpload(key, uploadId).abort()
    },
  }
}

/* --------------------------- fs (développement) --------------------------- */

export function fsDriver(root: string): StorageDriver {
  // Imports dynamiques : jamais chargés dans le Worker
  const mods = async () => {
    const fs = await import('node:fs')
    const fsp = await import('node:fs/promises')
    const path = await import('node:path')
    const { Readable } = await import('node:stream')
    return { fs, fsp, path, Readable }
  }
  const safe = (path: any, key: string) => {
    const p = path.resolve(root, key)
    if (!p.startsWith(path.resolve(root))) throw new Error('clé invalide')
    return p
  }
  const toBuffer = async (body: any): Promise<Uint8Array> => {
    if (typeof body === 'string') return new TextEncoder().encode(body)
    if (body instanceof Uint8Array) return body
    if (body instanceof ArrayBuffer) return new Uint8Array(body)
    if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer())
    return new Uint8Array(await new Response(body).arrayBuffer())
  }
  const meta = async (fsp: any, p: string, key: string): Promise<StoredObject | null> => {
    try {
      const st = await fsp.stat(p)
      let contentType: string | undefined
      try { contentType = JSON.parse(await fsp.readFile(`${p}.meta.json`, 'utf8')).contentType }
      catch {}
      return { key, size: st.size, etag: `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`, contentType, uploaded: st.mtime }
    }
    catch { return null }
  }
  return {
    name: 'fs',
    async put(key, body, opts) {
      const { fsp, path } = await mods()
      const p = safe(path, key)
      await fsp.mkdir(path.dirname(p), { recursive: true })
      await fsp.writeFile(p, await toBuffer(body))
      if (opts?.contentType) await fsp.writeFile(`${p}.meta.json`, JSON.stringify({ contentType: opts.contentType }))
      return (await meta(fsp, p, key))!
    },
    async get(key, range) {
      const { fs, fsp, path, Readable } = await mods()
      const p = safe(path, key)
      const m = await meta(fsp, p, key)
      if (!m) return null
      const start = range?.offset ?? 0
      const end = range?.length !== undefined ? start + range.length - 1 : m.size - 1
      const stream = fs.createReadStream(p, { start, end: Math.max(start, end) })
      return { ...m, body: Readable.toWeb(stream) as ReadableStream, range: range ? { offset: start, length: end - start + 1 } : undefined }
    },
    async head(key) {
      const { fsp, path } = await mods()
      return meta(fsp, safe(path, key), key)
    },
    async delete(keys) {
      const { fsp, path } = await mods()
      for (const k of [keys].flat()) {
        await fsp.rm(safe(path, k), { force: true })
        await fsp.rm(`${safe(path, k)}.meta.json`, { force: true })
      }
    },
    async list(prefix) {
      const { fsp, path } = await mods()
      const out: StoredObject[] = []
      const walk = async (dir: string) => {
        let entries: any[] = []
        try { entries = await fsp.readdir(dir, { withFileTypes: true }) }
        catch { return }
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) {
            if (e.name !== '.multipart') await walk(full)
          }
          else if (!e.name.endsWith('.meta.json')) {
            const key = path.relative(root, full).split(path.sep).join('/')
            if (key.startsWith(prefix)) out.push((await meta(fsp, full, key))!)
          }
        }
      }
      await walk(root)
      return { objects: out }
    },
    async createMultipart(key, opts) {
      const { fsp, path } = await mods()
      const uploadId = newId()
      const dir = path.join(root, '.multipart', uploadId)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(path.join(dir, 'info.json'), JSON.stringify({ key, contentType: opts?.contentType }))
      return { uploadId }
    },
    async uploadPart(_key, uploadId, partNumber, body) {
      const { fsp, path } = await mods()
      const buf = await toBuffer(body)
      await fsp.writeFile(path.join(root, '.multipart', uploadId, `part-${partNumber}`), buf)
      return { partNumber, etag: `${partNumber}-${buf.byteLength}` }
    },
    async completeMultipart(key, uploadId, parts) {
      const { fs, fsp, path } = await mods()
      const dir = path.join(root, '.multipart', uploadId)
      const info = JSON.parse(await fsp.readFile(path.join(dir, 'info.json'), 'utf8'))
      const p = safe(path, key)
      await fsp.mkdir(path.dirname(p), { recursive: true })
      const out = fs.createWriteStream(p)
      for (const part of parts.sort((a, b) => a.partNumber - b.partNumber)) {
        await new Promise<void>((res, rej) => {
          const rs = fs.createReadStream(path.join(dir, `part-${part.partNumber}`))
          rs.on('error', rej)
          rs.on('end', () => res())
          rs.pipe(out, { end: false })
        })
      }
      await new Promise<void>(res => out.end(() => res()))
      if (info.contentType) await fsp.writeFile(`${p}.meta.json`, JSON.stringify({ contentType: info.contentType }))
      await fsp.rm(dir, { recursive: true, force: true })
      return (await meta(fsp, p, key))!
    },
    async abortMultipart(_key, uploadId) {
      const { fsp, path } = await mods()
      await fsp.rm(path.join(root, '.multipart', uploadId), { recursive: true, force: true })
    },
  }
}

/* ------------------------------- Sélection -------------------------------- */

let devDriver: StorageDriver | null = null

export function useStorageDriver(event?: H3Event): StorageDriver {
  const env = (event?.context as any)?.cloudflare?.env ?? (globalThis as any).__env__
  const bucket = env?.BLOB ?? (globalThis as any).BLOB
  if (bucket && typeof bucket.createMultipartUpload === 'function') return r2Driver(bucket)
  if (!devDriver) devDriver = fsDriver(process.env.STORAGE_DIR || '.data/storage')
  return devDriver
}

/** Clés opaques (S-01) : instance + identifiant de document, jamais l'année ni le titre. */
export function storageKey(documentId: string, variant: string, ext = '') {
  const base = variant === 'original' ? `${instanceId()}/originals/${documentId}` : `${instanceId()}/docs/${documentId}/${variant}`
  return ext ? `${base}.${ext}` : base
}
