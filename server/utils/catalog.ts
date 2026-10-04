import { and, asc, desc, eq, inArray, ne, or, sql, lte } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { AccessSession } from '#shared/utils/access'
import type { AccessContext, Actor } from './auth'
import type { StorageDriver } from './storage'
import type { InstanceRow } from './instance'

export type DocumentRow = typeof schema.document.$inferSelect
export type YearRow = typeof schema.year.$inferSelect
export type EventRow = typeof schema.event.$inferSelect

export function toAccessSession(ctx: AccessContext): AccessSession {
  return { isAdmin: !!ctx.admin, family: ctx.family }
}

/** Condition SQL équivalente à canView() pour filtrer les listes et la recherche (F-10). */
export function visibleDocsWhere(inst: InstanceRow, ctx: AccessContext): SQL {
  const d = schema.document
  const base = and(eq(d.instanceId, inst.id), ne(d.status, 'trashed'))!
  if (ctx.admin) return base
  const pivot = effectivePivot(accessInstance(inst), new Date())
  const familyMax = ctx.family && ctx.family.expiresAt > Date.now() ? ctx.family.maxYear : null
  const conds: (SQL | undefined)[] = [
    eq(d.visibility, 'forcePublic'),
    and(ne(d.visibility, 'forcePrivate'), lte(schema.year.startYear, pivot)),
  ]
  if (familyMax !== null) conds.push(lte(schema.year.startYear, familyMax))
  return and(base, eq(d.status, 'published'), ne(d.visibility, 'hidden'), or(...conds))!
}

/* -------------------------------------------------------------------------- */
/*                               Sérialisation                                 */
/* -------------------------------------------------------------------------- */

export interface PublicDocSummary {
  id: string
  kind: DocumentRow['kind']
  title: string
  description: string
  branch: string | null
  place: string
  date: string | null
  eventId: string | null
  duration: number | null
  credits: string
  thumbUrl: string | null
  protected: boolean
}

export async function serializeSummary(doc: DocumentRow, yearStart: number, inst: InstanceRow): Promise<PublicDocSummary> {
  const prot = isProtectedDoc({ yearStart, visibility: doc.visibility, status: doc.status }, accessInstance(inst), new Date())
  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    branch: doc.branch,
    place: doc.place,
    date: doc.date,
    eventId: doc.eventId,
    duration: doc.duration,
    credits: doc.credits,
    thumbUrl: doc.thumbKey ? await signMediaUrl(doc.id, 'thumb', { protected: prot, version: doc.updatedAt }) : null,
    protected: prot,
  }
}

