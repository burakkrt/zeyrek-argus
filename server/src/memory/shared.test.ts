import { describe, expect, it } from 'vitest'
import { authorSlug, parseFindings, serializeFindings, type SharedFinding } from './shared.ts'

const finding = (key: string, over: Partial<SharedFinding> = {}): SharedFinding => ({
  key,
  title: 'Toplam tutmuyor',
  kind: 'tutarsizlik',
  pages: ['egt-liste', 'egt-form'],
  firstSeen: '2026-11-14T10:00:00.000Z',
  lastSeen: '2026-11-15T10:00:00.000Z',
  seenCount: 3,
  page: 'egt-liste',
  scenario: 'Listeyi aç',
  expected: 'Toplam satırla tutmalı',
  observed: 'Toplam 5,\ntabloda 3 satır',
  quote: 'Toplam: 5 kayıt',
  ...over,
})

describe('paylaşılan bulgular', () => {
  it('yazar kısaltması dosya adına uygun: Türkçe harf sadeleşir, boşsa argus', () => {
    expect(authorSlug('Burak Kurt')).toBe('burak-kurt')
    expect(authorSlug('Çağrı Öztürk')).toBe('cagri-ozturk')
    expect(authorSlug('  ')).toBe('argus')
  })

  it('dosya anahtar sırasıyla yazılır ve aynen geri okunur; çok satırlı metin tek satıra iner', () => {
    const text = serializeFindings('Burak', '2026-11-15T11:00:00.000Z', [
      finding('yz:z-son'),
      finding('goz:guid', { quote: null, pages: ['egt-liste'] }),
    ])
    expect(text.indexOf('## goz:guid')).toBeLessThan(text.indexOf('## yz:z-son'))
    const parsed = parseFindings(text)
    expect(parsed.author).toBe('Burak')
    expect(parsed.updatedAt).toBe('2026-11-15T11:00:00.000Z')
    expect(parsed.findings).toEqual([
      finding('goz:guid', { quote: null, pages: ['egt-liste'], observed: 'Toplam 5, tabloda 3 satır' }),
      finding('yz:z-son', { observed: 'Toplam 5, tabloda 3 satır' }),
    ])
  })

  it('bozuk bölüm atlanır, geri kalanı okunur', () => {
    const text = serializeFindings('Ali', 'x', [finding('yz:iyi')]).replace(
      '## yz:iyi',
      '## yz:bozuk\n- baslik: \n- tur: bilinmez\n\n## yz:iyi',
    )
    expect(parseFindings(text).findings.map((f) => f.key)).toEqual(['yz:iyi'])
  })
})
