import { db, schema } from 'hub:db'

const TABLES = ['instance', 'year', 'event', 'document', 'tag', 'documentTag', 'accessPassword', 'adminUser', 'passkey', 'apiToken', 'auditLog', 'report', 'usageStat'] as const

/** Instantané JSON de la base (L-14, A-16). */
export async function dumpDatabase(opts: { redactSecrets?: boolean } = {}) {
  const out: Record<string, unknown[]> = {}
  for (const t of TABLES) {
    const rows = await db.select().from(schema[t] as any)
    out[t] = opts.redactSecrets
      ? rows.map((r: any) => {
          const { passwordHash: _p, hash: _h, lookup: _l, tokenHash: _t, publicKey: _k, ...rest } = r
          if (rest.settings?.streamApiToken) rest.settings = { ...rest.settings, streamApiToken: undefined }
          return rest
        })
      : rows
  }
  return {
    format: 'archives-scoutes/backup',
    version: useRuntimeConfig().public.version,
    instanceId: instanceId(),
    createdAt: new Date().toISOString(),
    tables: out,
  }
}

export async function runWeeklyBackup() {
  const storage = useStorageDriver()
  const dump = await dumpDatabase()
  const key = `${instanceId()}/backups/${new Date().toISOString().slice(0, 10)}.json`
  await storage.put(key, JSON.stringify(dump), { contentType: 'application/json' })
  // Conservation 8 semaines
  const { objects } = await storage.list(`${instanceId()}/backups/`)
  const sorted = objects.sort((a, b) => b.key.localeCompare(a.key))
  for (const old of sorted.slice(8)) await storage.delete(old.key)
  await audit('system', 'backup.weekly', key, null, { size: JSON.stringify(dump).length })
  return { key, kept: Math.min(sorted.length, 8) }
}

export async function listBackups() {
  const { objects } = await useStorageDriver().list(`${instanceId()}/backups/`)
  return objects.sort((a, b) => b.key.localeCompare(a.key))
}

