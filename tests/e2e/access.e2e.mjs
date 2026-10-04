#!/usr/bin/env node
// Recette HTTP de la matrice d'accès (critères 12.2, L-04, L-09, L-10, I-02, T-02).
//
//   node tests/e2e/access.e2e.mjs http://localhost:3000
//
// Prérequis : une instance installée (dev ou préproduction) et un compte owner.
//   E2E_EMAIL / E2E_PASSWORD      identifiants owner (défaut : alix@example.org / motdepasse-solide)
//   E2E_MEDIA_SIGNING_KEY         facultatif : NUXT_MEDIA_SIGNING_KEY de l'instance, pour forger une
//                                 URL correctement signée mais expirée (sinon test par exp modifié)
//
// Le script crée ses propres années / documents / mot de passe / jeton, puis les supprime.
// ATTENTION : /api/access/unlock est limité à 5 essais / 15 min par IP ; ce script en consomme un.
// Sans dépendance : Node ≥ 20.

import { createHmac, randomBytes } from 'node:crypto'

const BASE = (process.argv[2] || process.env.E2E_URL || 'http://localhost:3000').replace(/\/$/, '')
const EMAIL = process.env.E2E_EMAIL || 'alix@example.org'
const PASSWORD = process.env.E2E_PASSWORD || 'motdepasse-solide'
const SIGNING_KEY = process.env.E2E_MEDIA_SIGNING_KEY || ''

// JPEG 16×16 valide (224 octets)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABQYQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAQABADASIAAhEAAxEA/9oADAMBAAIRAxEAPwCcADp5/9k=', 'base64')

/* --------------------------------- Outils --------------------------------- */

let failures = 0
let passes = 0
function check(name, cond, detail = '') {
  if (cond) { passes++; console.log(`\x1B[32m✓\x1B[0m ${name}`) }
  else { failures++; console.log(`\x1B[31m✗ ${name}\x1B[0m${detail ? `\n    ${detail}` : ''}`) }
  return cond
}
function section(title) { console.log(`\n\x1B[1m${title}\x1B[0m`) }

/** Client HTTP minimal avec boîte à cookies (une par « navigateur »). */
function client(name, { bearer } = {}) {
  const jar = new Map()
  return {
    name,
    async req(method, path, { json, body, headers = {} } = {}) {
      const h = { ...headers }
      if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
      if (bearer) h.authorization = `Bearer ${bearer}`
      let payload = body
      if (json !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(json) }
      const res = await fetch(path.startsWith('http') ? path : BASE + path, { method, headers: h, body: payload, redirect: 'manual' })
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(';')
        const i = pair.indexOf('=')
        const k = pair.slice(0, i).trim()
        const v = pair.slice(i + 1).trim()
        if (!v || /max-age=0/i.test(c) || /expires=thu, 01 jan 1970/i.test(c)) jar.delete(k)
        else jar.set(k, v)
      }
      const buf = Buffer.from(await res.arrayBuffer())
      const text = buf.toString('utf8')
      let data = null
      try { data = JSON.parse(text) } catch {}
      return { status: res.status, headers: res.headers, text, data, buf }
    },
  }
}

const rnd = randomBytes(4).toString('hex')
const WORD_PROT = `zorglubprot${rnd}`
const WORD_CUR = `zorglubcur${rnd}`
const WORD_PUB = `zorglubpub${rnd}`

const admin = client('admin')
const anon = client('anonyme')
const family = client('famille')

const created = { years: [], docs: [], passwordId: null, tokenId: null }

async function mustOk(r, what) {
  if (r.status >= 300) throw new Error(`${what} → ${r.status} ${r.text.slice(0, 300)}`)
  return r.data
}

