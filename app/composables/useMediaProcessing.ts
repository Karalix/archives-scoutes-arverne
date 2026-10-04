import type { DocKind } from '#shared/utils/naming'

// Traitement des médias dans le navigateur avant envoi (6.3 voie 1, V-01, V-03, V-06, V-07, V-08)

export const PDF_MAX = 200 * 1024 ** 2 // V-07
export const AUDIO_MAX = 100 * 1024 ** 2 // V-08
const VIDEO_HEIGHT = 720
const VIDEO_BITRATE = 1_800_000
const AUDIO_BITRATE = 128_000

export interface ProcessedMedia {
  main: Blob
  mainName: string
  mainMime: string
  thumb: Blob | null
  meta: { duration?: number, width?: number, height?: number }
  /** Comment la vidéo a été traitée. */
  mode?: 'encoded' | 'remux' | 'as-is' | 'fallback'
  note?: string
}

export interface ProcessHooks {
  onStage?: (stage: 'analyse' | 'encodage', progress?: number) => void
  signal?: AbortSignal
}

export class MediaError extends Error {}

/* ------------------------------ Images ------------------------------ */

/** Canvas → WebP (repli JPEG si le navigateur n'encode pas le WebP, ex. Safari ancien). */
export async function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.82): Promise<Blob> {
  const toBlob = (type: string) => new Promise<Blob | null>(r => canvas.toBlob(r, type, quality))
  const webp = await toBlob('image/webp')
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob('image/jpeg')
  if (!jpeg) throw new MediaError('Impossible de générer l\'image')
  return jpeg
}

/** Redimensionne une source dessinable (côté le plus long ≤ max). Ne fait jamais d'agrandissement. */
export function drawScaled(src: CanvasImageSource & { width: number, height: number }, w: number, h: number, max: number, by: 'long' | 'width' = 'long') {
  const ratio = by === 'width' ? Math.min(1, max / w) : Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * ratio))
  canvas.height = Math.max(1, Math.round(h * ratio))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

const isHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/.test(f.type)

/** V-06 : 1 600 px (affichage) + 400 px (vignette) en WebP ; le redessin supprime l'EXIF (dont le GPS). */
export async function processPhoto(file: File): Promise<ProcessedMedia> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  catch {
    if (isHeic(file)) throw new MediaError('Photo HEIC non lisible par ce navigateur : exportez-la en JPEG (sur iPhone : Réglages → Appareil photo → Formats → « Le plus compatible »), ou utilisez Safari.')
    throw new MediaError('Image illisible ou format non pris en charge')
  }
  try {
    const main = await canvasToBlob(drawScaled(bmp, bmp.width, bmp.height, 1600), 0.85)
    const mainCanvasRatio = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const thumb = await canvasToBlob(drawScaled(bmp, bmp.width, bmp.height, 400), 0.8)
    const ext = main.type === 'image/webp' ? 'webp' : 'jpg'
    return {
      main,
      mainName: file.name.replace(/\.[^.]+$/, '') + '.' + ext,
      mainMime: main.type,
      thumb,
      meta: { width: Math.round(bmp.width * mainCanvasRatio), height: Math.round(bmp.height * mainCanvasRatio) },
    }
  }
  finally {
    bmp.close()
  }
}

/** Image importée → vignette 640 px de large. */
export async function imageToThumb(file: Blob, width = 640): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => { throw new MediaError('Image illisible') })
  try { return await canvasToBlob(drawScaled(bmp, bmp.width, bmp.height, width, 'width'), 0.8) }
  finally { bmp.close() }
}

/* ------------------------------ Vidéo : vignette ------------------------------ */

/** Image d'une balise <video> déjà positionnée → WebP 640 px. */
export function captureVideoFrame(video: HTMLVideoElement, width = 640) {
  if (!video.videoWidth) throw new MediaError('Image vidéo indisponible')
  return canvasToBlob(drawScaled(video, video.videoWidth, video.videoHeight, width, 'width'), 0.8)
}

/** V-03 : vignette extraite à 10 % de la durée. */
export async function videoThumbnail(blob: Blob, at = 0.1): Promise<Blob | null> {
  const url = URL.createObjectURL(blob)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('lecture impossible'))
      video.src = url
    })
    const t = Number.isFinite(video.duration) ? video.duration * at : 1
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('délai')), 15_000)
      video.onseeked = () => { clearTimeout(timer); resolve() }
      video.currentTime = t
    })
    // Laisse le décodeur peindre l'image
    await new Promise(r => requestAnimationFrame(() => r(null)))
    return await captureVideoFrame(video)
  }
  catch {
    return null
  }
  finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/* ------------------------------ Vidéo : encodage ------------------------------ */

