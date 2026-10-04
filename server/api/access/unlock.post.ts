import { z } from 'zod'

const Body = z.object({ password: z.string().min(1).max(200) })

// R-09 / R-10 : saisie du mot de passe annuel
export default defineEventHandler(async (event) => {
  const { password } = await readValid(event, Body)
  const ip = await ipHash(event)
  const key = `unlock:${ip}`
  // 5 échecs / 15 min par IP, délai progressif au-delà (les succès ne comptent pas)
  await assertNotRateLimited(event, key)
  const normalized = normalizePassphrase(password)
  const pw = await findActivePassword(normalized)
  const ok = pw ? await verifyPassword(pw.hash, normalized) : false
  if (!pw || !ok) {
    await logSecurity(event, 'family_password_fail')
    await rateLimit(event, key, { limit: 5, windowMs: 15 * 60_000, progressive: true })
    throw problem(401, 'Mot de passe incorrect')
  }
  const family = await openFamilySession(event, pw)
  return { ok: true, maxYear: family.maxYear, label: scoutYearLabel(family.maxYear) }
})
