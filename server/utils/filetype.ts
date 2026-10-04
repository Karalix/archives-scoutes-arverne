// L-13 : validation du type réel des fichiers (signature binaire) et conformité vidéo (V-01, I-09).

export function sniffType(b: Uint8Array): string | null {
  const s = (o: number, l: number) => String.fromCharCode(...b.slice(o, o + l))
  if (b.length < 12) return null
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png'
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp'
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WAVE') return 'audio/wav'
  if (s(0, 4) === 'GIF8') return 'image/gif'
  if (s(0, 5) === '%PDF-') return 'application/pdf'
  if (s(0, 4) === 'fLaC') return 'audio/flac'
  if (s(0, 4) === 'OggS') return 'audio/ogg'
  if (s(0, 3) === 'ID3') return 'audio/mpeg'
  if (b[0] === 0xFF && (b[1]! & 0xE0) === 0xE0) {
    // Synchro de trame MPEG : couche 00 = ADTS (AAC), sinon MP3
    return ((b[1]! >> 1) & 0x03) === 0 ? 'audio/aac' : 'audio/mpeg'
  }
  if (s(4, 4) === 'ftyp') {
    const brand = s(8, 4)
    if (/^M4A|^M4B/.test(brand)) return 'audio/mp4'
    if (brand === 'qt  ') return 'video/quicktime'
    if (/^(heic|heix|mif1|msf1|heim|heis)/.test(brand)) return 'image/heic'
    return 'video/mp4'
  }
  const text = new TextDecoder().decode(b.slice(0, 16)).replace(/^﻿/, '')
  if (text.startsWith('WEBVTT')) return 'text/vtt'
  if (/^\s*<(\?xml|svg|!doctype|html)/i.test(text)) return 'text/html' // refusé
  return null
}

export const VARIANT_TYPES: Record<string, Record<string, string[]>> = {
  video: { main: ['video/mp4'], thumb: ['image/webp', 'image/jpeg', 'image/png'], captions: ['text/vtt'], original: ['*'] },
  photo: { main: ['image/webp', 'image/jpeg', 'image/png'], thumb: ['image/webp', 'image/jpeg', 'image/png'], original: ['*'] },
  pdf: { main: ['application/pdf'], thumb: ['image/webp', 'image/jpeg', 'image/png'], original: ['*'] },
  audio: { main: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg'], thumb: ['image/webp', 'image/jpeg', 'image/png'], original: ['*'] },
}

export const SIZE_LIMITS: Record<string, number> = {
  pdf: 200 * 1024 ** 2, // V-07
  audio: 100 * 1024 ** 2, // V-08
  photo: 40 * 1024 ** 2,
  video: 20 * 1024 ** 3,
  thumb: 5 * 1024 ** 2,
  captions: 2 * 1024 ** 2,
}

/* ------------------------------ Analyse MP4 ------------------------------ */

export interface Mp4Info {
  faststart: boolean
  codec: string | null
  width: number | null
  height: number | null
  duration: number | null // secondes
  bitrate: number | null // bit/s
}

type Reader = (offset: number, length: number) => Promise<Uint8Array>

function u32(b: Uint8Array, o: number) {
  return ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!
}
function u64(b: Uint8Array, o: number) {
  return u32(b, o) * 2 ** 32 + u32(b, o + 4)
}
function type(b: Uint8Array, o: number) {
  return String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!)
}

function* boxes(b: Uint8Array, start: number, end: number): Generator<{ type: string, start: number, body: number, end: number }> {
  let o = start
  while (o + 8 <= end) {
    let size = u32(b, o)
    const t = type(b, o + 4)
    let header = 8
    if (size === 1) { size = u64(b, o + 8); header = 16 }
    else if (size === 0) size = end - o
    if (size < header) return
    yield { type: t, start: o, body: o + header, end: Math.min(o + size, end) }
    o += size
  }
}

/** Analyse les boîtes de premier niveau par lectures de plage, puis le moov. */
export async function analyzeMp4(read: Reader, fileSize: number): Promise<Mp4Info> {
  const info: Mp4Info = { faststart: false, codec: null, width: null, height: null, duration: null, bitrate: null }
  let offset = 0
  let moov: { offset: number, size: number } | null = null
  let sawMdat = false
  for (let i = 0; i < 50 && offset + 8 <= fileSize; i++) {
    const h = await read(offset, 16)
    let size = u32(h, 0)
    const t = type(h, 4)
    if (size === 1) size = u64(h, 8)
    else if (size === 0) size = fileSize - offset
    if (size < 8) break
    if (t === 'moov') { moov = { offset, size }; info.faststart = !sawMdat; break }
    if (t === 'mdat') sawMdat = true
    offset += size
  }
  if (!moov || moov.size > 64 * 1024 ** 2) return info
  const m = await read(moov.offset, moov.size)
  const walk = (start: number, end: number, depth: number) => {
    for (const bx of boxes(m, start, end)) {
      if (bx.type === 'mvhd') {
        const v = m[bx.body]!
        const ts = v === 1 ? u32(m, bx.body + 20) : u32(m, bx.body + 12)
        const du = v === 1 ? u64(m, bx.body + 24) : u32(m, bx.body + 16)
        if (ts) info.duration = du / ts
      }
      else if (bx.type === 'tkhd') {
        const w = u32(m, bx.end - 8) / 65536
        const hh = u32(m, bx.end - 4) / 65536
        if (w && hh && !info.width) { info.width = Math.round(w); info.height = Math.round(hh) }
      }
      else if (bx.type === 'stsd') {
        // stsd : version/flags (4) + nombre (4), puis entrées
        for (const e of boxes(m, bx.body + 8, bx.end)) {
          if (['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09', 'mp4v'].includes(e.type) && !info.codec) info.codec = e.type
        }
      }
      else if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(bx.type) && depth < 6) {
        walk(bx.body, bx.end, depth + 1)
      }
    }
  }
  walk(0, m.length, 0)
  if (info.duration) info.bitrate = Math.round(fileSize * 8 / info.duration)
  return info
}

/** V-01 / 6.3 voie 3 : H.264 ≤ 1080p, ≤ 4 Mbit/s, faststart. */
export function videoCompliance(info: Mp4Info): { ok: boolean, problems: string[] } {
  const problems: string[] = []
  if (!info.codec?.startsWith('avc')) problems.push(`codec ${info.codec ?? 'inconnu'} (H.264 attendu)`)
  if (!info.faststart) problems.push('index (moov) en fin de fichier : faststart requis')
  if (info.height && Math.min(info.height, info.width ?? info.height) > 1080) problems.push(`résolution ${info.width}×${info.height} (≤ 1080p attendu)`)
  if (info.bitrate && info.bitrate > 4_200_000) problems.push(`débit ${(info.bitrate / 1e6).toFixed(1)} Mbit/s (≤ 4 Mbit/s attendu)`)
  return { ok: problems.length === 0, problems }
}

/** Commande ffmpeg exacte à exécuter localement (I-09). */
export function ffmpegCommand(input = 'source.mp4', output = 'rendu.mp4') {
  return `ffmpeg -i "${input}" -c:v libx264 -profile:v high -preset slow -crf 23 -maxrate 2M -bufsize 4M -vf "scale=-2:'min(720,ih)'" -c:a aac -b:a 128k -movflags +faststart "${output}"`
}

export function ffmpegThumbCommand(input = 'rendu.mp4', at = 10, output = 'vignette.jpg') {
  return `ffmpeg -ss ${at} -i "${input}" -frames:v 1 -vf "scale=640:-2" -q:v 3 "${output}"`
}
