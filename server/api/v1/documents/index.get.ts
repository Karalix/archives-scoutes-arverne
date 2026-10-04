import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

// search_documents : recherche plein texte et filtres (vue admin, brouillons inclus)
export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  const q = parseValid(getQuery(event), DocumentQuery)
  const d = schema.document
  const conds: (SQL | undefined)[] = [eq(d.instanceId, instanceId())]
  conds.push(q.status ? eq(d.status, q.status) : ne(d.status, 'trashed'))
  if (q.year !== undefined) conds.push(eq(schema.year.startYear, q.year))
  if (q.kind) conds.push(eq(d.kind, q.kind))
  if (q.branch) conds.push(eq(d.branch, q.branch))
  if (q.place) conds.push(eq(d.place, q.place))
  if (q.eventId) conds.push(eq(d.eventId, q.eventId))
  if (q.externalId) conds.push(eq(d.externalId, q.externalId))
  if (q.q?.trim()) {
    const match = q.q.trim().split(/\s+/).map(w => `"${w.replace(/"/g, '""')}"*`).join(' ')
    conds.push(sql`${d.id} IN (SELECT document_id FROM document_fts WHERE document_fts MATCH ${match})`)
  }
  const rows = await db.select({ doc: d, yearStart: schema.year.startYear }).from(d)
    .innerJoin(schema.year, eq(schema.year.id, d.yearId))
    .where(and(...conds))
    .orderBy(desc(schema.year.startYear), asc(d.date), asc(d.title))
    .limit(q.limit)
  return Promise.all(rows.map(r => serializeAdminDoc(r.doc, r.yearStart)))
})
