import { desc, eq } from 'drizzle-orm'

// A-14 : historique (année, date, nombre d'utilisations)
export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'editor')
  const rows = await db.select().from(schema.accessPassword).where(eq(schema.accessPassword.instanceId, instanceId())).orderBy(desc(schema.accessPassword.createdAt))
  return rows.map(({ hash: _h, lookup: _l, ...r }) => ({ ...r, label: scoutYearLabel(r.scoutYear) }))
})
