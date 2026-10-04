import type { H3Event } from 'h3'
import { and, eq, lt } from 'drizzle-orm'
import type { Actor } from './auth'
import type { DocumentRow } from './catalog'

export function isDryRun(event: H3Event) {
  const v = getQuery(event).dryRun
  return v === 'true' || v === '1'
}

/** I-07 : en-tête Idempotency-Key sur toute création. */
export async function withIdempotency<T>(event: H3Event, actor: Actor, fn: () => Promise<T>): Promise<T> {
  const key = getHeader(event, 'idempotency-key')
  if (!key || isDryRun(event)) return fn()
  if (key.length > 200) throw problem(400, 'Idempotency-Key trop long')
  const fullKey = `${actor.tokenId ?? actor.userId}:${event.path.split('?')[0]}:${key}`
  const hit = await db.query.idempotency.findFirst({ where: eq(schema.idempotency.key, fullKey) })
  if (hit) {
    setResponseStatus(event, hit.status)
    setHeader(event, 'Idempotent-Replayed', 'true')
    return hit.response as T
  }
  const res = await fn()
  await db.insert(schema.idempotency).values({ key: fullKey, response: res as any, status: getResponseStatus(event) || 200, createdAt: Date.now() }).onConflictDoNothing()
  return res
}

export async function purgeIdempotency() {
  await db.delete(schema.idempotency).where(lt(schema.idempotency.createdAt, Date.now() - 7 * 86400_000))
}

/** Vue complète d'un document pour l'admin et l'API. */
export async function serializeAdminDoc(doc: DocumentRow, yearStart: number, withMedia = false) {
  const tags = withMedia
    ? (await db.select({ label: schema.tag.label }).from(schema.documentTag).innerJoin(schema.tag, eq(schema.tag.id, schema.documentTag.tagId)).where(eq(schema.documentTag.documentId, doc.id))).map(t => t.label)
    : undefined
  const sign = (v: 'main' | 'thumb' | 'captions' | 'original') => signMediaUrl(doc.id, v, { protected: true, admin: true, version: doc.updatedAt })
  return {
    id: doc.id,
    externalId: doc.externalId,
    yearStart,
    yearLabel: scoutYearLabel(yearStart),
    eventId: doc.eventId,
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    branch: doc.branch,
    place: doc.place,
    date: doc.date,
    credits: doc.credits,
    people: doc.people,
    visibility: doc.visibility,
    status: doc.status,
    downloadable: doc.downloadable,
    duration: doc.duration,
    width: doc.width,
    height: doc.height,
    size: doc.size,
    originalSize: doc.originalSize,
    mime: doc.mime,
    chapters: doc.chapters,
    hasFile: !!doc.storageKey,
    hasThumb: !!doc.thumbKey,
    hasOriginal: !!doc.originalKey,
    hasCaptions: !!doc.captionsKey,
    streamUid: doc.streamUid,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    publishedAt: doc.publishedAt,
    trashedAt: doc.trashedAt,
    thumbUrl: doc.thumbKey ? await sign('thumb') : null,
    ...(withMedia
      ? {
          tags,
          mainUrl: doc.storageKey ? await sign('main') : null,
          captionsUrl: doc.captionsKey ? await sign('captions') : null,
          originalUrl: doc.originalKey ? await sign('original') : null,
        }
      : {}),
  }
}

export async function loadDocWithYear(id: string) {
  const r = await db.select({ doc: schema.document, yearStart: schema.year.startYear }).from(schema.document)
    .innerJoin(schema.year, eq(schema.year.id, schema.document.yearId))
    .where(and(eq(schema.document.id, id), eq(schema.document.instanceId, instanceId()))).get()
  if (!r) throw problem(404, `Document ${id} introuvable`)
  return r
}

/** plan_import (I-12) : classement proposé à partir des chemins de fichiers. */
export async function planImport(files: { path: string, size?: number, duration?: number }[]) {
  const inst = await getInstance()
  const years = await db.select().from(schema.year).where(eq(schema.year.instanceId, inst.id))
  const yearSet = new Map(years.map(y => [y.startYear, y]))
  const events = await db.select().from(schema.event).where(eq(schema.event.instanceId, inst.id))
  const existingDocs = await db.select({ id: schema.document.id, externalId: schema.document.externalId }).from(schema.document).where(eq(schema.document.instanceId, inst.id))
  const extMap = new Map(existingDocs.filter(d => d.externalId).map(d => [d.externalId!, d.id]))

  const items = files.map((f) => {
    // Les dossiers comptent comme des segments : 2019_camp-ete/SG_montage.mp4
    const segs = f.path.split(/[\\/]/).filter(Boolean)
    const flat = segs.slice(-3).join('_')
    const g = parseFilename(flat, { branches: inst.branches, eventTypes: inst.eventTypes, switchMonth: inst.switchMonth })
    const fileGuess = parseFilename(segs.at(-1)!, { branches: inst.branches, eventTypes: inst.eventTypes, switchMonth: inst.switchMonth })
    const y = g.scoutYear
    const yearRow = y !== undefined ? yearSet.get(y) : undefined
    const evTitle = g.eventType ?? null
    const ev = evTitle && yearRow ? events.find(e => e.yearId === yearRow.id && slugify(e.title) === slugify(evTitle)) : undefined
    const bitrate = f.size && f.duration ? Math.round(f.size * 8 / f.duration) : null
    const issues: string[] = []
    if (!g.kind) issues.push('type de fichier non reconnu')
    if (y === undefined) issues.push('année introuvable dans le chemin')
    if (g.kind === 'video' && bitrate && bitrate > 4_200_000) issues.push(`débit estimé ${(bitrate / 1e6).toFixed(1)} Mbit/s : ré-encodage nécessaire`)
    if (g.kind === 'video' && !/\.(mp4|m4v)$/i.test(f.path)) issues.push('conteneur non MP4 : ré-encodage nécessaire')
    return {
      path: f.path,
      externalId: f.path,
      existingDocumentId: extMap.get(f.path) ?? null,
      kind: g.kind,
      year: y ?? null,
      yearLabel: y !== undefined ? scoutYearLabel(y) : null,
      yearExists: !!yearRow,
      event: evTitle ? { title: evTitle, type: evTitle, exists: !!ev, id: ev?.id ?? null } : null,
      branch: g.branch ?? null,
      date: g.date ?? null,
      title: fileGuess.title || g.title,
      needsEncoding: g.kind === 'video' && issues.some(i => i.includes('ré-encodage')),
      ffmpeg: g.kind === 'video' ? ffmpegCommand(segs.at(-1)!, segs.at(-1)!.replace(/\.[^.]+$/, '') + '_720p.mp4') : null,
      issues,
    }
  })
  const missingYears = [...new Set(items.filter(i => i.year !== null && !i.yearExists).map(i => i.year!))].sort()
  const newEvents = [...new Map(items.filter(i => i.event && !i.event.exists).map(i => [`${i.year}:${i.event!.title}`, { year: i.year, title: i.event!.title }])).values()]
  return {
    namingRule: NAMING_RULE,
    summary: { files: items.length, missingYears, newEvents, alreadyImported: items.filter(i => i.existingDocumentId).length, withIssues: items.filter(i => i.issues.length).length },
    items,
    next: 'Faites valider ce plan par un humain, puis : upsert_year pour les années manquantes, create_documents (avec externalId = path), request_upload / complete_upload pour chaque fichier.',
  }
}
