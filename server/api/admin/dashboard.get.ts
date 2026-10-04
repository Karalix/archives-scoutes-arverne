import { and, eq, isNull, sql } from 'drizzle-orm'

// A-15 : tableau de bord ; R-08 : rappel de rentrée ; D-02 : version ; D-04 : consommation
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const inst = await getInstance()
  const now = new Date()
  const currentYear = scoutYearOf(now, inst.switchMonth)
  const usage = await storageUsage()
  const month = now.toISOString().slice(0, 7)
  const stat = await db.query.usageStat.findFirst({ where: and(eq(schema.usageStat.instanceId, inst.id), eq(schema.usageStat.month, month)) })
  const statusCounts = await db.select({ status: schema.document.status, n: sql<number>`count(*)` }).from(schema.document)
    .where(eq(schema.document.instanceId, inst.id)).groupBy(schema.document.status)
  const openReports = (await db.select({ n: sql<number>`count(*)` }).from(schema.report)
    .where(and(eq(schema.report.instanceId, inst.id), eq(schema.report.status, 'open'))).get())?.n ?? 0
  const activePasswords = await db.select().from(schema.accessPassword)
    .where(and(eq(schema.accessPassword.instanceId, inst.id), isNull(schema.accessPassword.revokedAt)))
  const years = (await db.select({ n: sql<number>`count(*)` }).from(schema.year).where(eq(schema.year.instanceId, inst.id)).get())?.n ?? 0

  const reminders: string[] = []
  // R-08 : au mois de bascule (et tant qu'il manque), rappeler le mot de passe de la nouvelle année
  if (!activePasswords.some(p => p.scoutYear >= currentYear)) {
    reminders.push(`Pensez à créer le mot de passe ${scoutYearLabel(currentYear)}.`)
  }
  if (inst.pivotMode === 'fixed' && now.getUTCMonth() + 1 === inst.switchMonth) {
    reminders.push('Rentrée scoute : pensez à avancer l\'année pivot (ou passez en mode glissant).')
  }
  const quota = inst.settings.quotaBytes
  if (quota && usage.bytes > quota * 0.8) reminders.push(`Stockage à ${Math.round(usage.bytes / quota * 100)} % du quota (S-04).`)
  const ownerCount = (await db.select({ n: sql<number>`count(*)` }).from(schema.adminUser)
    .where(and(eq(schema.adminUser.instanceId, inst.id), eq(schema.adminUser.role, 'owner'), isNull(schema.adminUser.disabledAt))).get())?.n ?? 0
  if (Number(ownerCount) < 2) reminders.push('Un seul propriétaire : ajoutez un second administrateur « owner » (D-05).')

  // Estimation de coût (section 8.1)
  const gb = usage.bytes / 1024 ** 3
  const r2 = Math.max(0, gb - 10) * 0.015
  const videoMinutes = usage.videoSeconds / 60
  const stream = inst.settings.streamEnabled ? Math.ceil(videoMinutes / 1000) * 5 : 0

  // D-02 : version disponible (mise en cache 24 h)
  const cfg = useRuntimeConfig()
  let latest = await kvGet('latest-version')
  if (latest === null && admin.role === 'owner') {
    try {
      const pkg: any = await $fetch(`https://raw.githubusercontent.com/${cfg.public.sourceRepo}/main/package.json`, { timeout: 3000, parseResponse: JSON.parse })
      latest = String(pkg.version ?? '')
    }
    catch { latest = '' }
    await kvSet('latest-version', latest, 24 * 3600_000)
  }

  return {
    user: { name: admin.name, role: admin.role },
    currentYear,
    currentYearLabel: scoutYearLabel(currentYear),
    pivot: effectivePivot(accessInstance(inst), now),
    pivotMode: inst.pivotMode,
    years: Number(years),
    documents: Object.fromEntries(statusCounts.map(s => [s.status, Number(s.n)])),
    openReports: Number(openReports),
    storage: { used: usage.bytes, quota, videoMinutes: Math.round(videoMinutes) },
    month: { bytesServed: stat?.bytesServed ?? 0, views: stat?.views ?? 0 },
    cost: { r2: Math.round(r2 * 100) / 100, stream, total: Math.round((r2 + stream) * 100) / 100, currency: 'USD' },
    reminders,
    version: cfg.public.version,
    latestVersion: latest || null,
    storageDriver: useStorageDriver(event).name,
    keepOriginals: inst.settings.keepOriginals,
  }
})
