// Matrice d'accès exhaustive (L-09, section 11 : couverture des règles d'accès 100 %).
// Les valeurs attendues sont recalculées par une fonction indépendante écrite d'après
// la section 7.3 du cahier des charges, et non copiées depuis l'implémentation.
import { describe, expect, it } from 'vitest'
import {
  type AccessDocument,
  type AccessInstance,
  type AccessSession,
  type DocStatus,
  type Visibility,
  canDownload,
  canView,
  canViewYear,
  effectivePivot,
  familyValid,
  isProtectedDoc,
  isPublicYear,
  scoutYearLabel,
  scoutYearOf,
} from '../../shared/utils/access'

const NOW = new Date('2026-10-04T10:00:00Z') // année scoute 2026-2027
const DAY = 86_400_000

const FIXED: AccessInstance = { pivotMode: 'fixed', pivotYear: 2016, pivotOffset: 0, switchMonth: 9 }
const SLIDING: AccessInstance = { pivotMode: 'sliding', pivotYear: 0, pivotOffset: 10, switchMonth: 9 }

/* --------------------------- Oracle d'après 7.3 --------------------------- */

function oracleScoutYear(d: Date, switchMonth: number) {
  // Septembre → août : avant le mois de bascule on est encore dans l'année commencée l'an passé.
  return d.getUTCMonth() + 1 < switchMonth ? d.getUTCFullYear() - 1 : d.getUTCFullYear()
}

function oraclePivot(inst: AccessInstance, now: Date) {
  return inst.pivotMode === 'fixed' ? inst.pivotYear : oracleScoutYear(now, inst.switchMonth) - inst.pivotOffset
}

function expected(doc: AccessDocument, session: AccessSession, inst: AccessInstance, now: Date) {
  // 1. status != published ou visibility = hidden → refus (sauf admin)
  if (session.isAdmin) return { allowed: true, reason: 'admin' }
  if (doc.status !== 'published') return { allowed: false, reason: 'unpublished' }
  if (doc.visibility === 'hidden') return { allowed: false, reason: 'hidden' }
  // 2. forcePublic → accord ; forcePrivate → exige une session famille, comme une année récente
  if (doc.visibility === 'forcePublic') return { allowed: true, reason: 'forcePublic' }
  const treatAsRecent = doc.visibility === 'forcePrivate'
  // 3-4. pivot effectif ; year ≤ pivot → accord
  if (!treatAsRecent && doc.yearStart <= oraclePivot(inst, now)) return { allowed: true, reason: 'public' }
  // 5. session famille valide, non révoquée, year ≤ maxYear
  const f = session.family
  const valid = !!f && !f.revoked && f.expiresAt > now.getTime()
  if (!valid) return { allowed: false, reason: 'needsPassword' }
  return doc.yearStart <= f!.maxYear ? { allowed: true, reason: 'family' } : { allowed: false, reason: 'yearNotCovered' }
}

/* ------------------------------- Matrice ---------------------------------- */

const STATUSES: DocStatus[] = ['draft', 'published', 'trashed']
const VISIBILITIES: Visibility[] = ['inherit', 'forcePrivate', 'forcePublic', 'hidden']