/** L'index (moov) est-il en tête du fichier (faststart) ? Lecture des en-têtes de boîtes MP4. */
async function isFastStart(file: Blob) {
  let offset = 0
  for (let i = 0; i < 20 && offset + 8 <= file.size; i++) {
    const head = new DataView(await file.slice(offset, offset + 16).arrayBuffer())
    let size = head.getUint32(0)
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7))
    if (size === 1) size = Number(head.getBigUint64(8))
    if (type === 'moov') return true
    if (type === 'mdat') return false
    if (size < 8) return false
    offset += size
  }
  return false
}

export function webCodecsAvailable() {
  return typeof window !== 'undefined' && typeof (window as any).VideoEncoder !== 'undefined' && typeof (window as any).VideoDecoder !== 'undefined'
}

/**
 * V-01 : MP4 H.264 720p ~1,8 Mbit/s, AAC 128 kbit/s, faststart.
 * Source déjà conforme (H.264 ≤ 1080p ≤ 4 Mbit/s) : envoyée telle quelle si MP4 faststart, sinon simple remux.
 * Encodage impossible dans ce navigateur : envoi tel quel (voie 3), le serveur vérifiera la conformité.
 */
export async function processVideo(file: File, hooks: ProcessHooks = {}): Promise<ProcessedMedia> {
  hooks.onStage?.('analyse')
  const mb = await import('mediabunny')
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const fallback = (note: string): Promise<ProcessedMedia> => withThumb({
    main: file, mainName: file.name, mainMime: file.type || 'video/mp4', thumb: null, meta: {}, mode: 'fallback', note,
  })

  let vt: Awaited<ReturnType<typeof input.getPrimaryVideoTrack>>
  try {
    vt = await input.getPrimaryVideoTrack()
  }
  catch {
    if (!webCodecsAvailable()) return fallback('Format non analysable dans ce navigateur : fichier envoyé tel quel.')
    throw new MediaError('Fichier vidéo illisible ou format non pris en charge')
  }
  if (!vt) throw new MediaError('Aucune piste vidéo dans ce fichier')
  const at = await input.getPrimaryAudioTrack()
  const [codec, width, height, duration, format] = await Promise.all([
    vt.getCodec(), vt.getDisplayWidth(), vt.getDisplayHeight(), input.computeDuration(), input.getFormat(),
  ])
  const audioCodec = at ? await at.getCodec() : null
  const bitrate = duration ? file.size * 8 / duration : Infinity
  const isMp4 = format.mimeType === 'video/mp4' || format.name.toLowerCase().includes('mp4')
  const compliant = codec === 'avc' && Math.min(width, height) <= 1080 && bitrate <= 4_000_000 && (!at || audioCodec === 'aac' || audioCodec === 'mp3')
  const meta = { duration, width, height }

  if (compliant && isMp4 && await isFastStart(file)) {
    return withThumb({ main: file, mainName: file.name, mainMime: 'video/mp4', thumb: null, meta, mode: 'as-is', note: 'Déjà conforme : envoyée telle quelle' })
  }

  const run = async (opts: { encode: boolean, tw?: number, th?: number }) => {
    const target = new mb.BufferTarget()
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: opts.encode
        ? { width: opts.tw, height: opts.th, fit: 'fill', codec: 'avc', quality: new mb.Quality({ bitrate: VIDEO_BITRATE }), keyFrameInterval: 2 }
        : {},
      audio: audioCodec === 'aac' ? { codec: 'aac' } : { codec: 'aac', quality: new mb.Quality({ bitrate: AUDIO_BITRATE }), numberOfChannels: 2 },
      showWarnings: false,
    })
    if (!conversion.isValid) {
      throw new MediaError(`Conversion impossible : ${conversion.discardedTracks.map(d => `${d.track.type} (${d.reason})`).join(', ')}`)
    }
    if (at && !conversion.utilizedTracks.some(t => t.type === 'audio')) {
      throw new MediaError('Le son ne peut pas être converti en AAC dans ce navigateur')
    }
    const onAbort = () => { conversion.cancel() }
    hooks.signal?.addEventListener('abort', onAbort, { once: true })
    conversion.onProgress = p => hooks.onStage?.('encodage', p)
    hooks.onStage?.('encodage', 0)
    try { await conversion.execute() }
    finally { hooks.signal?.removeEventListener('abort', onAbort) }
    return new Blob([target.buffer!], { type: 'video/mp4' })
  }

  const audioOk = !at || audioCodec === 'aac' || (typeof (window as any).AudioEncoder !== 'undefined' && await mb.canEncodeAudio('aac'))

  if (compliant && audioOk) {
    // Voie 3 : déjà conforme, ré-écriture faststart sans ré-encodage
    try {
      const main = await run({ encode: false })
      return withThumb({ main, mainName: `${baseName}.mp4`, mainMime: 'video/mp4', thumb: null, meta, mode: 'remux', note: 'Déjà conforme : ré-écrite en faststart sans ré-encodage' })
    }
    catch (e) {
      if ((e as Error).name === 'ConversionCanceledError' || hooks.signal?.aborted) throw e
    }
  }

  const th = Math.min(VIDEO_HEIGHT, height) & ~1
  const tw = Math.round(width * th / height / 2) * 2
  const canEncode = webCodecsAvailable() && audioOk && await mb.canEncodeVideo('avc', { width: tw, height: th, quality: new mb.Quality({ bitrate: VIDEO_BITRATE }) }).catch(() => false)
  if (!canEncode) {
    return fallback('Ce navigateur ne sait pas encoder en H.264 : fichier envoyé tel quel (refusé s\'il n\'est pas conforme).')
  }
  const main = await run({ encode: true, tw, th })
  return withThumb({ main, mainName: `${baseName}_720p.mp4`, mainMime: 'video/mp4', thumb: null, meta: { duration, width: tw, height: th }, mode: 'encoded', note: `Ré-encodée en ${tw}×${th} H.264` })
}

