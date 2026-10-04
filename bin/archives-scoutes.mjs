#!/usr/bin/env node
// CLI d'import (6.3 voie 2, I-15) : simple client de l'API REST v1.
//   npx archives-scoutes import ./dossier --url https://archives.mongroupe.fr --token asc_…
//   npx archives-scoutes export ./export.json --out ./sauvegarde
//   npx archives-scoutes reset-link --email owner@exemple.fr [--remote]
// Dépendances : Node ≥ 20, ffmpeg/ffprobe dans le PATH pour les vidéos et photos.

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { basename, extname, join, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createInterface } from 'node:readline/promises'

const args = process.argv.slice(2)
const cmd = args[0]
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return def
  const v = args[i + 1]
  return v && !v.startsWith('--') ? v : true
}
const positional = args.filter((a, i) => i > 0 && !a.startsWith('--') && !args[i - 1]?.startsWith('--'))

const MEDIA_EXT = /\.(mp4|m4v|mov|mkv|avi|webm|mts|mpg|mpeg|wmv|jpe?g|png|webp|heic|tiff?|pdf|mp3|m4a|aac|ogg|wav|flac)$/i
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|avi|webm|mts|mpg|mpeg|wmv)$/i
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|tiff?)$/i

function die(msg) {
  console.error(`\x1B[31m✖ ${msg}\x1B[0m`)
  process.exit(1)
}

function has(bin) {
  return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0
}

function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' })
  if (r.status !== 0) return null
  try {
    const j = JSON.parse(r.stdout)
    const v = j.streams.find(s => s.codec_type === 'video')
    return {
      duration: Number(j.format.duration) || undefined,
      bitrate: Number(j.format.bit_rate) || undefined,
      codec: v?.codec_name,
      width: v?.width,
      height: v?.height,
    }
  }
  catch { return null }
}

function run(bin, argv) {
  const r = spawnSync(bin, argv, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`${bin} a échoué : ${r.stderr?.split('\n').slice(-4).join(' ')}`)
}

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (MEDIA_EXT.test(e.name)) out.push(p)
  }
  return out.sort()
}

function api(base, token) {
  return async function call(method, path, body, opts = {}) {
    const headers = { authorization: `Bearer ${token}`, ...(opts.headers ?? {}) }
    let payload = body
    if (body !== undefined && !(body instanceof Uint8Array) && !opts.raw) {
      headers['content-type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    for (let attempt = 1; ; attempt++) {
      let res
      try {
        res = await fetch(base + path, { method, headers, body: payload })
      }
      catch (e) {
        if (attempt >= 6) throw e
        await new Promise(r => setTimeout(r, 2 ** attempt * 1000))
        continue
      }
      const text = await res.text()
      const data = text ? (() => { try { return JSON.parse(text) } catch { return text } })() : null
      if (res.status >= 500 && attempt < 6) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 1000))
        continue
      }
      if (!res.ok && !opts.allowError) {
        const err = new Error(`${method} ${path} → ${res.status} ${data?.detail ?? text}${data?.hint ? `\n  → ${data.hint}` : ''}`)
        err.data = data
        err.status = res.status
        throw err
      }
      return { status: res.status, data }
    }
  }
}

function readPart(file, start, length) {
  return new Promise((res, rej) => {
    const chunks = []
    createReadStream(file, { start, end: start + length - 1 })
      .on('data', c => chunks.push(c))
      .on('end', () => res(new Uint8Array(Buffer.concat(chunks))))
      .on('error', rej)
  })
}

