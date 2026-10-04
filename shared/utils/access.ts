// Règles d'accès (section 3 et 7.3). Fonctions pures, testées exhaustivement (L-09).

export type Visibility = 'inherit' | 'forcePrivate' | 'forcePublic' | 'hidden'
export type DocStatus = 'draft' | 'published' | 'trashed'

export interface AccessInstance {
  pivotMode: 'fixed' | 'sliding'
  pivotYear: number
  pivotOffset: number
  switchMonth: number // 1-12, mois de bascule de l'année scoute
}

export interface AccessDocument {
  yearStart: number // année scoute (année de début)
  visibility: Visibility
  status: DocStatus
}

export interface FamilyAccess {
  maxYear: number
  passwordId: string
  expiresAt: number // ms epoch
  revoked?: boolean // renseigné par le serveur à partir de access_password.revokedAt
}

export interface AccessSession {
  isAdmin?: boolean
  family?: FamilyAccess | null
}

export type AccessDecision =
  | { allowed: true, reason: 'admin' | 'forcePublic' | 'public' | 'family' }
  | { allowed: false, reason: 'unpublished' | 'hidden' | 'needsPassword' | 'yearNotCovered' }

/** Année scoute (année de début) d'une date : septembre 2024 → août 2025 = 2024 (switchMonth = 9). */
export function scoutYearOf(date: Date, switchMonth = 9): number {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + 1
  return m >= switchMonth ? y : y - 1
}

/** Libellé « 2024-2025 ». */
export function scoutYearLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`
}

/** Pivot effectif : fixe, ou année scoute courante − N (R-02). */
export function effectivePivot(inst: AccessInstance, now: Date): number {
  if (inst.pivotMode === 'sliding') return scoutYearOf(now, inst.switchMonth) - inst.pivotOffset
  return inst.pivotYear
}

/** Une année est-elle publique ? (R-01) */
export function isPublicYear(yearStart: number, inst: AccessInstance, now: Date): boolean {
  return yearStart <= effectivePivot(inst, now)
}

/** La session famille est-elle utilisable à cet instant ? */
export function familyValid(family: FamilyAccess | null | undefined, now: Date): family is FamilyAccess {
  return !!family && !family.revoked && family.expiresAt > now.getTime()
}

/** Accès à une année protégée (libellé et compteur toujours visibles, le reste non : 3.4). */
export function canViewYear(yearStart: number, session: AccessSession, inst: AccessInstance, now: Date): boolean {
  if (session.isAdmin) return true
  if (isPublicYear(yearStart, inst, now)) return true
  return familyValid(session.family, now) && yearStart <= session.family.maxYear
}

/** Décision d'accès à un document (7.3). */
export function canView(doc: AccessDocument, session: AccessSession, inst: AccessInstance, now: Date): AccessDecision {
  if (session.isAdmin) return { allowed: true, reason: 'admin' }
  if (doc.status !== 'published') return { allowed: false, reason: 'unpublished' }
  if (doc.visibility === 'hidden') return { allowed: false, reason: 'hidden' }
  if (doc.visibility === 'forcePublic') return { allowed: true, reason: 'forcePublic' }
  if (doc.visibility !== 'forcePrivate' && isPublicYear(doc.yearStart, inst, now)) return { allowed: true, reason: 'public' }
  if (!familyValid(session.family, now)) return { allowed: false, reason: 'needsPassword' }
  if (doc.yearStart <= session.family.maxYear) return { allowed: true, reason: 'family' }
  return { allowed: false, reason: 'yearNotCovered' }
}

/**
 * Un document est-il « protégé » (servi uniquement à une session famille) ?
 * Sert au Cache-Control (T-03), au noindex et à l'interdiction de téléchargement (F-08).
 */
export function isProtectedDoc(doc: AccessDocument, inst: AccessInstance, now: Date): boolean {
  if (doc.visibility === 'forcePublic') return false
  if (doc.visibility === 'forcePrivate') return true
  return !isPublicYear(doc.yearStart, inst, now)
}

/**
 * Téléchargement (F-08) : jamais pour un document protégé ; sinon réglage d'instance
 * surchargeable par document.
 */
export function canDownload(
  doc: AccessDocument & { downloadable: boolean | null },
  publicDownloads: boolean,
  inst: AccessInstance,
  now: Date,
): boolean {
  if (isProtectedDoc(doc, inst, now)) return false
  return doc.downloadable ?? publicDownloads
}
