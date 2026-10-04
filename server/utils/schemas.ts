import { z } from 'zod'

// Schémas Zod partagés par l'API REST v1, le serveur MCP et l'OpenAPI (I-04).

export const zYear = z.number().int().min(1900).max(2200).describe('Année scoute, par son année de début (2019 = 2019-2020)')
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format AAAA-MM-JJ')
export const zKind = z.enum(['video', 'photo', 'pdf', 'audio'])
export const zVisibility = z.enum(['inherit', 'forcePrivate', 'forcePublic', 'hidden'])
export const zVariant = z.enum(['main', 'thumb', 'captions', 'original'])

export const YearInput = z.object({
  startYear: zYear,
  description: z.string().max(4000).optional(),
  coverDocumentId: z.string().nullable().optional(),
})

export const EventInputSchema = z.object({
  id: z.string().optional(),
  year: zYear,
  type: z.string().max(60).optional(),
  title: z.string().trim().min(1).max(200),
  place: z.string().max(200).optional(),
  startDate: zDate.nullable().optional(),
  endDate: zDate.nullable().optional(),
  branch: z.string().max(10).nullable().optional(),
  coverDocumentId: z.string().nullable().optional(),
})

export const DocumentInputSchema = z.object({
  id: z.string().optional().describe('Pour une mise à jour'),
  externalId: z.string().max(500).nullable().optional().describe('Identifiant externe unique (ex. chemin du fichier source) : rend l\'import idempotent'),
  year: zYear.optional(),
  eventId: z.string().nullable().optional(),
  event: z.object({
    title: z.string().trim().min(1).max(200),
    type: z.string().max(60).optional(),
    place: z.string().max(200).optional(),
    startDate: zDate.optional(),
    endDate: zDate.optional(),
  }).nullable().optional().describe('Événement rattaché, retrouvé par titre dans l\'année ou créé'),
  kind: zKind.optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(10000).optional(),
  branch: z.string().max(10).nullable().optional(),
  place: z.string().max(200).optional(),
  date: zDate.nullable().optional(),
  credits: z.string().max(500).optional(),
  people: z.string().max(2000).optional(),
  visibility: zVisibility.optional(),
  status: z.enum(['draft', 'published']).optional(),
  downloadable: z.boolean().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  chapters: z.array(z.object({ start: z.number().min(0), title: z.string().max(200) })).max(200).nullable().optional(),
})

export const BatchInput = z.object({ documents: z.array(DocumentInputSchema).min(1).max(100) })
export const IdsInput = z.object({ ids: z.array(z.string()).min(1).max(500) })

export const UploadCreateInput = z.object({
  documentId: z.string(),
  variant: zVariant.default('main'),
  filename: z.string().min(1).max(500),
  size: z.number().int().positive(),
  mime: z.string().max(100).default('application/octet-stream'),
})

export const FileMetaInput = z.object({
  duration: z.number().min(0).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  chapters: z.array(z.object({ start: z.number().min(0), title: z.string().max(200) })).optional(),
}).default({})

export const PlanImportInput = z.object({
  files: z.array(z.object({
    path: z.string().min(1).max(1000),
    size: z.number().int().nonnegative().optional(),
    duration: z.number().min(0).optional(),
  })).min(1).max(1000),
})

export const DocumentQuery = z.object({
  q: z.string().max(200).optional(),
  year: z.coerce.number().int().optional(),
  kind: zKind.optional(),
  branch: z.string().max(10).optional(),
  status: z.enum(['draft', 'published', 'trashed']).optional(),
  place: z.string().max(200).optional(),
  eventId: z.string().optional(),
  externalId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})
