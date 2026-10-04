import { and, eq, lt } from 'drizzle-orm'

export default defineTask({
  meta: { name: 'purge:daily', description: 'Corbeille > 30 j, journaux techniques > 30 j, téléversements abandonnés' },
  async run() {
    const storage = useStorageDriver()
    const limit = Date.now() - 30 * 86400_000
    const trashed = await db.select({ id: schema.document.id }).from(schema.document)
      .where(and(eq(schema.document.status, 'trashed'), lt(schema.document.trashedAt, limit)))
    for (const d of trashed) await purgeDocument('system', d.id, storage)
    // L-05 : journaux techniques (IP hachée) 30 jours
    await db.delete(schema.securityLog).where(lt(schema.securityLog.createdAt, limit))
    await db.delete(schema.report).where(and(lt(schema.report.createdAt, Date.now() - 365 * 86400_000), eq(schema.report.status, 'done')))
    const stale = await db.select().from(schema.upload).where(and(eq(schema.upload.status, 'pending'), lt(schema.upload.updatedAt, Date.now() - 7 * 86400_000)))
    for (const u of stale) {
      await storage.abortMultipart(u.storageKey, u.uploadId).catch(() => {})
      await db.update(schema.upload).set({ status: 'aborted' }).where(eq(schema.upload.id, u.id))
    }
    await purgeRateLimits()
    await purgeIdempotency()
    await kvPurge()
    return { result: { purgedDocuments: trashed.length, abortedUploads: stale.length } }
  },
})
