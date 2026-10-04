import { and, desc, eq, like, lt } from 'drizzle-orm'

// A-17 : journal d'audit
export default defineEventHandler(async (event) => {
  await requireAdmin(event, 'editor')
  const q = getQuery(event)
  const conds = [eq(schema.auditLog.instanceId, instanceId())]
  if (typeof q.action === 'string' && q.action) conds.push(like(schema.auditLog.action, `${q.action}%`))
  if (typeof q.target === 'string' && q.target) conds.push(eq(schema.auditLog.target, q.target))
  if (q.before) conds.push(lt(schema.auditLog.createdAt, Number(q.before)))
  return db.select().from(schema.auditLog).where(and(...conds)).orderBy(desc(schema.auditLog.createdAt)).limit(200)
})