async function withThumb(p: ProcessedMedia): Promise<ProcessedMedia> {
  p.thumb = await videoThumbnail(p.main)
  return p
}

/* ------------------------------ PDF et audio ------------------------------ */

/** V-07 : première page rendue en vignette 640 px. */
export async function pdfThumbnail(file: Blob): Promise<Blob | null> {
  try {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const pdf = await task.promise
    try {
      const page = await pdf.getPage(1)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 640 / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      return await canvasToBlob(canvas, 0.8)
    }
    finally {
      await task.destroy()
    }
  }
  catch {
    return null
  }
}

async function audioDuration(file: Blob): Promise<number | undefined> {
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    return await new Promise<number | undefined>((resolve) => {
      a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : undefined)
      a.onerror = () => resolve(undefined)
      a.src = url
    })
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

/** Traitement complet selon le type de document. */
export async function processMedia(file: File, kind: DocKind, hooks: ProcessHooks = {}): Promise<ProcessedMedia> {
  if (kind === 'video') return processVideo(file, hooks)
  hooks.onStage?.('analyse')
  if (kind === 'photo') return processPhoto(file)
  if (kind === 'pdf') {
    if (file.size > PDF_MAX) throw new MediaError(`PDF trop volumineux (${formatBytes(file.size)} > 200 Mo)`)
    return { main: file, mainName: file.name, mainMime: 'application/pdf', thumb: await pdfThumbnail(file), meta: {} }
  }
  if (file.size > AUDIO_MAX) throw new MediaError(`Fichier audio trop volumineux (${formatBytes(file.size)} > 100 Mo)`)
  if (/\.(wav|flac)$/i.test(file.name)) throw new MediaError('WAV/FLAC non acceptés : convertissez en MP3 ou AAC (M4A)')
  return { main: file, mainName: file.name, mainMime: file.type || 'audio/mpeg', thumb: null, meta: { duration: await audioDuration(file) } }
}

/* ------------------------------ Cache local (OPFS) ------------------------------ */
// Garde la vidéo ré-encodée pour reprendre l'envoi après un rechargement sans ré-encoder (A-06)

const cacheName = (key: string) => `enc-${key.replace(/[^\w.-]+/g, '_').slice(0, 200)}`

async function opfs() {
  const s = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
  return s?.getDirectory ? s.getDirectory() : null
}

export async function encodedCacheGet(key: string): Promise<File | null> {
  try {
    const dir = await opfs()
    if (!dir) return null
    const h = await dir.getFileHandle(cacheName(key))
    return await h.getFile()
  }
  catch { return null }
}

export async function encodedCachePut(key: string, blob: Blob) {
  try {
    const dir = await opfs()
    if (!dir) return
    const h = await dir.getFileHandle(cacheName(key), { create: true })
    const w = await (h as FileSystemFileHandle & { createWritable: () => Promise<FileSystemWritableFileStream> }).createWritable()
    await w.write(blob)
    await w.close()
  }
  catch { /* cache facultatif */ }
}

export async function encodedCacheDelete(key: string) {
  try {
    const dir = await opfs()
    await dir?.removeEntry(cacheName(key))
  }
  catch { /* absent */ }
}