export async function serializeDetail(doc: DocumentRow, yearStart: number, inst: InstanceRow, ctx: AccessContext) {
  const ai = accessInstance(inst)
  const now = new Date()
  const prot = isProtectedDoc({ yearStart, visibility: doc.visibility, status: doc.status }, ai, now)
  const dl = canDownload({ yearStart, visibility: doc.visibility, status: doc.status, downloadable: doc.downloadable }, inst.settings.publicDownloads, ai, now)
  const tags = await db.select({ label: schema.tag.label }).from(schema.documentTag)
    .innerJoin(schema.tag, eq(schema.tag.id, schema.documentTag.tagId))
    .where(eq(schema.documentTag.documentId, doc.id))
  const ev = doc.eventId ? await db.query.event.findFirst({ where: eq(schema.event.id, doc.eventId) }) : null
  return {
    ...(await serializeSummary(doc, yearStart, inst)),
    yearStart,
    event: ev ? { id: ev.id, title: ev.title, type: ev.type, place: ev.place } : null,
    people: inst.settings.peopleField ? doc.people : '',
    width: doc.width,
    height: doc.height,
    size: doc.size,
    mime: doc.mime,
    chapters: doc.chapters ?? [],
    tags: tags.map(t => t.label),
    mainUrl: doc.storageKey ? await signMediaUrl(doc.id, 'main', { protected: prot, version: doc.updatedAt }) : null,
    captionsUrl: doc.captionsKey ? await signMediaUrl(doc.id, 'captions', { protected: prot, version: doc.updatedAt }) : null,
    downloadUrl: dl && doc.storageKey ? await signMediaUrl(doc.id, 'main', { protected: false, download: true, version: doc.updatedAt }) : null,
    streamUrl: inst.settings.streamEnabled && doc.streamUid ? await streamPlaybackToken(inst, doc.streamUid).then(t => `https://iframe.videodelivery.net/${t}`).catch(() => null) : null,
    canDownload: dl,
    isAdmin: !!ctx.admin,
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Consultation                                */
/* -------------------------------------------------------------------------- */

export async function listYearsForFront(inst: InstanceRow, ctx: AccessContext) {
  const ai = accessInstance(inst)
  const now = new Date()
  const session = toAccessSession(ctx)
  const years = await db.select().from(schema.year).where(eq(schema.year.instanceId, inst.id)).orderBy(desc(schema.year.startYear))
  // Compteur : documents publiés et non masqués (visible même pour une année protégée, 3.4)
  const counts = await db.select({ yearId: schema.document.yearId, n: sql<number>`count(*)` })
    .from(schema.document)
    .where(and(eq(schema.document.instanceId, inst.id), eq(schema.document.status, 'published'), ne(schema.document.visibility, 'hidden')))
    .groupBy(schema.document.yearId)
  const countMap = new Map(counts.map(c => [c.yearId, Number(c.n)]))
  const coverIds = years.map(y => y.coverDocumentId).filter(Boolean) as string[]
  const covers = coverIds.length ? await db.select().from(schema.document).where(inArray(schema.document.id, coverIds)) : []
  const coverMap = new Map(covers.map(c => [c.id, c]))

  const out = []
  for (const y of years) {
    const count = countMap.get(y.id) ?? 0
    if (!count && !ctx.admin) continue
    const open = canViewYear(y.startYear, session, ai, now)
    let coverUrl: string | null = null
    if (open && y.coverDocumentId) {
      const c = coverMap.get(y.coverDocumentId)
      if (c?.thumbKey && canView({ yearStart: y.startYear, visibility: c.visibility, status: c.status }, session, ai, now).allowed) {
        coverUrl = await signMediaUrl(c.id, 'thumb', { protected: !isPublicYear(y.startYear, ai, now), version: c.updatedAt })
      }
    }
    out.push({
      startYear: y.startYear,
      label: scoutYearLabel(y.startYear),
      count,
      locked: !open,
      public: isPublicYear(y.startYear, ai, now),
      description: open ? y.description : '',
      coverUrl,
    })
  }
  return out
}

export async function getYearPage(inst: InstanceRow, ctx: AccessContext, startYear: number) {
  const ai = accessInstance(inst)
  const now = new Date()
  const session = toAccessSession(ctx)
  const y = await db.query.year.findFirst({ where: and(eq(schema.year.instanceId, inst.id), eq(schema.year.startYear, startYear)) })
  if (!y) throw problem(404, `Année ${scoutYearLabel(startYear)} introuvable`)

  // Navigation : seulement les années qui ont du contenu publié (toutes pour un admin)
  const allYears = ctx.admin
    ? await db.select({ s: schema.year.startYear }).from(schema.year).where(eq(schema.year.instanceId, inst.id)).orderBy(asc(schema.year.startYear))
    : await db.selectDistinct({ s: schema.year.startYear }).from(schema.year)
      .innerJoin(schema.document, eq(schema.document.yearId, schema.year.id))
      .where(and(eq(schema.year.instanceId, inst.id), eq(schema.document.status, 'published'), ne(schema.document.visibility, 'hidden')))
      .orderBy(asc(schema.year.startYear))
  const idx = allYears.findIndex(a => a.s === startYear)
  const prev = idx > 0 ? allYears[idx - 1]!.s : null
  const next = idx >= 0 && idx < allYears.length - 1 ? allYears[idx + 1]!.s : null

  const docs = await db.select().from(schema.document)
    .where(and(eq(schema.document.yearId, y.id), ctx.admin ? ne(schema.document.status, 'trashed') : and(eq(schema.document.status, 'published'), ne(schema.document.visibility, 'hidden'))))
    .orderBy(asc(schema.document.date), asc(schema.document.title))
  const total = docs.length
  const open = canViewYear(startYear, session, ai, now)
  const visible = docs.filter(d => canView({ yearStart: startYear, visibility: d.visibility, status: d.status }, session, ai, now).allowed)
  const base = {
    startYear,
    label: scoutYearLabel(startYear),
    public: isPublicYear(startYear, ai, now),
    locked: !open,
    count: total,
    prev,
    next,
  }
  if (!open && !visible.length) {
    // 3.4 : libellé et nombre de documents seulement
    return { ...base, description: '', events: [], documents: [], hiddenCount: total }
  }
  const events = await db.select().from(schema.event).where(eq(schema.event.yearId, y.id)).orderBy(asc(schema.event.sort), asc(schema.event.startDate))
  const usedEventIds = new Set(visible.map(d => d.eventId))
  return {
    ...base,
    description: open ? y.description : '',
    events: events.filter(e => usedEventIds.has(e.id)).map(e => ({ id: e.id, title: e.title, type: e.type, place: e.place, startDate: e.startDate, endDate: e.endDate, branch: e.branch })),
    documents: await Promise.all(visible.map(d => serializeSummary(d, startYear, inst))),
    hiddenCount: total - visible.length,
  }
}

export async function getDocumentForFront(inst: InstanceRow, ctx: AccessContext, id: string) {
  const row = await db.select({ doc: schema.document, yearStart: schema.year.startYear })
    .from(schema.document).innerJoin(schema.year, eq(schema.year.id, schema.document.yearId))
    .where(and(eq(schema.document.id, id), eq(schema.document.instanceId, inst.id))).get()
  if (!row || (row.doc.status === 'trashed' && !ctx.admin)) throw problem(404, 'Document introuvable')
  const decision = canView({ yearStart: row.yearStart, visibility: row.doc.visibility, status: row.doc.status }, toAccessSession(ctx), accessInstance(inst), new Date())
  if (!decision.allowed) {
    if (decision.reason === 'unpublished' || decision.reason === 'hidden') throw problem(404, 'Document introuvable')
    // Ne révèle ni titre ni vignette (L-04)
    throw problem(401, 'Ce document fait partie des archives récentes : saisissez le mot de passe annuel.', { reason: decision.reason, yearStart: row.yearStart })
  }
  return serializeDetail(row.doc, row.yearStart, inst, ctx)
}

export async function searchDocuments(inst: InstanceRow, ctx: AccessContext, opts: { q?: string, place?: string, kind?: string, branch?: string, year?: number, status?: string, limit?: number }) {
  const d = schema.document
  const conds: (SQL | undefined)[] = [visibleDocsWhere(inst, ctx)]
  if (opts.place) conds.push(eq(d.place, opts.place))
  if (opts.kind) conds.push(eq(d.kind, opts.kind as any))
  if (opts.branch) conds.push(eq(d.branch, opts.branch))
  if (opts.year !== undefined) conds.push(eq(schema.year.startYear, opts.year))
  if (opts.status && ctx.admin) conds.push(eq(d.status, opts.status as any))
  const q = opts.q?.trim()
  if (q) {
    // Requête FTS5 : chaque mot en préfixe, guillemets échappés
    const match = q.split(/\s+/).filter(Boolean).map(w => `"${w.replace(/"/g, '""')}"*`).join(' ')
    conds.push(sql`${d.id} IN (SELECT document_id FROM document_fts WHERE document_fts MATCH ${match})`)
  }
  const rows = await db.select({ doc: d, yearStart: schema.year.startYear })
    .from(d).innerJoin(schema.year, eq(schema.year.id, d.yearId))
    .where(and(...conds))
    .orderBy(desc(schema.year.startYear), asc(d.title))
    .limit(Math.min(opts.limit ?? 100, 500))
  return Promise.all(rows.map(async r => ({ ...(await serializeSummary(r.doc, r.yearStart, inst)), yearStart: r.yearStart, status: r.doc.status })))
}

/** Lieux de camp saisis (F-11), limités aux documents visibles. */
export async function listPlaces(inst: InstanceRow, ctx: AccessContext) {
  const rows = await db.selectDistinct({ place: schema.document.place })
    .from(schema.document).innerJoin(schema.year, eq(schema.year.id, schema.document.yearId))
    .where(and(visibleDocsWhere(inst, ctx), ne(schema.document.place, '')))
    .orderBy(asc(schema.document.place))
  return rows.map(r => r.place)
}

/* -------------------------------------------------------------------------- */
/*                              Écriture (métier)                              */
/* -------------------------------------------------------------------------- */

export async function findYear(startYear: number) {
  return db.query.year.findFirst({ where: and(eq(schema.year.instanceId, instanceId()), eq(schema.year.startYear, startYear)) })
}

export async function upsertYear(actor: Actor, input: { startYear: number, description?: string, coverDocumentId?: string | null }, dryRun = false) {
  const existing = await findYear(input.startYear)
  if (dryRun) return { action: existing ? 'update' : 'create', year: existing ?? { startYear: input.startYear } }
  const ts = Date.now()
  if (existing) {
    const patch: Partial<YearRow> = { updatedAt: ts }
    if (input.description !== undefined) patch.description = input.description
    if (input.coverDocumentId !== undefined) patch.coverDocumentId = input.coverDocumentId
    await db.update(schema.year).set(patch).where(eq(schema.year.id, existing.id))
    await audit(actor, 'year.update', `year:${input.startYear}`, existing, patch)
    return { action: 'update', year: { ...existing, ...patch } }
  }
  const row: YearRow = { id: newId(), instanceId: instanceId(), startYear: input.startYear, description: input.description ?? '', coverDocumentId: input.coverDocumentId ?? null, createdAt: ts, updatedAt: ts }
  await db.insert(schema.year).values(row)
  await audit(actor, 'year.create', `year:${input.startYear}`, null, row)
  return { action: 'create', year: row }
}

export interface EventInput {
  id?: string
  year: number
  type?: string
  title: string
  place?: string
  startDate?: string | null
  endDate?: string | null
  branch?: string | null
  coverDocumentId?: string | null
}

async function guessEventType(title: string) {
  const inst = await getInstance()
  const slug = slugify(title)
  return inst.eventTypes.find(t => slug.startsWith(slugify(t))) ?? inst.eventTypes.find(t => slugify(t) === 'autre') ?? 'Autre'
}

export async function upsertEvent(actor: Actor, input: EventInput, dryRun = false) {
  const y = await findYear(input.year)
  if (!y) throw problem(422, `Année ${scoutYearLabel(input.year)} inexistante`, { hint: `Créez-la avec POST /api/v1/years {"startYear": ${input.year}}` })
  let existing: EventRow | undefined
  if (input.id) existing = await db.query.event.findFirst({ where: eq(schema.event.id, input.id) })
  if (!existing) {
    const evs = await db.select().from(schema.event).where(eq(schema.event.yearId, y.id))
    existing = evs.find(e => slugify(e.title) === slugify(input.title))
  }
  if (dryRun) return { action: existing ? 'update' : 'create', event: existing ?? { ...input, yearId: y.id } }
  const ts = Date.now()
  if (existing) {
    const patch: Partial<EventRow> = { updatedAt: ts, yearId: y.id }
    for (const k of ['type', 'title', 'place', 'startDate', 'endDate', 'branch', 'coverDocumentId'] as const) {
      if (input[k] !== undefined) (patch as any)[k] = input[k]
    }
    await db.update(schema.event).set(patch).where(eq(schema.event.id, existing.id))
    await audit(actor, 'event.update', `event:${existing.id}`, existing, patch)
    return { action: 'update', event: { ...existing, ...patch } }
  }
  const row: EventRow = {
    id: newId(), instanceId: instanceId(), yearId: y.id, type: input.type ?? await guessEventType(input.title), title: input.title, place: input.place ?? '',
    startDate: input.startDate ?? null, endDate: input.endDate ?? null, branch: input.branch ?? null, coverDocumentId: input.coverDocumentId ?? null, sort: 0, createdAt: ts, updatedAt: ts,
  }
  await db.insert(schema.event).values(row)
  await audit(actor, 'event.create', `event:${row.id}`, null, row)
  return { action: 'create', event: row }
}

export interface DocumentInput {
  id?: string
  externalId?: string | null
  year?: number
  eventId?: string | null
  event?: { title: string, type?: string, place?: string, startDate?: string, endDate?: string } | null
  kind?: DocumentRow['kind']
  title?: string
  description?: string
  branch?: string | null
  place?: string
  date?: string | null
  credits?: string
  people?: string
  visibility?: DocumentRow['visibility']
  status?: 'draft' | 'published'
  downloadable?: boolean | null
  tags?: string[]
  chapters?: { start: number, title: string }[] | null
}

function assertBranch(inst: InstanceRow, branch: string | null | undefined) {
  if (branch && !inst.branches.some(b => b.key === branch)) {
    throw problem(422, `Branche « ${branch} » inconnue`, { hint: `Branches valides : ${inst.branches.map(b => b.key).join(', ')} (GET /api/v1/settings)` })
  }
}

async function setTags(docId: string, tags: string[]) {
  await db.delete(schema.documentTag).where(eq(schema.documentTag.documentId, docId))
  const clean = [...new Set(tags.map(t => t.trim()).filter(Boolean))]
  for (const label of clean) {
    let t = await db.query.tag.findFirst({ where: and(eq(schema.tag.instanceId, instanceId()), eq(schema.tag.label, label)) })
    if (!t) {
      t = { id: newId(), instanceId: instanceId(), label }
      await db.insert(schema.tag).values(t).onConflictDoNothing()
      t = (await db.query.tag.findFirst({ where: and(eq(schema.tag.instanceId, instanceId()), eq(schema.tag.label, label)) }))!
    }
    await db.insert(schema.documentTag).values({ documentId: docId, tagId: t.id }).onConflictDoNothing()
  }
}

/**
 * Crée ou met à jour un document (création : brouillon, sauf acteur avec portée publish).
 * Idempotent par externalId (I-07). dryRun : renvoie le plan sans écrire (I-08).
 */
export async function upsertDocument(actor: Actor, input: DocumentInput, opts: { dryRun?: boolean } = {}) {
  const inst = await getInstance()
  assertBranch(inst, input.branch)
  let existing: DocumentRow | undefined
  if (input.id) {
    existing = await db.query.document.findFirst({ where: and(eq(schema.document.id, input.id), eq(schema.document.instanceId, inst.id)) })
    if (!existing) throw problem(404, `Document ${input.id} introuvable`)
  }
  else if (input.externalId) {
    existing = await db.query.document.findFirst({ where: and(eq(schema.document.instanceId, inst.id), eq(schema.document.externalId, input.externalId)) })
  }

  // Année
  let yearRow: YearRow | undefined
  if (input.year !== undefined) {
    yearRow = await findYear(input.year)
    if (!yearRow) throw problem(422, `Année ${scoutYearLabel(input.year)} inexistante`, { hint: `Créez-la avec POST /api/v1/years {"startYear": ${input.year}}` })
  }
  else if (existing) {
    yearRow = await db.query.year.findFirst({ where: eq(schema.year.id, existing.yearId) })
  }
  else {
    throw problem(422, 'Champ « year » requis (année scoute de début, ex. 2019 pour 2019-2020)')
  }

  // Événement : par identifiant ou par titre (créé si besoin)
  let eventId = input.eventId !== undefined ? input.eventId : existing?.eventId ?? null
  let eventPlan: unknown = null
  if (input.event) {
    const r = await upsertEvent(actor, { year: yearRow!.startYear, ...input.event }, opts.dryRun)
    eventPlan = { action: r.action, title: input.event.title }
    eventId = (r.event as any).id ?? null
  }
  if (input.eventId) {
    const ev = await db.query.event.findFirst({ where: eq(schema.event.id, input.eventId) })
    if (!ev || ev.yearId !== yearRow!.id) throw problem(422, `Événement ${input.eventId} introuvable dans l'année ${scoutYearLabel(yearRow!.startYear)}`)
  }

  // Publication : jamais sans la portée publish (I-02, critère 12.2)
  let status = input.status ?? existing?.status ?? 'draft'
  if (status === 'trashed') status = 'draft'
  if (status === 'published' && existing?.status !== 'published' && !actor.scopes.includes('publish')) {
    throw problem(403, 'Publication interdite pour cet acteur', { hint: 'Laissez status à « draft » : un éditeur publiera depuis l\'admin ou avec un jeton de portée publish.' })
  }
  if (existing?.status === 'published' && actor.role === 'contributor') {
    throw problem(403, 'Un contributeur ne modifie pas un document publié')
  }
  if (input.visibility && existing && input.visibility !== existing.visibility && !actor.scopes.includes('publish')) {
    throw problem(403, 'Changer la visibilité d\'un document existant demande la portée publish')
  }
  if (!existing && input.visibility === 'forcePublic' && !actor.scopes.includes('publish')) {
    throw problem(403, 'Rendre un document public demande la portée publish')
  }

  if (opts.dryRun) {
    return {
      action: existing ? 'update' : 'create',
      id: existing?.id ?? null,
      year: yearRow!.startYear,
      yearLabel: scoutYearLabel(yearRow!.startYear),
      event: eventPlan ?? (eventId ? { id: eventId } : null),
      status,
    }
  }

  const ts = Date.now()
  if (existing) {
    const patch: Partial<DocumentRow> = { updatedAt: ts, yearId: yearRow!.id, eventId, status }
    for (const k of ['kind', 'title', 'description', 'branch', 'place', 'date', 'credits', 'people', 'visibility', 'downloadable', 'chapters', 'externalId'] as const) {
      if (input[k] !== undefined) (patch as any)[k] = input[k]
    }
    if (status === 'published' && existing.status !== 'published') patch.publishedAt = ts
    await db.update(schema.document).set(patch).where(eq(schema.document.id, existing.id))
    if (input.tags) await setTags(existing.id, input.tags)
    const changedVisibility = patch.visibility && patch.visibility !== existing.visibility
    await audit(actor, changedVisibility ? 'document.visibility' : 'document.update', `document:${existing.id}`, pick(existing, Object.keys(patch)), patch)
    return { action: 'update', id: existing.id, document: { ...existing, ...patch } }
  }

  if (!input.kind) throw problem(422, 'Champ « kind » requis (video, photo, pdf ou audio)')
  if (!input.title) throw problem(422, 'Champ « title » requis')
  const row: DocumentRow = {
    id: newId(), instanceId: inst.id, yearId: yearRow!.id, eventId, externalId: input.externalId ?? null,
    kind: input.kind, title: input.title, description: input.description ?? '', branch: input.branch ?? null,
    place: input.place ?? '', date: input.date ?? null, credits: input.credits ?? '', people: input.people ?? '',
    visibility: input.visibility ?? 'inherit', status, statusBeforeTrash: null,
    storageKey: null, displayKey: null, thumbKey: null, originalKey: null, captionsKey: null, chapters: input.chapters ?? null,
    duration: null, width: null, height: null, size: null, originalSize: null, mime: null, downloadable: input.downloadable ?? null,
    streamUid: null, createdBy: actor.label, createdAt: ts, updatedAt: ts, publishedAt: status === 'published' ? ts : null, trashedAt: null,
  }
  await db.insert(schema.document).values(row)
  if (input.tags?.length) await setTags(row.id, input.tags)
  await audit(actor, 'document.create', `document:${row.id}`, null, { title: row.title, year: yearRow!.startYear, status })
  return { action: 'create', id: row.id, document: row }
}

function pick(o: Record<string, any>, keys: string[]) {
  return Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]))
}

