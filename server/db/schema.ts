import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from 'drizzle-orm/sqlite-core'

// Toutes les tables portent instanceId (section 9.3). Identifiants ULID.
// Dates stockées en millisecondes epoch (integer).

const instanceId = () => text('instance_id').notNull().default('default')

export const instance = sqliteTable('instance', {
  id: text('id').primaryKey(), // = instanceId
  name: text('name').notNull().default('Archives du groupe'),
  slug: text('slug').notNull().default('groupe'),
  logoKey: text('logo_key'),
  primaryColor: text('primary_color').notNull().default('#2f7d32'),
  intro: text('intro').notNull().default(''),
  legal: text('legal').notNull().default(''),
  privacy: text('privacy').notNull().default(''),
  contactEmail: text('contact_email').notNull().default(''),
  pivotMode: text('pivot_mode', { enum: ['fixed', 'sliding'] }).notNull().default('sliding'),
  pivotYear: integer('pivot_year').notNull().default(2015),
  pivotOffset: integer('pivot_offset').notNull().default(10),
  switchMonth: integer('switch_month').notNull().default(9),
  branches: text('branches', { mode: 'json' }).$type<Branch[]>().notNull(),
  eventTypes: text('event_types', { mode: 'json' }).$type<string[]>().notNull(),
  settings: text('settings', { mode: 'json' }).$type<InstanceSettings>().notNull(),
  installedAt: integer('installed_at'),
  updatedAt: integer('updated_at').notNull(),
})

export interface Branch { key: string, label: string, color?: string }
export interface InstanceSettings {
  publicDownloads: boolean // F-08 : réglage d'instance pour les années publiques
  keepOriginals: boolean // V-04
  quotaBytes: number // S-04
  familySessionDays: number // R-09
  takedownDelayDays: number // L-02
  peopleField: boolean // L-03
  streamEnabled: boolean // D-07
  streamAccountId?: string
  streamApiToken?: string
  statsEnabled: boolean
}

export const year = sqliteTable('year', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  startYear: integer('start_year').notNull(),
  description: text('description').notNull().default(''),
  coverDocumentId: text('cover_document_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('year_instance_start').on(t.instanceId, t.startYear)])

export const event = sqliteTable('event', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  yearId: text('year_id').notNull(),
  type: text('type').notNull().default('camp'),
  title: text('title').notNull(),
  place: text('place').notNull().default(''),
  startDate: text('start_date'),
  endDate: text('end_date'),
  branch: text('branch'),
  coverDocumentId: text('cover_document_id'),
  sort: integer('sort').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, t => [index('event_year').on(t.yearId)])

export type Visibility = 'inherit' | 'forcePrivate' | 'forcePublic' | 'hidden'
export type DocStatus = 'draft' | 'published' | 'trashed'
export type DocKind = 'video' | 'photo' | 'pdf' | 'audio'

export const document = sqliteTable('document', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  yearId: text('year_id').notNull(),
  eventId: text('event_id'),
  externalId: text('external_id'),
  kind: text('kind', { enum: ['video', 'photo', 'pdf', 'audio'] }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  branch: text('branch'),
  place: text('place').notNull().default(''),
  date: text('date'),
  credits: text('credits').notNull().default(''),
  people: text('people').notNull().default(''),
  visibility: text('visibility', { enum: ['inherit', 'forcePrivate', 'forcePublic', 'hidden'] }).notNull().default('inherit'),
  status: text('status', { enum: ['draft', 'published', 'trashed'] }).notNull().default('draft'),
  statusBeforeTrash: text('status_before_trash'),
  storageKey: text('storage_key'),
  displayKey: text('display_key'),
  thumbKey: text('thumb_key'),
  originalKey: text('original_key'),
  captionsKey: text('captions_key'),
  chapters: text('chapters', { mode: 'json' }).$type<{ start: number, title: string }[]>(),
  duration: integer('duration'), // secondes
  width: integer('width'),
  height: integer('height'),
  size: integer('size'), // octets (rendu)
  originalSize: integer('original_size'),
  mime: text('mime'),
  downloadable: integer('downloadable', { mode: 'boolean' }), // null = réglage d'instance
  streamUid: text('stream_uid'),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  publishedAt: integer('published_at'),
  trashedAt: integer('trashed_at'),
}, t => [
  index('document_year').on(t.yearId),
  index('document_event').on(t.eventId),
  uniqueIndex('document_external').on(t.instanceId, t.externalId),
])

export const tag = sqliteTable('tag', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  label: text('label').notNull(),
}, t => [uniqueIndex('tag_label').on(t.instanceId, t.label)])

export const documentTag = sqliteTable('document_tag', {
  documentId: text('document_id').notNull(),
  tagId: text('tag_id').notNull(),
}, t => [primaryKey({ columns: [t.documentId, t.tagId] })])

export const accessPassword = sqliteTable('access_password', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  scoutYear: integer('scout_year').notNull(),
  lookup: text('lookup').notNull(), // HMAC du mot de passe normalisé, pour trouver la ligne sans vérifier tous les hachés
  hash: text('hash').notNull(), // scrypt (sel inclus dans la chaîne PHC)
  createdAt: integer('created_at').notNull(),
  createdBy: text('created_by'),
  revokedAt: integer('revoked_at'),
  useCount: integer('use_count').notNull().default(0),
  lastUsedAt: integer('last_used_at'),
}, t => [index('access_password_lookup').on(t.lookup)])

