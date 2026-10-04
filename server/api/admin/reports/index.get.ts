import { desc, eq, inArray } from 'drizzle-orm'

// F-12 : file des signalements
export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'editor')
  const rows = await db.select().from(schema.report).where(eq(schema.report.instanceId, instanceId())).orderBy(desc(schema.report.createdAt)).limit(300)
  const ids = [...new Set(rows.map(r => r.documentId))]
  const docs = ids.length ? await db.select({ id: schema.document.id, title: schema.document.title, visibility: schema.document.visibility, status: schema.document.status }).from(schema.document).where(inArray(schema.document.id, ids)) : []
  const map = new Map(docs.map(d => [d.id, d]))
  return rows.map(({ ipHash: _ip, ...r }) => ({ ...r, document: map.get(r.documentId) ?? null }))
})