type SessionCase = { name: string, make: (year: number) => AccessSession }
const SESSIONS: SessionCase[] = [
  { name: 'aucune session', make: () => ({}) },
  { name: 'session vide (family null)', make: () => ({ isAdmin: false, family: null }) },
  { name: 'admin', make: () => ({ isAdmin: true }) },
  { name: 'admin + famille révoquée', make: y => ({ isAdmin: true, family: { maxYear: y - 5, passwordId: 'p', expiresAt: NOW.getTime() - DAY, revoked: true } }) },
  { name: 'famille valide, maxYear = année', make: y => ({ family: { maxYear: y, passwordId: 'p', expiresAt: NOW.getTime() + DAY } }) },
  { name: 'famille valide, maxYear > année', make: y => ({ family: { maxYear: y + 2, passwordId: 'p', expiresAt: NOW.getTime() + DAY, revoked: false } }) },
  { name: 'famille valide, maxYear < année', make: y => ({ family: { maxYear: y - 1, passwordId: 'p', expiresAt: NOW.getTime() + DAY } }) },
  { name: 'famille expirée', make: y => ({ family: { maxYear: y + 2, passwordId: 'p', expiresAt: NOW.getTime() - 1 } }) },
  { name: 'famille expirant à l\'instant', make: y => ({ family: { maxYear: y + 2, passwordId: 'p', expiresAt: NOW.getTime() } }) },
  { name: 'famille révoquée', make: y => ({ family: { maxYear: y + 2, passwordId: 'p', expiresAt: NOW.getTime() + DAY, revoked: true } }) },
]

for (const [label, inst] of [['pivot fixe 2016', FIXED], ['pivot glissant N=10', SLIDING]] as const) {
  const pivot = oraclePivot(inst, NOW) // 2016 dans les deux cas
  const YEARS = [
    { name: '< pivot', year: pivot - 4 },
    { name: '= pivot', year: pivot },
    { name: '= pivot + 1', year: pivot + 1 },
    { name: '> pivot (année courante)', year: oracleScoutYear(NOW, 9) },
  ]
  const rows: [string, AccessDocument, AccessSession][] = []
  for (const status of STATUSES) {
    for (const visibility of VISIBILITIES) {
      for (const y of YEARS) {
        for (const s of SESSIONS) {
          rows.push([`${status} · ${visibility} · ${y.name} · ${s.name}`, { status, visibility, yearStart: y.year }, s.make(y.year)])
        }
      }
    }
  }

  describe(`canView — matrice exhaustive (${label}, ${rows.length} cas)`, () => {
    it('le pivot effectif vaut 2016', () => {
      expect(effectivePivot(inst, NOW)).toBe(2016)
    })
    it.each(rows)('%s', (_name, doc, session) => {
      expect(canView(doc, session, inst, NOW)).toEqual(expected(doc, session, inst, NOW))
    })
  })

  describe(`isProtectedDoc / canViewYear (${label})`, () => {
    for (const visibility of VISIBILITIES) {
      for (const y of YEARS) {
        it(`isProtectedDoc ${visibility} · ${y.name}`, () => {
          const exp = visibility === 'forcePublic' ? false : visibility === 'forcePrivate' ? true : y.year > pivot
          expect(isProtectedDoc({ status: 'published', visibility, yearStart: y.year }, inst, NOW)).toBe(exp)
        })
      }
    }
    for (const y of YEARS) {
      for (const s of SESSIONS) {
        it(`canViewYear ${y.name} · ${s.name}`, () => {
          const session = s.make(y.year)
          const f = session.family
          const exp = !!session.isAdmin || y.year <= pivot || (!!f && !f.revoked && f.expiresAt > NOW.getTime() && y.year <= f.maxYear)
          expect(canViewYear(y.year, session, inst, NOW)).toBe(exp)
        })
      }
    }
  })
}

/* ------------------------------ Année scoute ------------------------------ */

