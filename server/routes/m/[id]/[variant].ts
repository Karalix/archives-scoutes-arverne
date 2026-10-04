import { eq, sql } from 'drizzle-orm'

const VARIANT_FIELD = { main: 'storageKey', thumb: 'thumbKey', captions: 'captionsKey', original: 'originalKey', display: 'displayKey' } as const

function parseRange(header: string | undefined, size: number): { offset: number, length: number } | null | 'invalid' {
  if (!header) return null
  const m = header.match(/^bytes=(\d*)-(\d*)$/)
  if (!m) return 'invalid'
  let start: number
  let end: number
  if (m[1] === '' && m[2] !== '') {
    const suffix = Number(m[2])
    start = Math.max(0, size - suffix)
    end = size - 1
  }
  else {
    start = Number(m[1])
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
  }
  if (Number.isNaN(start) || start >= size || end < start) return 'invalid'
  return { offset: start, length: end - start + 1 }
}

// T-02 : diffusion des médias. Vérifie la signature puis lit le stockage avec la plage demandée.
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') throw problem(405, 'Méthode non autorisée')
  const id = getRouterParam(event, 'id')!
  const variant = getRouterParam(event, 'variant')! as keyof typeof VARIANT_FIELD
  if (!(variant in VARIANT_FIELD)) throw problem(404, 'Variante inconnue')
  const sig = await verifyMediaSignature(id, variant, getQuery(event))
  if (!sig) throw problem(403, 'Lien expiré ou invalide : rechargez la page.')

  const doc = await db.query.document.findFirst({ where: eq(schema.document.id, id) })
  const key = doc?.[VARIANT_FIELD[variant]]
  if (!doc || !key || doc.status === 'trashed') throw problem(404, 'Média introuvable')

  // Défense en profondeur : si le document est devenu masqué ou protégé depuis la signature
  const inst = await getInstance()
  const yr = await db.query.year.findFirst({ where: eq(schema.year.id, doc.yearId) })
  const ai = accessInstance(inst)
  const nowD = new Date()
  const nowProtected = isProtectedDoc({ yearStart: yr!.startYear, visibility: doc.visibility, status: doc.status }, ai, nowD)
  const needsCheck = !sig.admin && (variant === 'original' || doc.status !== 'published' || doc.visibility === 'hidden' || (nowProtected && !sig.protected))
  if (needsCheck) {
    const access = await getAccess(event)
    if (variant === 'original' && !access.admin) throw problem(403, 'Originaux réservés aux administrateurs')
    if (!canView({ yearStart: yr!.startYear, visibility: doc.visibility, status: doc.status }, toAccessSession(access), ai, nowD).allowed) {
      throw problem(403, 'Accès refusé')
    }
  }
  if (sig.download && nowProtected && !sig.admin) throw problem(403, 'Téléchargement interdit pour les archives récentes')

  const storage = useStorageDriver(event)
  const head = await storage.head(key)
  if (!head) throw problem(404, 'Fichier absent du stockage')

  const isProtected = sig.protected || nowProtected
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Content-Type': head.contentType || doc.mime || 'application/octet-stream',
    'ETag': head.etag,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': isProtected ? 'private, no-store, max-age=0' : 'public, max-age=86400',
    'Cross-Origin-Resource-Policy': 'same-origin',
  })
  if (isProtected) headers.set('X-Robots-Tag', 'noindex, nofollow')
  // L-13 : jamais de HTML/SVG servi inline
  const unsafe = /html|svg|xml|javascript/i.test(headers.get('Content-Type')!)
  if (sig.download || unsafe || variant === 'original') {
    const ext = (doc.mime?.split('/')[1] ?? 'bin').replace('mpeg', 'mp3').replace('quicktime', 'mov')
    const name = `${slugify(doc.title) || 'document'}.${variant === 'captions' ? 'vtt' : ext}`
    headers.set('Content-Disposition', `attachment; filename="${name}"`)
  }
  else {
    headers.set('Content-Disposition', 'inline')
  }

  const inm = getHeader(event, 'if-none-match')
  if (inm && inm === head.etag) return new Response(null, { status: 304, headers })

  const range = parseRange(getHeader(event, 'range'), head.size)
  if (range === 'invalid') {
    headers.set('Content-Range', `bytes */${head.size}`)
    return new Response(null, { status: 416, headers })
  }
  if (event.method === 'HEAD') {
    headers.set('Content-Length', String(head.size))
    return new Response(null, { status: 200, headers })
  }
  const obj = await storage.get(key, range ?? undefined)
  if (!obj) throw problem(404, 'Fichier absent du stockage')
  const served = range ? range.length : head.size
  if (range) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`)
    headers.set('Content-Length', String(range.length))
  }
  else {
    headers.set('Content-Length', String(head.size))
  }

  // A-15 : bande passante du mois (en arrière-plan)
  const month = new Date().toISOString().slice(0, 7)
  const track = db.insert(schema.usageStat).values({ month, instanceId: instanceId(), bytesServed: served, views: variant === 'main' && (!range || range.offset === 0) ? 1 : 0 })
    .onConflictDoUpdate({
      target: [schema.usageStat.instanceId, schema.usageStat.month],
      set: { bytesServed: sql`${schema.usageStat.bytesServed} + ${served}`, views: sql`${schema.usageStat.views} + ${variant === 'main' && (!range || range.offset === 0) ? 1 : 0}` },
    }).catch(() => {})
  event.waitUntil?.(track)

  return new Response(obj.body, { status: range ? 206 : 200, headers })
})
