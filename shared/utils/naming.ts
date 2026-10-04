// Conventions de nommage et pré-remplissage depuis le nom de fichier (A-08).
import { scoutYearOf } from './access'

export interface BranchDef { key: string, label: string, color?: string }

export const DEFAULT_BRANCHES: BranchDef[] = [
  { key: 'FA', label: 'Farfadets', color: '#5fb236' },
  { key: 'LJ', label: 'Louveteaux-Jeannettes', color: '#f39200' },
  { key: 'SG', label: 'Scouts-Guides', color: '#0077b6' },
  { key: 'PK', label: 'Pionniers-Caravelles', color: '#d62828' },
  { key: 'CO', label: 'Compagnons', color: '#2a9d8f' },
  { key: 'CH', label: 'Chefs', color: '#6c757d' },
]

export const DEFAULT_EVENT_TYPES = ['Camp d\'été', 'Camp', 'Week-end', 'Fête de groupe', 'Sortie', 'Rassemblement', 'Veillée', 'Autre']

export function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type DocKind = 'video' | 'photo' | 'pdf' | 'audio'

export function kindFromFilename(name: string, mime?: string): DocKind | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime?.startsWith('video/') || ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'mts', 'mpg', 'mpeg', 'wmv'].includes(ext)) return 'video'
  if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'tif', 'tiff'].includes(ext)) return 'photo'
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime?.startsWith('audio/') || ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', 'opus'].includes(ext)) return 'audio'
  return null
}

export interface FilenameGuess {
  scoutYear?: number
  date?: string
  eventType?: string
  eventSlug?: string
  branch?: string
  title: string
  kind: DocKind | null
}

const SUMMER_SLUGS = new Set(['camp-ete', 'camp-dete', 'camp-d-ete', 'ete', 'grand-camp'])

/**
 * Convention : segments séparés par « _ », dans n'importe quel ordre.
 *  - « 2019-2020 » : année scoute explicite (début 2019) ;
 *  - « 2019-07-14 » : date complète, l'année scoute en est déduite ;
 *  - « 2019 » seul : année scoute qui commence en 2019, SAUF pour un camp d'été
 *    où c'est l'été 2019, donc l'année 2018-2019 ;
 *  - un code de branche (SG, LJ…) ;
 *  - un type d'événement en minuscules avec tirets (camp-ete, week-end…) ;
 *  - le reste forme le titre.
 * Exemple : 2019_camp-ete_SG_montage.mp4 → année 2018-2019, Camp d'été, Scouts-Guides, « Montage ».
 */
export function parseFilename(
  filename: string,
  opts: { branches?: BranchDef[], eventTypes?: string[], switchMonth?: number } = {},
): FilenameGuess {
  const branches = opts.branches ?? DEFAULT_BRANCHES
  const eventTypes = opts.eventTypes ?? DEFAULT_EVENT_TYPES
  const switchMonth = opts.switchMonth ?? 9
  const base = filename.split('/').pop()!.replace(/\.[^.]+$/, '')
  const parts = base.split(/[_\s]+/).filter(Boolean)
  const guess: FilenameGuess = { title: '', kind: kindFromFilename(filename) }
  const rest: string[] = []
  let plainYear: number | undefined

  for (const p of parts) {
    let m: RegExpMatchArray | null
    if ((m = p.match(/^(\d{4})-(\d{4})$/)) && Number(m[2]) === Number(m[1]) + 1) {
      guess.scoutYear = Number(m[1])
    }
    else if ((m = p.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
      guess.date = p
      guess.scoutYear = scoutYearOf(new Date(`${p}T12:00:00Z`), switchMonth)
    }
    else if (/^(19|20)\d{2}$/.test(p) && plainYear === undefined) {
      plainYear = Number(p)
    }
    else if (!guess.branch && branches.some(b => b.key.toLowerCase() === p.toLowerCase())) {
      guess.branch = branches.find(b => b.key.toLowerCase() === p.toLowerCase())!.key
    }
    else if (!guess.eventType && eventTypes.some(t => slugify(t) === slugify(p))) {
      guess.eventType = eventTypes.find(t => slugify(t) === slugify(p))
      guess.eventSlug = slugify(p)
    }
    else if (!guess.eventType && SUMMER_SLUGS.has(slugify(p))) {
      guess.eventType = eventTypes.find(t => slugify(t) === 'camp-dete') ?? 'Camp d\'été'
      guess.eventSlug = 'camp-dete'
    }
    else {
      rest.push(p)
    }
  }

  if (guess.scoutYear === undefined && plainYear !== undefined) {
    guess.scoutYear = guess.eventSlug && SUMMER_SLUGS.has(guess.eventSlug) ? plainYear - 1 : plainYear
  }
  const title = rest.join(' ').replace(/[-.]+/g, ' ').trim()
  guess.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : (guess.eventType ?? base)
  return guess
}

export const NAMING_RULE = `Segments séparés par « _ » : année (« 2019-2020 », date « 2019-07-14 », ou « 2019 » = année scoute qui commence en 2019, sauf camp d'été = été 2019 donc 2018-2019), code de branche (ex. SG), type d'événement en slug (ex. camp-dete, week-end), puis le titre. Exemple : 2019_camp-ete_SG_montage.mp4.`