describe('scoutYearOf / scoutYearLabel', () => {
  it('bascule en septembre : 2025-08-31 → 2024, 2025-09-01 → 2025', () => {
    expect(scoutYearOf(new Date('2025-08-31T23:59:59Z'))).toBe(2024)
    expect(scoutYearOf(new Date('2025-09-01T00:00:00Z'))).toBe(2025)
  })
  it('un camp d\'été 2025 appartient à 2024-2025 (3.1)', () => {
    expect(scoutYearOf(new Date('2025-07-20T12:00:00Z'))).toBe(2024)
  })
  it('janvier et décembre', () => {
    expect(scoutYearOf(new Date('2026-01-15T12:00:00Z'))).toBe(2025)
    expect(scoutYearOf(new Date('2025-12-31T12:00:00Z'))).toBe(2025)
  })
  it('mois de bascule paramétrable (octobre, janvier)', () => {
    expect(scoutYearOf(new Date('2025-09-30T12:00:00Z'), 10)).toBe(2024)
    expect(scoutYearOf(new Date('2025-10-01T00:00:00Z'), 10)).toBe(2025)
    expect(scoutYearOf(new Date('2025-01-01T00:00:00Z'), 1)).toBe(2025)
    expect(scoutYearOf(new Date('2025-12-31T00:00:00Z'), 1)).toBe(2025)
  })
  it('libellé « 2024-2025 »', () => {
    expect(scoutYearLabel(2024)).toBe('2024-2025')
  })
})

describe('effectivePivot / isPublicYear', () => {
  it('mode fixe : la valeur saisie, quelle que soit la date', () => {
    expect(effectivePivot({ ...FIXED, pivotYear: 2010 }, new Date('2030-01-01T00:00:00Z'))).toBe(2010)
  })
  it('mode glissant : année scoute courante − N', () => {
    expect(effectivePivot({ ...SLIDING, pivotOffset: 10 }, new Date('2026-08-31T12:00:00Z'))).toBe(2015)
    expect(effectivePivot({ ...SLIDING, pivotOffset: 10 }, new Date('2026-09-01T12:00:00Z'))).toBe(2016)
    expect(effectivePivot({ ...SLIDING, pivotOffset: 5 }, NOW)).toBe(2021)
  })
  it('mode glissant avec mois de bascule personnalisé', () => {
    expect(effectivePivot({ ...SLIDING, switchMonth: 11 }, NOW)).toBe(2015)
  })
  it('isPublicYear : ≤ pivot public, > pivot protégé', () => {
    expect(isPublicYear(2016, FIXED, NOW)).toBe(true)
    expect(isPublicYear(2000, FIXED, NOW)).toBe(true)
    expect(isPublicYear(2017, FIXED, NOW)).toBe(false)
  })
})

describe('familyValid', () => {
  it('null / undefined / expirée / révoquée → false ; valide → true', () => {
    expect(familyValid(null, NOW)).toBe(false)
    expect(familyValid(undefined, NOW)).toBe(false)
    expect(familyValid({ maxYear: 2025, passwordId: 'p', expiresAt: NOW.getTime() - 1 }, NOW)).toBe(false)
    expect(familyValid({ maxYear: 2025, passwordId: 'p', expiresAt: NOW.getTime() + 1, revoked: true }, NOW)).toBe(false)
    expect(familyValid({ maxYear: 2025, passwordId: 'p', expiresAt: NOW.getTime() + 1 }, NOW)).toBe(true)
  })
})

/* ------------------------------ Téléchargement ---------------------------- */

describe('canDownload (F-08)', () => {
  const pub = { status: 'published' as const, visibility: 'inherit' as const, yearStart: 2010 }
  const prot = { status: 'published' as const, visibility: 'inherit' as const, yearStart: 2025 }

  it('jamais pour un document protégé, même downloadable = true et réglage d\'instance actif', () => {
    for (const downloadable of [true, false, null]) {
      for (const inst of [true, false]) {
        expect(canDownload({ ...prot, downloadable }, inst, FIXED, NOW)).toBe(false)
        expect(canDownload({ ...pub, visibility: 'forcePrivate', downloadable }, inst, FIXED, NOW)).toBe(false)
      }
    }
  })
  it('année publique : réglage d\'instance par défaut (downloadable = null)', () => {
    expect(canDownload({ ...pub, downloadable: null }, true, FIXED, NOW)).toBe(true)
    expect(canDownload({ ...pub, downloadable: null }, false, FIXED, NOW)).toBe(false)
  })
  it('année publique : surcharge par document', () => {
    expect(canDownload({ ...pub, downloadable: true }, false, FIXED, NOW)).toBe(true)
    expect(canDownload({ ...pub, downloadable: false }, true, FIXED, NOW)).toBe(false)
  })
  it('forcePublic dans une année récente : suit le réglage public', () => {
    expect(canDownload({ ...prot, visibility: 'forcePublic', downloadable: null }, true, FIXED, NOW)).toBe(true)
    expect(canDownload({ ...prot, visibility: 'forcePublic', downloadable: false }, true, FIXED, NOW)).toBe(false)
  })
})

