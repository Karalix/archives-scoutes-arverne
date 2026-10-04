import { and, desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'editor')
  const rows = await db.select({ doc: schema.document, yearStart: schema.year.startYear }).from(schema.document)
    .innerJoin(schema.year, eq(schema.year.id, schema.document.yearId))
    .where(and(eq(schema.document.instanceId, instanceId()), eq(schema.document.status, 'trashed')))
    .orderBy(desc(schema.document.trashedAt))
  return rows.map(r => ({ id: r.doc.id, title: r.doc.title, kind: r.doc.kind, yearStart: r.yearStart, trashedAt: r.doc.trashedAt, purgeAt: (r.doc.trashedAt ?? 0) + 30 * 86400_000 }))
})
