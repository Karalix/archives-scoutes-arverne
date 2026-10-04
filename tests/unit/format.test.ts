// Mise en forme partagée front/serveur.
import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, miniMarkdown } from '../../shared/utils/format'

describe('miniMarkdown (F-01)', () => {
  it('échappe le HTML', () => {
    expect(miniMarkdown('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(miniMarkdown('a & "b"')).toBe('<p>a &amp; &quot;b&quot;</p>')
    expect(miniMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
  it('gras et italique', () => {
    expect(miniMarkdown('**gras** et *italique*')).toBe('<p><strong>gras</strong> et <em>italique</em></p>')
  })
  it('liens http(s) et relatifs', () => {
    expect(miniMarkdown('[site](https://example.org/a)')).toBe('<p><a href="https://example.org/a" rel="noopener">site</a></p>')
    expect(miniMarkdown('[année](/annees/2010)')).toBe('<p><a href="/annees/2010" rel="noopener">année</a></p>')
  })
  it('refuse les liens javascript: et data:', () => {
    const h = miniMarkdown('[x](javascript:alert(1)) [y](data:text/html,abc)')
    expect(h).not.toContain('href')
    expect(h).not.toContain('<a')
  })
  it('un lien ne peut pas sortir de l\'attribut href', () => {
    const h = miniMarkdown('[x](https://e.org/"onmouseover="alert(1))')
    expect(h).not.toMatch(/href="[^"]*"onmouseover/)
  })
  it('paragraphes et retours à la ligne', () => {
    expect(miniMarkdown('un\ndeux\n\ntrois')).toBe('<p>un<br>deux</p><p>trois</p>')
    expect(miniMarkdown('')).toBe('')
    expect(miniMarkdown('\n\n\n')).toBe('')
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 o'],
    [null, '0 o'],
    [undefined, '0 o'],
    [512, '512 o'],
    [1024, '1 Ko'],
    [1536, '1,5 Ko'],
    [13 * 1024 ** 3, '13 Go'],
    [2.5 * 1024 ** 4, '2,5 To'],
    [3 * 1024 ** 5, '3 072 To'],
  ])('%s → %s', (n, out) => {
    expect(formatBytes(n as number).replace(/\s/g, ' ')).toBe(out)
  })
})

describe('formatDuration', () => {
  it.each([
    [0, ''],
    [null, ''],
    [5, '0:05'],
    [65, '1:05'],
    [599.9, '9:59'],
    [3600, '1 h 00'],
    [3725, '1 h 02'],
  ])('%s → %s', (s, out) => {
    expect(formatDuration(s as number)).toBe(out)
  })
})
