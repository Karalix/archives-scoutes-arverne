import { eq } from 'drizzle-orm'

// A-16 : export complet (métadonnées JSON + liens vers les fichiers originaux et rendus).
// Le CLI « npx archives-scoutes export » télécharge tout dans un dossier.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event, 'owner')
  const dump = await dumpDatabase({ redactSecrets: true })
  const docs = await db.select().from(schema.document).where(eq(schema.document.instanceId, instanceId()))
  const origin = getRequestURL(event).origin
  const files = []
  for (const d of docs) {
    for (const [variant, key] of [['main', d.storageKey], ['thumb', d.thumbKey], ['captions', d.captionsKey], ['original', d.originalKey]] as const) {
      if (key) files.push({ documentId: d.id, variant, key, url: origin + await signMediaUrl(d.id, variant, { protected: true, admin: true }) })
    }
  }
  await audit(admin, 'instance.export', `instance:${instanceId()}`, null, { documents: docs.length, files: files.length })
  setHeader(event, 'Content-Disposition', `attachment; filename="archives-export-${new Date().toISOString().slice(0, 10)}.json"`)
  return { ...dump, files, note: 'Les URL de fichiers expirent après 6 h ; relancez l\'export si besoin.' }
})
