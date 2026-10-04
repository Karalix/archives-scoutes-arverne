import type { H3Event } from 'h3'
import { eq, lt } from 'drizzle-orm'

/**
 * Limitation de débit en base D1 (fenêtre fixe + blocage progressif).
 * R-10 : 5 essais / 15 min par IP pour le mot de passe famille.
 */
export async function rateLimit(event: H3Event, key: string, opts: { limit: number, windowMs: number, progressive?: boolean }) {
  const now = Date.now()
  const row = await db.query.rateLimit.findFirst({ where: eq(schema.rateLimit.key, key) })
  if (row?.blockedUntil && row.blockedUntil > now) {
    const retry = Math.ceil((row.blockedUntil - now) / 1000)
    setHeader(event, 'Retry-After', retry)
    throw problem(429, `Trop de tentatives. Réessayez dans ${Math.ceil(retry / 60)} min.`, { retryAfter: retry })
  }
  if (!row || row.windowStart + opts.windowMs < now) {
    await db.insert(schema.rateLimit).values({ key, count: 1, windowStart: now, blockedUntil: null })
      .onConflictDoUpdate({ target: schema.rateLimit.key, set: { count: 1, windowStart: now, blockedUntil: null } })
    return
  }
  const count = row.count + 1
  let blockedUntil: number | null = null
  if (count > opts.limit) {
    // Délai progressif : double à chaque dépassement supplémentaire, plafonné à 24 h
    const over = count - opts.limit
    blockedUntil = now + Math.min(opts.windowMs * (opts.progressive ? 2 ** (over - 1) : 1), 24 * 3600_000)
  }
  await db.update(schema.rateLimit).set({ count, blockedUntil }).where(eq(schema.rateLimit.key, key))
  if (blockedUntil) {
    const retry = Math.ceil((blockedUntil - now) / 1000)
    setHeader(event, 'Retry-After', retry)
    throw problem(429, `Trop de tentatives. Réessayez dans ${Math.ceil(retry / 60)} min.`, { retryAfter: retry })
  }
}

/** Refuse si la clé est actuellement bloquée, sans compter de tentative. */
export async function assertNotRateLimited(event: H3Event, key: string) {
  const row = await db.query.rateLimit.findFirst({ where: eq(schema.rateLimit.key, key) })
  if (row?.blockedUntil && row.blockedUntil > Date.now()) {
    const retry = Math.ceil((row.blockedUntil - Date.now()) / 1000)
    setHeader(event, 'Retry-After', retry)
    throw problem(429, `Trop de tentatives. Réessayez dans ${Math.ceil(retry / 60)} min.`, { retryAfter: retry })
  }
}

export async function resetRateLimit(key: string) {
  await db.delete(schema.rateLimit).where(eq(schema.rateLimit.key, key))
}

export async function purgeRateLimits() {
  await db.delete(schema.rateLimit).where(lt(schema.rateLimit.windowStart, Date.now() - 2 * 24 * 3600_000))
}

export async function logSecurity(event: H3Event, kind: string, detail?: string) {
  await db.insert(schema.securityLog).values({ id: newId(), instanceId: instanceId(), kind, ipHash: await ipHash(event), detail, createdAt: Date.now() })
}
