import { eq, lt } from 'drizzle-orm'

export async function kvSet(key: string, value: string, ttlMs?: number) {
  const expiresAt = ttlMs ? Date.now() + ttlMs : null
  await db.insert(schema.kv).values({ key, value, expiresAt }).onConflictDoUpdate({ target: schema.kv.key, set: { value, expiresAt } })
}

export async function kvGet(key: string): Promise<string | null> {
  const r = await db.query.kv.findFirst({ where: eq(schema.kv.key, key) })
  if (!r) return null
  if (r.expiresAt && r.expiresAt < Date.now()) {
    await db.delete(schema.kv).where(eq(schema.kv.key, key))
    return null
  }
  return r.value
}

export async function kvDel(key: string) {
  await db.delete(schema.kv).where(eq(schema.kv.key, key))
}

export async function kvPurge() {
  await db.delete(schema.kv).where(lt(schema.kv.expiresAt, Date.now()))
}
