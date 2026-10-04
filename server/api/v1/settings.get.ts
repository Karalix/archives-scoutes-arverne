import { asc, eq } from 'drizzle-orm'

// I-05 : taxonomie en lecture seule (jamais le pivot détaillé ni les mots de passe)
export default defineEventHandler(async (event) => {
  await requireActor(event, 'read')
  const inst = await getInstance()
  const years = await db.select({ startYear: schema.year.startYear }).from(schema.year).where(eq(schema.year.instanceId, inst.id)).orderBy(asc(schema.year.startYear))
  return {
    branches: inst.branches,
    eventTypes: inst.eventTypes,
    years: years.map(y => ({ startYear: y.startYear, label: scoutYearLabel(y.startYear) })),
    switchMonth: inst.switchMonth,
    currentScoutYear: scoutYearOf(new Date(), inst.switchMonth),
    namingRule: NAMING_RULE,
    video: {
      target: 'MP4, H.264 High, AAC 128 kbit/s, 720p, 1,5 à 2 Mbit/s, faststart',
      acceptedAsIs: 'H.264 ≤ 1080p et ≤ 4 Mbit/s, faststart',
      ffmpeg: ffmpegCommand(),
    },
    limits: { partSize: PART_SIZE, directMax: DIRECT_MAX, pdf: SIZE_LIMITS.pdf, audio: SIZE_LIMITS.audio, batch: 100 },
  }
})