export async function publishDocuments(actor: Actor, ids: string[], publish = true) {
  if (!actor.scopes.includes('publish')) throw problem(403, 'Portée publish requise')
  const results = []
  for (const id of ids) {
    const d = await db.query.document.findFirst({ where: and(eq(schema.document.id, id), eq(schema.document.instanceId, instanceId())) })
    if (!d) { results.push({ id, ok: false, error: 'introuvable' }); continue }
    if (d.status === 'trashed') { results.push({ id, ok: false, error: 'dans la corbeille' }); continue }
    if (publish && !d.storageKey && !d.streamUid) { results.push({ id, ok: false, error: 'aucun fichier téléversé' }); continue }
    const status = publish ? 'published' : 'draft'
    await db.update(schema.document).set({ status, updatedAt: Date.now(), publishedAt: publish ? (d.publishedAt ?? Date.now()) : d.publishedAt }).where(eq(schema.document.id, id))
    await audit(actor, publish ? 'document.publish' : 'document.unpublish', `document:${id}`, { status: d.status }, { status })
    results.push({ id, ok: true, status })
  }
  return results
}

/** Corbeille (A-10), rétention 30 jours. Aucune suppression définitive par jeton (I-14). */
export async function trashDocuments(actor: Actor, ids: string[]) {
  const results = []
  for (const id of ids) {
    const d = await db.query.document.findFirst({ where: and(eq(schema.document.id, id), eq(schema.document.instanceId, instanceId())) })
    if (!d) { results.push({ id, ok: false, error: 'introuvable' }); continue }
    if (d.status === 'published' && actor.role === 'contributor') { results.push({ id, ok: false, error: 'un contributeur ne supprime pas un document publié' }); continue }
    await db.update(schema.document).set({ status: 'trashed', statusBeforeTrash: d.status, trashedAt: Date.now(), updatedAt: Date.now() }).where(eq(schema.document.id, id))
    await audit(actor, 'document.trash', `document:${id}`, { status: d.status }, { status: 'trashed' })
    results.push({ id, ok: true })
  }
  return results
}

