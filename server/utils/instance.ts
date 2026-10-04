import { eq } from 'drizzle-orm'
import type { AccessInstance } from '#shared/utils/access'
import type { InstanceSettings } from '../db/schema'

export type InstanceRow = typeof schema.instance.$inferSelect

export const DEFAULT_SETTINGS: InstanceSettings = {
  publicDownloads: false,
  keepOriginals: false,
  quotaBytes: 50 * 1024 ** 3,
  familySessionDays: 30,
  takedownDelayDays: 7,
  peopleField: false,
  streamEnabled: false,
  statsEnabled: true,
}

let cache: { row: InstanceRow, at: number } | null = null

export function invalidateInstanceCache() {
  cache = null
}

/** Instance courante, créée avec les valeurs par défaut au premier appel. */
export async function getInstance(): Promise<InstanceRow> {
  if (cache && Date.now() - cache.at < 5000) return cache.row
  const id = instanceId()
  let row = await db.query.instance.findFirst({ where: eq(schema.instance.id, id) })
  if (!row) {
    await db.insert(schema.instance).values({
      id,
      branches: DEFAULT_BRANCHES,
      eventTypes: DEFAULT_EVENT_TYPES,
      settings: DEFAULT_SETTINGS,
      // L-01 : pivot glissant de 10 ans par défaut
      pivotMode: 'sliding',
      pivotOffset: 10,
      pivotYear: scoutYearOf(new Date()) - 10,
      updatedAt: Date.now(),
    }).onConflictDoNothing()
    row = (await db.query.instance.findFirst({ where: eq(schema.instance.id, id) }))!
  }
  row.settings = { ...DEFAULT_SETTINGS, ...row.settings }
  cache = { row, at: Date.now() }
  return row
}

export function accessInstance(inst: InstanceRow): AccessInstance {
  return { pivotMode: inst.pivotMode, pivotYear: inst.pivotYear, pivotOffset: inst.pivotOffset, switchMonth: inst.switchMonth }
}

/** Réglages exposés au front public (jamais les secrets Stream). */
export function publicInstance(inst: InstanceRow) {
  return {
    name: inst.name,
    slug: inst.slug,
    logoUrl: inst.logoKey ? `/logo?v=${inst.updatedAt}` : null,
    primaryColor: inst.primaryColor,
    intro: inst.intro,
    contactEmail: inst.contactEmail,
    branches: inst.branches,
    eventTypes: inst.eventTypes,
    switchMonth: inst.switchMonth,
    pivot: effectivePivot(accessInstance(inst), new Date()),
    installed: !!inst.installedAt,
    takedownDelayDays: inst.settings.takedownDelayDays,
    peopleField: inst.settings.peopleField,
  }
}
