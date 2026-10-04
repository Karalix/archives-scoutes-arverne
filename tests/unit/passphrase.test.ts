// Passphrases annuelles (R-07) et normalisation avant hachage.
import { describe, expect, it } from 'vitest'
import { WORDS, generatePassphrase, normalizePassphrase, randomInt } from '../../shared/utils/passphrase'

describe('generatePassphrase', () => {
  it('format « mot-mot-mot-2026 » pour l\'année 2025-2026', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassphrase(2025)
      expect(p).toMatch(/^[a-z]+-[a-z]+-[a-z]+-2026$/)
      const words = p.split('-').slice(0, 3)
      expect(new Set(words).size).toBe(3)
      for (const w of words) expect(WORDS).toContain(w)
    }
  })
  it('nombre de mots paramétrable', () => {
    expect(generatePassphrase(2030, 4)).toMatch(/^([a-z]+-){4}2031$/)
  })
  it('déjà normalisée (stable après normalizePassphrase)', () => {
    const p = generatePassphrase(2025)
    expect(normalizePassphrase(p)).toBe(p)
  })
  it('varie d\'un appel à l\'autre', () => {
    const set = new Set(Array.from({ length: 50 }, () => generatePassphrase(2025)))
    expect(set.size).toBeGreaterThan(45)
  })
})

describe('WORDS', () => {
  it('mots en minuscules, sans accent ni tiret', () => {
    for (const w of WORDS) expect(w).toMatch(/^[a-z]+$/)
  })
  it('sans doublon', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length)
  })
  it('au moins 200 mots', () => {
    expect(new Set(WORDS).size).toBeGreaterThanOrEqual(200)
  })
  // La liste compte 227 mots (≈ 23,5 bits pour 3 mots) : objectif 256 non atteint.
  it('au moins 256 mots (≥ 24 bits d\'entropie pour 3 mots)', () => {
    expect(new Set(WORDS).size).toBeGreaterThanOrEqual(256)
  })
})

describe('randomInt', () => {
  it('reste dans [0, max)', () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(7)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(7)
    }
  })
})

describe('normalizePassphrase', () => {
  it('casse, espaces et séparateurs', () => {
    expect(normalizePassphrase('  Castor Boussole_FEU 2026 ')).toBe('castor-boussole-feu-2026')
  })
  it('accents supprimés', () => {
    expect(normalizePassphrase('Bruyère-Clairière-Étoile-2026')).toBe('bruyere-clairiere-etoile-2026')
  })
  it('séparateurs multiples et ponctuation', () => {
    expect(normalizePassphrase('castor -- boussole.feu;2026,')).toBe('castor-boussole-feu-2026')
    expect(normalizePassphrase('-castor-')).toBe('castor')
  })
})