export type Role = 'owner' | 'editor' | 'contributor'

export const adminUser = sqliteTable('admin_user', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['owner', 'editor', 'contributor'] }).notNull(),
  passwordHash: text('password_hash'),
  sessionVersion: integer('session_version').notNull().default(1),
  disabledAt: integer('disabled_at'),
  createdAt: integer('created_at').notNull(),
  lastLoginAt: integer('last_login_at'),
}, t => [uniqueIndex('admin_user_email').on(t.instanceId, t.email)])

export const passkey = sqliteTable('passkey', {
  id: text('id').primaryKey(), // credential id
  userId: text('user_id').notNull(),
  publicKey: text('public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
  transports: text('transports', { mode: 'json' }).$type<string[]>(),
  name: text('name').notNull().default('Passkey'),
  createdAt: integer('created_at').notNull(),
})

export const adminLink = sqliteTable('admin_link', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  kind: text('kind', { enum: ['invite', 'reset'] }).notNull(),
  tokenHash: text('token_hash').notNull(),
  email: text('email'),
  name: text('name'),
  role: text('role', { enum: ['owner', 'editor', 'contributor'] }),
  userId: text('user_id'),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
}, t => [uniqueIndex('admin_link_token').on(t.tokenHash)])

export const apiToken = sqliteTable('api_token', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  prefix: text('prefix').notNull(),
  scopes: text('scopes', { mode: 'json' }).$type<('read' | 'write' | 'publish')[]>().notNull(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at'),
  revokedAt: integer('revoked_at'),
  lastUsedAt: integer('last_used_at'),
}, t => [uniqueIndex('api_token_hash').on(t.tokenHash)])

export const upload = sqliteTable('upload', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  documentId: text('document_id').notNull(),
  variant: text('variant').notNull(), // main | original | display | thumb | captions
  storageKey: text('storage_key').notNull(),
  uploadId: text('upload_id').notNull(), // identifiant multipart R2
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  partSize: integer('part_size').notNull(),
  parts: text('parts', { mode: 'json' }).$type<{ partNumber: number, etag: string }[]>().notNull(),
  status: text('status', { enum: ['pending', 'completed', 'aborted'] }).notNull().default('pending'),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, t => [index('upload_document').on(t.documentId)])

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  actor: text('actor').notNull(), // user:<id> | token:<nom> | system
  actorName: text('actor_name'),
  action: text('action').notNull(),
  target: text('target'),
  before: text('before', { mode: 'json' }),
  after: text('after', { mode: 'json' }),
  createdAt: integer('created_at').notNull(),
}, t => [index('audit_created').on(t.createdAt)])

export const report = sqliteTable('report', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  documentId: text('document_id').notNull(),
  kind: text('kind', { enum: ['takedown', 'error', 'other'] }).notNull(),
  message: text('message').notNull(),
  contact: text('contact').notNull().default(''),
  ipHash: text('ip_hash'),
  status: text('status', { enum: ['open', 'done', 'rejected'] }).notNull().default('open'),
  handledBy: text('handled_by'),
  createdAt: integer('created_at').notNull(),
  handledAt: integer('handled_at'),
})

export const rateLimit = sqliteTable('rate_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: integer('window_start').notNull(),
  blockedUntil: integer('blocked_until'),
})

export const securityLog = sqliteTable('security_log', {
  id: text('id').primaryKey(),
  instanceId: instanceId(),
  kind: text('kind').notNull(), // family_password_fail, admin_login_fail…
  ipHash: text('ip_hash'),
  detail: text('detail'),
  createdAt: integer('created_at').notNull(),
})

export const idempotency = sqliteTable('idempotency', {
  key: text('key').primaryKey(), // tokenId:Idempotency-Key
  response: text('response', { mode: 'json' }).notNull(),
  status: integer('status').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const usageStat = sqliteTable('usage_stat', {
  month: text('month').notNull(), // YYYY-MM
  instanceId: instanceId(),
  bytesServed: integer('bytes_served').notNull().default(0),
  views: integer('views').notNull().default(0),
}, t => [primaryKey({ columns: [t.instanceId, t.month] })])

/** Petites valeurs éphémères (défis WebAuthn, jeton d'installation généré…). */
export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at'),
})
