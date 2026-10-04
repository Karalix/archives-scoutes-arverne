// L-13 : type réel des fichiers (signature binaire) ; V-01 / I-09 : conformité vidéo.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { analyzeMp4, ffmpegCommand, ffmpegThumbCommand, sniffType, videoCompliance } from '../../server/utils/filetype'

const bytes = (...parts: (string | number[])[]) => {
  const out: number[] = []
  for (const p of parts) {
    if (typeof p === 'string') for (const c of p) out.push(c.charCodeAt(0))
    else out.push(...p)
  }
  while (out.length < 32) out.push(0)
  return new Uint8Array(out)
}
const utf8 = (s: string) => {
  const b = new TextEncoder().encode(s.padEnd(32, ' '))
  return b
}

describe('sniffType', () => {
  it.each([
    ['jpeg', bytes([0xFF, 0xD8, 0xFF, 0xE0], 'JFIF'), 'image/jpeg'],
    ['png', bytes([0x89], 'PNG', [0x0D, 0x0A, 0x1A, 0x0A]), 'image/png'],
    ['webp', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '), 'image/webp'],
    ['wav', bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '), 'audio/wav'],
    ['gif', bytes('GIF89a'), 'image/gif'],
    ['pdf', bytes('%PDF-1.7\n'), 'application/pdf'],
    ['flac', bytes('fLaC'), 'audio/flac'],
    ['ogg', bytes('OggS', [0, 2]), 'audio/ogg'],
    ['mp3 ID3', bytes('ID3', [4, 0, 0]), 'audio/mpeg'],
    ['mp3 sans ID3 (synchro MPEG-1 couche 3)', bytes([0xFF, 0xFB, 0x90, 0x64]), 'audio/mpeg'],
    ['aac ADTS', bytes([0xFF, 0xF1, 0x50, 0x80]), 'audio/aac'],
    ['mp4 ftyp isom', bytes([0, 0, 0, 0x20], 'ftypisom', [0, 0, 2, 0], 'isomiso2avc1mp41'), 'video/mp4'],
    ['mp4 ftyp mp42', bytes([0, 0, 0, 0x18], 'ftypmp42'), 'video/mp4'],
    ['m4a', bytes([0, 0, 0, 0x20], 'ftypM4A ', [0, 0, 2, 0]), 'audio/mp4'],
    ['mov', bytes([0, 0, 0, 0x14], 'ftypqt  '), 'video/quicktime'],
    ['heic', bytes([0, 0, 0, 0x18], 'ftypheic'), 'image/heic'],
    ['vtt', utf8('WEBVTT\n\n00:00.000 --> 00:01.000\nBonjour'), 'text/vtt'],
    ['vtt avec BOM', utf8('﻿WEBVTT\n\n00:00.000 --> 00:01'), 'text/vtt'],
    ['html', utf8('<!DOCTYPE html><html><body>x'), 'text/html'],
    ['html minuscule', utf8('  <html><script>alert(1)</script>'), 'text/html'],
    ['svg', utf8('<svg xmlns="http://www.w3.org/2000/svg">'), 'text/html'],
    ['svg via XML', utf8('<?xml version="1.0"?><svg>'), 'text/html'],
    ['inconnu', bytes('hello world, plain text file'), null],
    ['zéros', new Uint8Array(32), null],
  ])('%s', (_name, b, mime) => {
    expect(sniffType(b)).toBe(mime)
  })
  it('moins de 12 octets → null', () => {
    expect(sniffType(new Uint8Array([0xFF, 0xD8, 0xFF]))).toBeNull()
  })
})

describe('commandes ffmpeg (I-09)', () => {
  it('ffmpegCommand : H.264 720p, AAC, faststart', () => {
    const c = ffmpegCommand('in.mov', 'out.mp4')
    expect(c).toContain('-movflags +faststart')
    expect(c).toContain('libx264')
    expect(c).toContain('-c:a aac')
    expect(c).toContain('min(720,ih)')
    expect(c).toContain('"in.mov"')
    expect(c.endsWith('"out.mp4"')).toBe(true)
  })
  it('ffmpegThumbCommand : une image à l\'instant donné', () => {
    expect(ffmpegThumbCommand('v.mp4', 12, 't.jpg')).toBe('ffmpeg -ss 12 -i "v.mp4" -frames:v 1 -vf "scale=640:-2" -q:v 3 "t.jpg"')
  })
})

describe('videoCompliance (règles seules)', () => {
  const ok = { faststart: true, codec: 'avc1', width: 1280, height: 720, duration: 60, bitrate: 1_800_000 }
  it('rendu conforme', () => {
    expect(videoCompliance(ok)).toEqual({ ok: true, problems: [] })
  })
  it('1080p portrait accepté (on compare le plus petit côté)', () => {
    expect(videoCompliance({ ...ok, width: 1080, height: 1920 }).ok).toBe(true)
  })
  it('chaque problème est signalé', () => {
    const r = videoCompliance({ faststart: false, codec: 'hvc1', width: 3840, height: 2160, duration: 10, bitrate: 20_000_000 })
    expect(r.ok).toBe(false)
    expect(r.problems).toHaveLength(4)
  })
  it('codec inconnu', () => {
    expect(videoCompliance({ ...ok, codec: null }).problems[0]).toContain('inconnu')
  })
})

/* ----------------------- Fichiers MP4 générés par ffmpeg ------------------ */

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
let dir = ''

function make(name: string, args: string[]) {
  const out = join(dir, name)
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args, out], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg ${name} : ${r.stderr}`)
  return out
}
const src = (size: string, secs = 2) => ['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=25:duration=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${secs}`]
const h264 = ['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '800k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k']

async function analyze(file: string) {
  const buf = readFileSync(file)
  const read = async (offset: number, length: number) => new Uint8Array(buf.subarray(offset, offset + length))
  return analyzeMp4(read, statSync(file).size)
}

describe.skipIf(!hasFfmpeg)('analyzeMp4 + videoCompliance sur des MP4 réels (ffmpeg)', () => {
  const files: Record<string, string> = {}
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'archives-filetype-'))
    files.ok = make('ok.mp4', [...src('1280x720'), ...h264, '-movflags', '+faststart'])
    files.tail = make('tail.mp4', [...src('1280x720'), ...h264])
    files.mpeg4 = make('mpeg4.mp4', [...src('1280x720'), '-c:v', 'mpeg4', '-q:v', '10', '-c:a', 'aac', '-movflags', '+faststart'])
    files.qhd = make('qhd.mp4', [...src('2560x1440'), ...h264, '-movflags', '+faststart'])
    files.m4a = make('audio.m4a', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac'])
    files.jpg = make('img.jpg', ['-f', 'lavfi', '-i', 'testsrc=size=64x64:duration=1', '-frames:v', '1'])
  }, 60_000)
  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('sniffType reconnaît les fichiers générés', () => {
    const head = (f: string) => new Uint8Array(readFileSync(f).subarray(0, 64))
    expect(sniffType(head(files.ok!))).toBe('video/mp4')
    expect(sniffType(head(files.m4a!))).toBe('audio/mp4')
    expect(sniffType(head(files.jpg!))).toBe('image/jpeg')
  })

  it('H.264 720p faststart : conforme', async () => {
    const info = await analyze(files.ok!)
    expect(info).toMatchObject({ faststart: true, codec: 'avc1', width: 1280, height: 720 })
    expect(info.duration).toBeGreaterThan(1.9)
    expect(info.duration).toBeLessThan(2.2)
    expect(info.bitrate).toBeGreaterThan(0)
    expect(videoCompliance(info)).toEqual({ ok: true, problems: [] })
  })

  it('sans faststart (moov en fin) : refusé', async () => {
    const info = await analyze(files.tail!)
    expect(info).toMatchObject({ faststart: false, codec: 'avc1', width: 1280, height: 720 })
    expect(info.duration).toBeGreaterThan(1.9)
    const r = videoCompliance(info)
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual([expect.stringContaining('faststart')])
  })

  it('MPEG-4 part 2 : codec refusé', async () => {
    const info = await analyze(files.mpeg4!)
    expect(info).toMatchObject({ faststart: true, codec: 'mp4v', width: 1280, height: 720 })
    const r = videoCompliance(info)
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual([expect.stringContaining('H.264 attendu')])
  })

  it('1440p : résolution refusée', async () => {
    const info = await analyze(files.qhd!)
    expect(info).toMatchObject({ faststart: true, codec: 'avc1', width: 2560, height: 1440 })
    const r = videoCompliance(info)
    expect(r.ok).toBe(false)
    expect(r.problems).toContainEqual(expect.stringContaining('2560×1440'))
  })

  it('fichier non MP4 : aucune information', async () => {
    const info = await analyze(files.jpg!)
    expect(info).toMatchObject({ faststart: false, codec: null, width: null, duration: null })
  })
})