async function uploadFile(call, base, documentId, variant, file, meta, state) {
  const size = statSync(file).size
  if (size <= 50 * 1024 * 1024) {
    const qs = new URLSearchParams({ filename: basename(file), ...Object.fromEntries(Object.entries(meta).filter(([, v]) => v).map(([k, v]) => [k, String(v)])) })
    const body = new Uint8Array(readFileSync(file))
    return (await call('PUT', `/api/v1/documents/${documentId}/files/${variant}?${qs}`, body, { headers: { 'content-type': 'application/octet-stream' }, raw: true })).data
  }
  // Multipart reprenable : l'identifiant d'envoi est mémorisé dans l'état local
  let up
  if (state.uploadId) {
    up = (await call('GET', `/api/uploads/${state.uploadId}`, undefined, { allowError: true }))
    if (up.status !== 200 || up.data.status !== 'pending') up = null
    else up = up.data
  }
  if (!up) {
    up = (await call('POST', '/api/uploads', { documentId, variant, filename: basename(file), size, mime: 'application/octet-stream' })).data
    state.uploadId = up.id
    state.save()
  }
  const total = up.partCount
  let done = total - up.missing.length
  const queue = [...up.partUrls]
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift()
      const start = (p.partNumber - 1) * up.partSize
      const len = Math.min(up.partSize, size - start)
      const buf = await readPart(file, start, len)
      for (let attempt = 1; ; attempt++) {
        try {
          const r = await fetch(base + p.url, { method: 'PUT', body: buf, headers: { 'content-type': 'application/octet-stream' } })
          if (r.status === 403) { // URL expirée : on en redemande
            const fresh = (await call('GET', `/api/uploads/${up.id}`)).data.partUrls.find(x => x.partNumber === p.partNumber)
            p.url = fresh.url
            continue
          }
          if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
          break
        }
        catch (e) {
          if (attempt >= 8) throw e
          process.stdout.write(`\n  coupure réseau, nouvel essai dans ${2 ** attempt} s…`)
          await new Promise(r => setTimeout(r, 2 ** attempt * 1000))
        }
      }
      done++
      process.stdout.write(`\r  ${basename(file)} : ${Math.round(done / total * 100)} % (${done}/${total} parties)   `)
    }
  }
  await Promise.all([worker(), worker(), worker()])
  process.stdout.write('\n')
  const r = (await call('POST', `/api/uploads/${up.id}/complete`, meta)).data
  state.uploadId = undefined
  state.save()
  return r
}

