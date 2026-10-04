// Pré-remplissage depuis le nom de fichier (A-08) et règle de nommage (I-12 get_conventions).
import { describe, expect, it } from 'vitest'
import { DEFAULT_BRANCHES, DEFAULT_EVENT_TYPES, NAMING_RULE, kindFromFilename, parseFilename, slugify } from '../../shared/utils/naming'

describe('parseFilename', () => {
  it('exemple du cahier des charges : 2019_camp-ete_SG_montage.mp4 → 2018-2019 (camp de l\'été 2019)', () => {
    expect(parseFilename('2019_camp-ete_SG_montage.mp4')).toMatchObject({
      scoutYear: 2018,
      eventType: 'Camp d\'été',
      branch: 'SG',
      title: 'Montage',
      kind: 'video',
    })
  })

  it('le slug exact du type (camp-dete) est aussi reconnu comme camp d\'été', () => {
    expect(parseFilename('2019_camp-dete_LJ_veillee.mp4')).toMatchObject({ scoutYear: 2018, eventType: 'Camp d\'été', eventSlug: 'camp-dete', branch: 'LJ' })
    expect(parseFilename('2019_grand-camp_PK.mp4')).toMatchObject({ scoutYear: 2018, eventType: 'Camp d\'été' })
  })

  it('année scoute explicite : 2019-2020_week-end_LJ_rando.mp4', () => {
    expect(parseFilename('2019-2020_week-end_LJ_rando.mp4')).toMatchObject({
      scoutYear: 2019,
      eventType: 'Week-end',
      eventSlug: 'week-end',
      branch: 'LJ',
      title: 'Rando',
    })
  })

  it('l\'année scoute explicite l\'emporte sur la règle du camp d\'été', () => {
    expect(parseFilename('2018-2019_camp-ete_SG.mp4').scoutYear).toBe(2018)
  })

  it('année seule hors camp d\'été = année scoute qui commence cette année-là', () => {
    expect(parseFilename('2019_fete-de-groupe_kermesse.jpg')).toMatchObject({ scoutYear: 2019, eventType: 'Fête de groupe', title: 'Kermesse', kind: 'photo' })
  })

  it('date complète : 2021-07-14 → année scoute 2020, date conservée', () => {
    expect(parseFilename('2021-07-14_camp_PK_soiree-feu.mp4')).toMatchObject({
      date: '2021-07-14',
      scoutYear: 2020,
      eventType: 'Camp',
      branch: 'PK',
      title: 'Soiree feu',
    })
    expect(parseFilename('2021-09-15_sortie.mp4').scoutYear).toBe(2021)
  })

  it('date complète avec mois de bascule personnalisé', () => {
    expect(parseFilename('2021-09-15_sortie.mp4', { switchMonth: 10 }).scoutYear).toBe(2020)
  })

  it('« 2019-2021 » (années non consécutives) n\'est pas une année scoute', () => {
    expect(parseFilename('2019-2021_souvenirs.pdf').scoutYear).toBeUndefined()
  })

  it('segments inconnus → titre, séparateurs remplacés et majuscule initiale', () => {
    expect(parseFilename('2010_journal.de.bord_tome-2.pdf')).toMatchObject({ scoutYear: 2010, title: 'Journal de bord tome 2', kind: 'pdf' })
    expect(parseFilename('chant du depart.mp3')).toMatchObject({ title: 'Chant du depart', kind: 'audio' })
    expect(parseFilename('chant du depart.mp3').scoutYear).toBeUndefined()
  })

  it('sans titre : le type d\'événement, sinon le nom de base', () => {
    expect(parseFilename('2019_camp_SG.mp4').title).toBe('Camp')
    expect(parseFilename('2019_SG.mp4').title).toBe('2019_SG')
  })

  it('code de branche insensible à la casse, normalisé', () => {
    expect(parseFilename('2019_sg_x.mp4').branch).toBe('SG')
  })

  it('branches et types d\'événements paramétrables par instance', () => {
    const g = parseFilename('2019_raid_ECL_trek.mp4', { branches: [{ key: 'ECL', label: 'Éclaireurs' }], eventTypes: ['Raid'] })
    expect(g).toMatchObject({ scoutYear: 2019, eventType: 'Raid', branch: 'ECL', title: 'Trek' })
    // SG n'existe pas dans cette instance : il devient du titre
    expect(parseFilename('2019_SG.mp4', { branches: [], eventTypes: [] }).branch).toBeUndefined()
  })

  it('chemin de type dossier : seul le nom de fichier est analysé', () => {
    const g = parseFilename('archives/2019_camp-ete/SG_montage.mp4')
    expect(g).toMatchObject({ branch: 'SG', title: 'Montage', kind: 'video' })
    expect(g.scoutYear).toBeUndefined()
  })

  it('chemin de dossier aplati comme le fait plan_import (3 derniers segments joints par « _ »)', () => {
    const path = 'fonds/2019_camp-ete/SG_montage.mp4'
    const flat = path.split('/').slice(-3).join('_')
    expect(parseFilename(flat)).toMatchObject({ scoutYear: 2018, eventType: 'Camp d\'été', branch: 'SG', title: 'Fonds montage' })
    expect(parseFilename('2019-2020_week-end/LJ/rando.mp4'.split('/').join('_'))).toMatchObject({ scoutYear: 2019, eventType: 'Week-end', branch: 'LJ', title: 'Rando' })
  })

  it('espaces acceptés comme séparateurs', () => {
    expect(parseFilename('2019 camp-ete SG montage.mp4')).toMatchObject({ scoutYear: 2018, branch: 'SG', title: 'Montage' })
  })
})

describe('kindFromFilename', () => {
  it.each([
    ['a.mp4', 'video'], ['a.MOV', 'video'], ['a.mkv', 'video'],
    ['a.JPG', 'photo'], ['a.webp', 'photo'], ['a.heic', 'photo'],
    ['a.pdf', 'pdf'],
    ['a.mp3', 'audio'], ['a.m4a', 'audio'], ['a.flac', 'audio'],
    ['a.txt', null], ['sans-extension', null],
  ])('%s → %s', (name, kind) => {
    expect(kindFromFilename(name)).toBe(kind)
  })
  it('le type MIME prime sur l\'extension', () => {
    expect(kindFromFilename('a.bin', 'video/mp4')).toBe('video')
    expect(kindFromFilename('a.bin', 'image/png')).toBe('photo')
    expect(kindFromFilename('a.bin', 'application/pdf')).toBe('pdf')
    expect(kindFromFilename('a.bin', 'audio/mpeg')).toBe('audio')
  })
})

describe('slugify', () => {
  it.each([
    ['Camp d\'été', 'camp-dete'],
    ['Fête de groupe', 'fete-de-groupe'],
    ['  Été à Jambville ! ', 'ete-a-jambville'],
    ['Louveteaux-Jeannettes', 'louveteaux-jeannettes'],
    ['L’écureuil', 'lecureuil'],
    ['ÇA_VA', 'ca-va'],
  ])('%s → %s', (input, out) => {
    expect(slugify(input)).toBe(out)
  })
})

describe('conventions par défaut', () => {
  it('branches du mouvement et types d\'événements', () => {
    expect(DEFAULT_BRANCHES.map(b => b.key)).toEqual(['FA', 'LJ', 'SG', 'PK', 'CO', 'CH'])
    expect(DEFAULT_EVENT_TYPES).toContain('Camp d\'été')
    expect(NAMING_RULE).toContain('2019_camp-ete_SG_montage.mp4')
  })
})