export async function restoreDocument(actor: Actor, id: string) {
  const d = await db.query.document.findFirst({ where: eq(schema.document.id, id) })
  if (!d || d.status !== 'trashed') throw problem(404, 'Document absent de la corbeille')
  const status = (d.statusBeforeTrash === 'published' && actor.scopes.includes('publish')) ? 'published' : 'draft'
  await db.update(schema.document).set({ status, trashedAt: null, statusBeforeTrash: null, updatedAt: Date.now() }).where(eq(schema.document.id, id))
  await audit(actor, 'document.restore', `document:${id}`, { status: 'trashed' }, { status })
}

export async function purgeDocument(actor: Actor | 'system', id: string, storage: StorageDriver) {
  const d = await db.query.document.findFirst({ where: eq(schema.document.id, id) })
  if (!d) return
  const keys = [d.storageKey, d.thumbKey, d.originalKey, d.captionsKey, d.displayKey].filter(Boolean) as string[]
  if (keys.length) await storage.delete(keys)
  if (d.streamUid) await deleteStreamVideo(await getInstance(), d.streamUid).catch(() => {})
  await db.delete(schema.documentTag).where(eq(schema.documentTag.documentId, id))
  await db.delete(schema.upload).where(eq(schema.upload.documentId, id))
  await db.delete(schema.document).where(eq(schema.document.id, id))
  await db.update(schema.year).set({ coverDocumentId: null }).where(eq(schema.year.coverDocumentId, id))
  await db.update(schema.event).set({ coverDocumentId: null }).where(eq(schema.event.coverDocumentId, id))
  await audit(actor, 'document.purge', `document:${id}`, { title: d.title }, null)
}

export async function storageUsage() {
  const r = await db.select({
    bytes: sql<number>`coalesce(sum(coalesce(${schema.document.size}, 0) + coalesce(${schema.document.originalSize}, 0)), 0)`,
    videoSeconds: sql<number>`coalesce(sum(case when ${schema.document.kind} = 'video' then coalesce(${schema.document.duration}, 0) else 0 end), 0)`,
    docs: sql<number>`count(*)`,
  }).from(schema.document).where(eq(schema.document.instanceId, instanceId())).get()
  return { bytes: Number(r?.bytes ?? 0), videoSeconds: Number(r?.videoSeconds ?? 0), docs: Number(r?.docs ?? 0) }
}