async function cmdImport() {
  const dir = resolve(positional[0] ?? '.')
  const base = String(flag('url', process.env.ARCHIVES_URL ?? '')).replace(/\/$/, '')
  const token = String(flag('token', process.env.ARCHIVES_TOKEN ?? ''))
  if (!base || !token) die('Précisez --url et --token (ou ARCHIVES_URL / ARCHIVES_TOKEN)')
  if (!existsSync(dir)) die(`Dossier introuvable : ${dir}`)
  const dryRun = !!flag('dry-run', false)
  const publish = !!flag('publish', false)
  const call = api(base, token)
  const hasFfmpeg = has('ffmpeg') && has('ffprobe')
  if (!hasFfmpeg) console.warn('⚠ ffmpeg/ffprobe introuvables : les vidéos non conformes seront ignorées.')

  const statePath = join(dir, '.archives-import.json')
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {}
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2))

  const files = walk(dir)
  console.log(`${files.length} fichiers trouvés dans ${dir}`)
  const listing = files.map((f) => {
    const rel = relative(dir, f).split('\\').join('/')
    const info = VIDEO_EXT.test(f) && hasFfmpeg ? ffprobe(f) : null
    return { path: rel, size: statSync(f).size, duration: info?.duration, abs: f, info }
  })
  const plan = (await call('POST', '/api/v1/plan-import', { files: listing.map(({ path, size, duration }) => ({ path, size, duration })) })).data
  console.table(plan.items.map(i => ({ fichier: i.path.slice(-50), année: i.yearLabel ?? '?', événement: i.event?.title ?? '', branche: i.branch ?? '', titre: i.title.slice(0, 30), déjà: i.existingDocumentId ? 'oui' : '', alertes: i.issues.join(' ; ').slice(0, 40) })))
  if (plan.summary.missingYears.length) console.log(`Années à créer : ${plan.summary.missingYears.join(', ')}`)
  if (dryRun) return console.log('--dry-run : rien n\'a été écrit.')
  if (!flag('yes', false)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ok = (await rl.question('Valider ce classement et importer ? (o/N) ')).trim().toLowerCase()
    rl.close()
    if (!['o', 'oui', 'y', 'yes'].includes(ok)) return console.log('Annulé.')
  }

  for (const y of plan.summary.missingYears) await call('POST', '/api/v1/years', { startYear: y })

  const items = plan.items.filter(i => i.kind && i.year !== null)
  // Création des brouillons par lots de 100, idempotente par externalId
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100)
    const res = (await call('POST', '/api/v1/documents:batch', {
      documents: chunk.map(it => ({
        externalId: it.externalId, year: it.year, kind: it.kind, title: it.title, branch: it.branch, date: it.date,
        event: it.event ? { title: it.event.title, type: it.event.type } : null,
      })),
    })).data
    for (const r of res.results) {
      const it = chunk[r.index]
      if (r.ok) (state[it.path] ??= {}).documentId = r.id
      else console.error(`✖ ${it.path} : ${r.error}${r.hint ? ` (${r.hint})` : ''}`)
    }
    save()
  }

  const tmp = join(tmpdir(), `archives-import-${process.pid}`)
  mkdirSync(tmp, { recursive: true })
  const published = []
  for (const it of items) {
    const st = state[it.path]
    if (!st?.documentId) continue
    if (st.done) { console.log(`✓ ${it.path} (déjà envoyé)`); continue }
    st.save = save
    const src = listing.find(l => l.path === it.path)
    try {
      let file = src.abs
      const meta = {}
      if (it.kind === 'video') {
        if (!hasFfmpeg) { console.warn(`… ${it.path} ignoré (ffmpeg requis)`); continue }
        const info = src.info ?? {}
        const compliant = info.codec === 'h264' && Math.min(info.width ?? 0, info.height ?? 0) <= 1080 && (info.bitrate ?? 0) <= 4_000_000 && /\.(mp4|m4v)$/i.test(file)
        const out = join(tmp, `${st.documentId}.mp4`)
        if (compliant) {
          console.log(`  ${it.path} : conforme, réécriture faststart`)
          run('ffmpeg', ['-y', '-i', file, '-c', 'copy', '-movflags', '+faststart', out])
        }
        else {
          console.log(`  ${it.path} : ré-encodage 720p (peut être long)…`)
          run('ffmpeg', ['-y', '-i', file, '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '23', '-maxrate', '2M', '-bufsize', '4M',
            '-vf', 'scale=-2:\'min(720,ih)\'', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out])
        }
        file = out
        const p = ffprobe(out)
        Object.assign(meta, { duration: p?.duration, width: p?.width, height: p?.height })
        const thumb = join(tmp, `${st.documentId}.jpg`)
        run('ffmpeg', ['-y', '-ss', String(Math.max(0, (p?.duration ?? 10) * 0.1)), '-i', out, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', thumb])
        await uploadFile(call, base, st.documentId, 'main', file, meta, st)
        await uploadFile(call, base, st.documentId, 'thumb', thumb, {}, st)
      }
      else if (it.kind === 'photo') {
        if (!hasFfmpeg) { console.warn(`… ${it.path} ignoré (ffmpeg requis)`); continue }
        // V-06 : 1 600 px et 400 px, WebP, métadonnées (dont GPS) supprimées
        const big = join(tmp, `${st.documentId}.webp`)
        const small = join(tmp, `${st.documentId}-t.webp`)
        run('ffmpeg', ['-y', '-i', file, '-map_metadata', '-1', '-vf', 'scale=\'min(1600,iw)\':-2', '-q:v', '80', big])
        run('ffmpeg', ['-y', '-i', file, '-map_metadata', '-1', '-vf', 'scale=\'min(400,iw)\':-2', '-q:v', '75', small])
        await uploadFile(call, base, st.documentId, 'main', big, {}, st)
        await uploadFile(call, base, st.documentId, 'thumb', small, {}, st)
      }
      else if (it.kind === 'pdf') {
        await uploadFile(call, base, st.documentId, 'main', file, {}, st)
        if (has('pdftoppm')) {
          const prefix = join(tmp, st.documentId)
          spawnSync('pdftoppm', ['-jpeg', '-f', '1', '-l', '1', '-scale-to', '640', '-singlefile', file, prefix])
          if (existsSync(`${prefix}.jpg`)) await uploadFile(call, base, st.documentId, 'thumb', `${prefix}.jpg`, {}, st)
        }
      }
      else if (it.kind === 'audio') {
        await uploadFile(call, base, st.documentId, 'main', file, {}, st)
      }
      delete st.save
      st.done = true
      save()
      published.push(st.documentId)
      console.log(`✓ ${it.path}`)
    }
    catch (e) {
      delete st.save
      save()
      console.error(`✖ ${it.path} : ${e.message}`)
    }
  }
  if (publish && published.length) {
    const r = (await call('POST', '/api/v1/documents:publish', { ids: published }, { allowError: true }))
    console.log(r.status === 200 ? `${published.length} documents publiés.` : `Publication refusée : ${r.data?.detail}`)
  }
  console.log(`\nTerminé. Relisez les brouillons : ${base}/admin/documents?status=draft`)
}

async function cmdExport() {
  const manifestPath = positional[0]
  const out = resolve(String(flag('out', './export-archives')))
  if (!manifestPath || !existsSync(manifestPath)) die('Usage : archives-scoutes export ./archives-export-AAAA-MM-JJ.json --out ./dossier (manifeste téléchargé depuis Administration → Export)')
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
  mkdirSync(join(out, 'files'), { recursive: true })
  writeFileSync(join(out, 'metadata.json'), JSON.stringify({ ...m, files: undefined }, null, 2))
  let i = 0
  for (const f of m.files) {
    i++
    const dest = join(out, 'files', f.documentId, f.variant + (extname(f.key) || ''))
    if (existsSync(dest)) continue
    mkdirSync(join(out, 'files', f.documentId), { recursive: true })
    const r = await fetch(f.url)
    if (!r.ok) { console.error(`✖ ${f.key} : ${r.status} (manifeste expiré ?)`); continue }
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
    process.stdout.write(`\r${i}/${m.files.length} fichiers`)
  }
  console.log(`\nExport écrit dans ${out}`)
}

function cmdResetLink() {
  // A-03 : jeton CLI pour qu'un owner réinitialise son propre mot de passe sans e-mail
  const email = flag('email')
  if (!email || email === true) die('Usage : archives-scoutes reset-link --email owner@exemple.fr [--remote] [--url https://…]')
  const token = randomBytes(24).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  const now = Date.now()
  const id = `cli${now.toString(36)}${randomBytes(4).toString('hex')}`
  const esc = s => String(s).replace(/'/g, '\'\'')
  const sql = `INSERT INTO admin_link (id, instance_id, kind, token_hash, email, user_id, created_by, created_at, expires_at) SELECT '${id}', instance_id, 'reset', '${hash}', email, id, 'cli', ${now}, ${now + 86400_000} FROM admin_user WHERE email = '${esc(String(email).toLowerCase())}' LIMIT 1;`
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'DB', flag('remote', false) ? '--remote' : '--local', '--command', sql], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.log('\nExécution impossible ; lancez vous-même cette requête dans la console D1 :\n')
    console.log(sql)
  }
  const base = String(flag('url', 'https://<votre-instance>')).replace(/\/$/, '')
  console.log(`\nLien de réinitialisation (24 h, usage unique) :\n${base}/admin/lien/${token}\n`)
}

const HELP = `archives-scoutes — outils en ligne de commande

  import <dossier> --url URL --token JETON [--dry-run] [--yes] [--publish]
      Importe un dossier (vidéos ré-encodées en 720p par ffmpeg, photos en WebP).
      Reprenable : relancez la même commande après une coupure, sans doublon.
  export <manifeste.json> --out <dossier>
      Télécharge métadonnées et fichiers depuis un manifeste d'export (admin → Export).
  reset-link --email EMAIL [--remote] [--url URL]
      Crée un lien de réinitialisation de mot de passe (owner) via wrangler d1.
`

if (cmd === 'import') await cmdImport()
else if (cmd === 'export') await cmdExport()
else if (cmd === 'reset-link') cmdResetLink()
else console.log(HELP)