async function createDoc(year, title, { visibility } = {}) {
  const d = await mustOk(await admin.req('POST', '/api/v1/documents', {
    json: { year, kind: 'photo', title, description: `Recette e2e ${rnd}`, externalId: `e2e/${rnd}/${title}`, ...(visibility ? { visibility } : {}) },
  }), `création document ${title}`)
  const id = d.document.id
  created.docs.push(id)
  for (const variant of ['main', 'thumb']) {
    await mustOk(await admin.req('PUT', `/api/v1/documents/${id}/files/${variant}?filename=photo.jpg`, {
      body: JPEG, headers: { 'content-type': 'image/jpeg', 'content-length': String(JPEG.length) },
    }), `envoi ${variant} de ${title}`)
  }
  const pub = await mustOk(await admin.req('POST', '/api/v1/documents:publish', { json: { ids: [id] } }), `publication ${title}`)
  if (!pub.ok) throw new Error(`publication ${title} : ${JSON.stringify(pub.results)}`)
  return id
}

async function ensureYear(startYear) {
  const r = await mustOk(await admin.req('POST', '/api/v1/years', { json: { startYear } }), `année ${startYear}`)
  if (r.action === 'create') created.years.push(startYear)
}

function sign(docId, variant, exp, p, dl = 0, a = 0) {
  return createHmac('sha256', SIGNING_KEY).update(`m:${docId}:${variant}:${exp}:${p}:${dl}:${a}`).digest('base64url')
}

/* --------------------------------- Recette -------------------------------- */