/* ------------------------ Critères d'acceptation 12.2 --------------------- */

describe('critères d\'acceptation 12.2', () => {
  const inst: AccessInstance = { pivotMode: 'fixed', pivotYear: 2016, pivotOffset: 10, switchMonth: 9 }
  const doc = (yearStart: number): AccessDocument => ({ yearStart, visibility: 'inherit', status: 'published' })

  it('Un visiteur sans session ne peut voir aucun document d\'une année > pivot', () => {
    for (let y = 2017; y <= 2027; y++) {
      expect(canView(doc(y), {}, inst, NOW)).toEqual({ allowed: false, reason: 'needsPassword' })
      expect(canViewYear(y, {}, inst, NOW)).toBe(false)
    }
  })

  it('Le mot de passe 2025-2026 ouvre les années jusqu\'à 2025-2026 et pas 2026-2027', () => {
    const session: AccessSession = { family: { maxYear: 2025, passwordId: 'pw2025', expiresAt: NOW.getTime() + 30 * DAY } }
    for (let y = 2017; y <= 2025; y++) {
      expect(canView(doc(y), session, inst, NOW)).toEqual({ allowed: true, reason: 'family' })
      expect(canViewYear(y, session, inst, NOW)).toBe(true)
    }
    expect(canView(doc(2026), session, inst, NOW)).toEqual({ allowed: false, reason: 'yearNotCovered' })
    expect(canViewYear(2026, session, inst, NOW)).toBe(false)
  })

  it('Avancer le pivot d\'un an rend publique l\'année concernée', () => {
    expect(canView(doc(2017), {}, inst, NOW).allowed).toBe(false)
    const advanced = { ...inst, pivotYear: 2017 }
    expect(canView(doc(2017), {}, advanced, NOW)).toEqual({ allowed: true, reason: 'public' })
    expect(isProtectedDoc(doc(2017), advanced, NOW)).toBe(false)
    // L'année suivante reste protégée
    expect(canView(doc(2018), {}, advanced, NOW).allowed).toBe(false)
  })

  it('Avancer le pivot glissant d\'un an (rentrée) rend publique l\'année concernée', () => {
    const sliding: AccessInstance = { pivotMode: 'sliding', pivotYear: 0, pivotOffset: 10, switchMonth: 9 }
    const before = new Date('2027-08-31T12:00:00Z')
    const after = new Date('2027-09-01T12:00:00Z')
    expect(canView(doc(2017), {}, sliding, before).allowed).toBe(false)
    expect(canView(doc(2017), {}, sliding, after)).toEqual({ allowed: true, reason: 'public' })
  })

  it('Un mot de passe révoqué invalide la session', () => {
    const family = { maxYear: 2026, passwordId: 'pw', expiresAt: NOW.getTime() + 30 * DAY }
    expect(canView(doc(2026), { family }, inst, NOW).allowed).toBe(true)
    expect(canView(doc(2026), { family: { ...family, revoked: true } }, inst, NOW)).toEqual({ allowed: false, reason: 'needsPassword' })
    expect(canViewYear(2026, { family: { ...family, revoked: true } }, inst, NOW)).toBe(false)
  })

  it('forcePrivate couvre une demande de retrait même sur une année publique', () => {
    expect(canView({ ...doc(2000), visibility: 'forcePrivate' }, {}, inst, NOW)).toEqual({ allowed: false, reason: 'needsPassword' })
  })
})