async function main() {
  console.log(`Recette d'accès sur ${BASE}`)

  section('Préparation (session owner)')
  const login = await admin.req('POST', '/api/admin/login', { json: { email: EMAIL, password: PASSWORD } })
  if (!check('connexion administrateur', login.status === 200, `${login.status} ${login.text.slice(0, 200)}`)) {
    throw new Error('Impossible de continuer sans session admin (E2E_EMAIL / E2E_PASSWORD)')
  }
  const settings = await mustOk(await admin.req('GET', '/api/admin/settings'), 'réglages')
  const pivot = settings.effectivePivot
  const current = settings.currentScoutYear
  const yProt = current - 1 // année protégée couverte par le mot de passe
  const yCur = current // année protégée NON couverte
  const yPub = pivot // année publique
  console.log(`  pivot effectif ${pivot} (${settings.pivotMode}), année courante ${current} ; années de recette ${yPub}, ${yProt}, ${yCur}`)
  check('le pivot laisse au moins deux années protégées', yProt > pivot, `pivot ${pivot}, année courante ${current}`)

  for (const y of [yPub, yProt, yCur]) await ensureYear(y)
  const titleProt = `Camp ${WORD_PROT}`
  const titleCur = `Rentree ${WORD_CUR}`
  const titlePub = `Archive ${WORD_PUB}`
  const docProt = await createDoc(yProt, titleProt)
  const docCur = await createDoc(yCur, titleCur)
  const docPub = await createDoc(yPub, titlePub)
  check('documents créés, fichiers envoyés et publiés', true)

  const adminView = await mustOk(await admin.req('GET', `/api/v1/documents/${docProt}`), 'lecture admin')
  check('l\'admin obtient des URL signées thumb/main', /^\/m\/.+\/thumb\?.*sig=/.test(adminView.thumbUrl ?? '') && /^\/m\/.+\/main\?.*sig=/.test(adminView.mainUrl ?? ''))

  /* ------------------------------ Anonyme ------------------------------- */
  section(`Visiteur anonyme — année ${yProt} > pivot (critère 12.2, L-04)`)
  let r = await anon.req('GET', `/api/public/documents/${docProt}`)
  check('GET /api/public/documents/:id → 401', r.status === 401, `reçu ${r.status}`)
  check('  … sans le titre ni la vignette', !r.text.includes(WORD_PROT) && !r.text.includes('/m/'), r.text.slice(0, 200))
  check('  … au format application/problem+json', (r.headers.get('content-type') ?? '').includes('problem+json'), r.headers.get('content-type'))

  r = await anon.req('GET', `/api/public/years/${yProt}`)
  check(`GET /api/public/years/${yProt} → 200 verrouillée`, r.status === 200 && r.data?.locked === true, `${r.status} locked=${r.data?.locked}`)
  check('  … aucun document, aucun titre, aucune URL média', (r.data?.documents?.length ?? 0) === 0 && !r.text.includes(WORD_PROT) && !r.text.includes('/m/'), r.text.slice(0, 300))
  check('  … le nombre de documents reste visible (3.4)', typeof r.data?.count === 'number' && r.data.count >= 1, `count=${r.data?.count}`)
  check('  … X-Robots-Tag noindex', (r.headers.get('x-robots-tag') ?? '').includes('noindex'), r.headers.get('x-robots-tag'))

  r = await anon.req('GET', '/api/public/years')
  check('GET /api/public/years ne divulgue aucun titre ni vignette protégée', r.status === 200 && !r.text.includes(WORD_PROT) && !r.text.includes(docProt))

  r = await anon.req('GET', `/api/public/search?q=${WORD_PROT}`)
  check(`GET /api/public/search?q=${WORD_PROT} → aucun résultat`, r.status === 200 && (r.data?.results?.length ?? -1) === 0 && !r.text.includes(WORD_PROT), r.text.slice(0, 200))

  section(`Visiteur anonyme — année publique ${yPub} (témoin)`)
  r = await anon.req('GET', `/api/public/documents/${docPub}`)
  check('document public lisible', r.status === 200 && r.data?.title === titlePub, `${r.status}`)
  check('  … marqué non protégé, URL média non protégée (p=0)', r.data?.protected === false && /[?&]p=0/.test(r.data?.mainUrl ?? ''), r.data?.mainUrl)
  if (r.data?.mainUrl) {
    const m = await anon.req('GET', r.data.mainUrl)
    check('  … média public : 200 et Cache-Control public, max-age=86400 (T-03)', m.status === 200 && (m.headers.get('cache-control') ?? '').includes('public'), `${m.status} ${m.headers.get('cache-control')}`)
  }
  r = await anon.req('GET', `/api/public/search?q=${WORD_PUB}`)
  check('  … trouvé par la recherche', r.data?.results?.some(x => x.id === docPub))

  section('URL signées (T-01, L-10)')
  const mainUrl = adminView.mainUrl
  const u = new URL(mainUrl, BASE)
  const exp = Number(u.searchParams.get('exp'))
  const now = Date.now() / 1000
  check('URL protégée : p=1 et expiration ≤ 6 h (+15 min d\'arrondi)', u.searchParams.get('p') === '1' && exp > now && exp - now <= 6 * 3600 + 900, `exp dans ${Math.round((exp - now) / 60)} min`)
  r = await anon.req('GET', mainUrl)
  // L'URL signée EST la capacité : qui la détient peut lire le média jusqu'à son expiration.
  check('une URL signée valide fonctionne même sans session (capacité, expire en 6 h)', r.status === 200 && r.buf.equals(JPEG), `${r.status}`)
  check('  … Cache-Control private, no-store (T-03)', /private/.test(r.headers.get('cache-control') ?? '') && /no-store/.test(r.headers.get('cache-control') ?? ''), r.headers.get('cache-control'))
  check('  … X-Robots-Tag noindex sur le média protégé (L-11)', (r.headers.get('x-robots-tag') ?? '').includes('noindex'), r.headers.get('x-robots-tag'))
  check('  … Accept-Ranges, ETag, Content-Type', r.headers.get('accept-ranges') === 'bytes' && !!r.headers.get('etag') && r.headers.get('content-type') === 'image/jpeg', `${r.headers.get('accept-ranges')} ${r.headers.get('etag')} ${r.headers.get('content-type')}`)

  r = await anon.req('GET', mainUrl, { headers: { range: 'bytes=0-99' } })
  check('Range bytes=0-99 → 206 + Content-Range (T-02)', r.status === 206 && r.headers.get('content-range') === `bytes 0-99/${JPEG.length}` && r.buf.length === 100, `${r.status} ${r.headers.get('content-range')} ${r.buf.length} o`)
  r = await anon.req('GET', mainUrl, { headers: { range: 'bytes=-24' } })
  check('Range suffixe bytes=-24 → 206', r.status === 206 && r.headers.get('content-range') === `bytes ${JPEG.length - 24}-${JPEG.length - 1}/${JPEG.length}`, `${r.status} ${r.headers.get('content-range')}`)
  r = await anon.req('GET', mainUrl, { headers: { range: `bytes=${JPEG.length + 10}-` } })
  check('Range hors fichier → 416', r.status === 416, `${r.status}`)

  const tampered = new URL(u)
  const sig = tampered.searchParams.get('sig')
  tampered.searchParams.set('sig', (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1))
  r = await anon.req('GET', tampered.toString())
  check('signature altérée → 403', r.status === 403, `${r.status}`)

  const otherDoc = new URL(u)
  otherDoc.pathname = `/m/${docCur}/main`
  r = await anon.req('GET', otherDoc.toString())
  check('signature d\'un autre document → 403', r.status === 403, `${r.status}`)

  const otherVariant = new URL(u)
  otherVariant.pathname = `/m/${docProt}/original`
  r = await anon.req('GET', otherVariant.toString())
  check('signature d\'une autre variante → 403', r.status === 403, `${r.status}`)

  check('URL émise pour l\'admin : drapeau a=1 (capacité admin signée)', u.searchParams.get('a') === '1', mainUrl)
  const noAdmin = new URL(u)
  noAdmin.searchParams.delete('a')
  r = await anon.req('GET', noAdmin.toString())
  check('retirer a=1 invalide la signature → 403', r.status === 403, `${r.status}`)
  const pubMain = (await anon.req('GET', `/api/public/documents/${docPub}`)).data?.mainUrl ?? ''
  const addAdmin = new URL(pubMain, BASE)
  check('URL publique sans drapeau a', !addAdmin.searchParams.has('a'), addAdmin.toString())
  addAdmin.searchParams.set('a', '1')
  r = await anon.req('GET', addAdmin.toString())
  check('ajouter a=1 à une URL publique → 403', r.status === 403, `${r.status}`)

  const unprotect = new URL(u)
  unprotect.searchParams.set('p', '0')
  r = await anon.req('GET', unprotect.toString())
  check('passer p=1 → p=0 invalide la signature → 403', r.status === 403, `${r.status}`)

  const expired = new URL(u)
  expired.searchParams.set('exp', String(Math.floor(now) - 60))
  r = await anon.req('GET', expired.toString())
  check('exp dans le passé (signature d\'origine) → 403', r.status === 403, `${r.status}`)

  const extended = new URL(u)
  extended.searchParams.set('exp', String(exp + 86400))
  r = await anon.req('GET', extended.toString())
  check('exp prolongé sans re-signer → 403', r.status === 403, `${r.status}`)

  if (SIGNING_KEY) {
    const pastExp = Math.floor(now) - 60
    const forged = `/m/${docProt}/main?exp=${pastExp}&p=1&sig=${sign(docProt, 'main', pastExp, 1)}`
    r = await anon.req('GET', forged)
    check('URL correctement signée mais expirée → 403', r.status === 403, `${r.status}`)
    const futureExp = Math.floor(now) + 600
    r = await anon.req('GET', `/m/${docProt}/main?exp=${futureExp}&p=1&sig=${sign(docProt, 'main', futureExp, 1)}`)
    check('  (témoin : la même URL non expirée → 200)', r.status === 200, `${r.status}`)
    r = await anon.req('GET', `/m/${docProt}/main?exp=${futureExp}&p=1&dl=1&sig=${sign(docProt, 'main', futureExp, 1, 1)}`)
    check('téléchargement (dl=1) d\'un document protégé refusé même signé → 403 (F-08)', r.status === 403, `${r.status}`)
  }
  else {
    console.log('  (E2E_MEDIA_SIGNING_KEY non fourni : test « signée mais expirée » remplacé par « exp modifié »)')
  }

  /* ------------------------------ Famille ------------------------------- */
  section(`Mot de passe ${yProt}-${yProt + 1} (critère 12.2 : ouvre jusqu'à ${yProt}-${yProt + 1}, pas ${yCur}-${yCur + 1})`)
  const pw = await mustOk(await admin.req('POST', '/api/admin/passwords', { json: { scoutYear: yProt } }), 'création mot de passe')
  created.passwordId = pw.id
  check(`mot de passe généré « …-${yProt + 1} »`, new RegExp(`-${yProt + 1}$`).test(pw.password), pw.password)

  // Saisie « à la main » : casse et espaces différents (normalisation)
  const typed = `  ${pw.password.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} `
  r = await family.req('POST', '/api/access/unlock', { json: { password: typed } })
  if (r.status === 429) console.log('  ⚠ limite de 5 essais / 15 min atteinte pour cette IP : relancez plus tard.')
  check('POST /api/access/unlock (saisie avec majuscules et espaces) → 200', r.status === 200 && r.data?.maxYear === yProt, `${r.status} ${r.text.slice(0, 200)}`)

  r = await family.req('GET', `/api/public/documents/${docProt}`)
  check(`famille : document ${yProt} lisible avec son titre`, r.status === 200 && r.data?.title === titleProt, `${r.status}`)
  check('  … sans lien de téléchargement (F-08)', r.data?.canDownload === false && r.data?.downloadUrl === null)
  const famMain = r.data?.mainUrl
  check('  … URL famille sans drapeau admin a=1', !!famMain && !/[?&]a=1/.test(famMain), famMain)
  if (famMain) {
    const m = await family.req('GET', famMain, { headers: { range: 'bytes=0-9' } })
    check('  … média servi en 206', m.status === 206, `${m.status}`)
  }
  r = await family.req('GET', `/api/public/years/${yProt}`)
  check(`famille : année ${yProt} déverrouillée avec ses documents`, r.data?.locked === false && r.data?.documents?.some(d => d.id === docProt), `locked=${r.data?.locked}`)

  r = await family.req('GET', `/api/public/documents/${docCur}`)
  check(`famille : document ${yCur} refusé (401)`, r.status === 401 && !r.text.includes(WORD_CUR), `${r.status}`)
  r = await family.req('GET', `/api/public/years/${yCur}`)
  check(`famille : année ${yCur} verrouillée, sans titre`, r.data?.locked === true && !r.text.includes(WORD_CUR), `locked=${r.data?.locked}`)
  r = await family.req('GET', `/api/public/search?q=zorglub`)
  const ids = (r.data?.results ?? []).map(x => x.id)
  check(`famille : la recherche trouve ${yProt}, pas ${yCur} (F-10)`, ids.includes(docProt) && !ids.includes(docCur), JSON.stringify(ids))

  section('Révocation (critère 12.2 : un mot de passe révoqué invalide les sessions)')
  await mustOk(await admin.req('POST', `/api/admin/passwords/${pw.id}`, { json: { action: 'revoke' } }), 'révocation')
  r = await family.req('GET', `/api/public/documents/${docProt}`)
  check('après révocation : document refusé immédiatement (401)', r.status === 401 && !r.text.includes(WORD_PROT), `${r.status}`)
  r = await family.req('GET', `/api/public/years/${yProt}`)
  check('après révocation : année de nouveau verrouillée', r.data?.locked === true && !r.text.includes(WORD_PROT), `locked=${r.data?.locked}`)
  r = await family.req('GET', `/api/public/search?q=${WORD_PROT}`)
  check('après révocation : recherche vide', (r.data?.results?.length ?? -1) === 0, r.text.slice(0, 200))

  /* ------------------------------- Jetons ------------------------------- */
  section('Jeton read+write (I-02, critère 12.2 : sans publish ne rend rien visible)')
  const tok = await mustOk(await admin.req('POST', '/api/admin/tokens', { json: { name: `e2e ${rnd}`, scopes: ['read', 'write'], days: 1 } }), 'création jeton')
  created.tokenId = tok.id
  created.token = tok.token
  const bot = client('jeton', { bearer: tok.token })

  r = await bot.req('POST', '/api/v1/documents:publish', { json: { ids: [docCur] } })
  check('POST /api/v1/documents:publish → 403', r.status === 403, `${r.status}`)
  r = await bot.req('POST', '/api/v1/documents', { json: { year: yCur, kind: 'photo', title: `Bot ${rnd}`, status: 'published' } })
  check('création directement « published » → 403', r.status === 403, `${r.status}`)
  if (r.status < 300 && r.data?.document?.id) created.docs.push(r.data.document.id)
  r = await bot.req('POST', '/api/v1/documents', { json: { year: yCur, kind: 'photo', title: `Bot ${rnd}`, visibility: 'forcePublic' } })
  check('création « forcePublic » → 403', r.status === 403, `${r.status}`)
  if (r.status < 300 && r.data?.document?.id) created.docs.push(r.data.document.id)
  r = await bot.req('PATCH', `/api/v1/documents/${docCur}`, { json: { visibility: 'forcePublic' } })
  check('passer un document existant en forcePublic → 403', r.status === 403, `${r.status}`)
  r = await bot.req('POST', '/api/v1/documents?dryRun=true', { json: { year: yCur, kind: 'photo', title: `Bot ${rnd}` } })
  check('création en brouillon autorisée (dryRun)', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`)

  for (const path of ['/api/admin/passwords', '/api/admin/settings', '/api/admin/tokens']) {
    r = await bot.req('GET', path)
    check(`GET ${path} avec jeton → 401`, r.status === 401, `${r.status}`)
  }
  r = await bot.req('PUT', '/api/admin/settings', { json: { pivotYear: 2030 } })
  check('PUT /api/admin/settings (pivot) avec jeton → 401', r.status === 401, `${r.status}`)
  r = await bot.req('POST', '/api/admin/passwords', { json: { scoutYear: yCur } })
  check('POST /api/admin/passwords avec jeton → 401', r.status === 401, `${r.status}`)

  section('Serveur MCP (I-11, I-12)')
  r = await bot.req('POST', '/mcp', { json: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })
  const tools = (r.data?.result?.tools ?? []).map(t => t.name)
  check('tools/list avec le jeton → liste d\'outils', r.status === 200 && tools.includes('get_conventions') && tools.includes('create_documents'), `${r.status} ${tools.join(',')}`)
  check('  … sans publish_documents', !tools.includes('publish_documents'))
  r = await bot.req('POST', '/mcp', { json: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'publish_documents', arguments: { ids: [docCur] } } } })
  check('tools/call publish_documents → erreur de portée', r.data?.result?.isError === true, r.text.slice(0, 200))
  r = await anon.req('POST', '/mcp', { json: { jsonrpc: '2.0', id: 3, method: 'tools/list' } })
  check('POST /mcp sans jeton → 401', r.status === 401, `${r.status}`)
}

async function cleanup() {
  section('Nettoyage')
  try {
    if (created.tokenId) {
      const r = await admin.req('DELETE', `/api/admin/tokens/${created.tokenId}`)
      check('jeton révoqué', r.status === 200, `${r.status}`)
      const m = await client('jeton révoqué', { bearer: created.token }).req('POST', '/mcp', { json: { jsonrpc: '2.0', id: 9, method: 'tools/list' } })
      check('  … un jeton révoqué est refusé immédiatement (401)', m.status === 401, `${m.status}`)
    }
    if (created.passwordId) await admin.req('POST', `/api/admin/passwords/${created.passwordId}`, { json: { action: 'revoke' } })
    if (created.docs.length) {
      const t = await admin.req('POST', '/api/v1/documents:trash', { json: { ids: created.docs } })
      let purged = 0
      for (const id of created.docs) {
        const p = await admin.req('POST', `/api/admin/trash/${id}`, { json: { action: 'purge' } })
        if (p.status === 200) purged++
      }
      check(`documents mis à la corbeille puis purgés (${purged}/${created.docs.length})`, t.status === 200 && purged === created.docs.length)
    }
    for (const y of created.years) {
      const r = await admin.req('DELETE', `/api/v1/years/${y}`)
      check(`année ${y} créée par la recette supprimée`, r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
    }
    await admin.req('POST', '/api/admin/logout')
  }
  catch (e) {
    check('nettoyage', false, e.message)
  }
}

try {
  await main()
}
catch (e) {
  check('déroulé de la recette', false, e.stack ?? String(e))
}
finally {
  await cleanup()
}
console.log(`\n${passes} ✓, ${failures} ✗`)
process.exit(failures ? 1 : 0)
