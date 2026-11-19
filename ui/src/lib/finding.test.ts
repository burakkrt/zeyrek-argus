import type { Occurrence } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { findingDocument } from './finding'

const occurrence = (over: Partial<Occurrence>): Occurrence =>
  ({
    page: 'performans-donemler',
    scenario: '1. Yeni dönem aç. 2. Gezinti yoluna tıkla.',
    expected: 'Onay sorulur.',
    observed: 'Soru çıkmadan liste açıldı.',
    quote: null,
    report: null,
    ...over,
  }) as Occurrence

describe('bulgu belgesi', () => {
  it('raporlu bulgu: alanlar rapordan, adımlar senaryodan; yer rapordaki metin', () => {
    const doc = findingDocument(
      occurrence({
        report: {
          summary: 'Form sorulmadan kapanıyor.',
          impact: 'Girdi kaybolur.',
          location: 'Performans › Yeni dönem',
          proof: 'Ekranda tekrar edildi.',
          rootCause: '',
          fix: 'Gezinti yolunu denetimden geçir.',
          acceptance: ['Onay sorulur.'],
        },
      }),
      'Yeni dönem',
    )
    expect(doc).toEqual({
      summary: 'Form sorulmadan kapanıyor.',
      impact: 'Girdi kaybolur.',
      location: 'Performans › Yeni dönem',
      steps: ['Yeni dönem aç.', 'Gezinti yoluna tıkla.'],
      expected: 'Onay sorulur.',
      observed: 'Soru çıkmadan liste açıldı.',
      proof: 'Ekranda tekrar edildi.',
      quote: null,
      rootCause: '',
      fix: 'Gezinti yolunu denetimden geçir.',
      acceptance: ['Onay sorulur.'],
    })
  })

  it('raporsuz eski bulgu: yer sayfa adından; gözlenene eklenmiş kanıt notu ayrılıp Kanıt satırına geçer', () => {
    const doc = findingDocument(
      occurrence({
        observed:
          'Yönetici atandı iletisi geldi (Çalıştırılarak doğrulandı; kaynak: pf-donem-islem {"ok":true})',
        quote: 'Yönetici atandı',
      }),
      'Platform tanımları',
    )
    expect(doc.location).toBe('Platform tanımları')
    expect(doc.observed).toBe('Yönetici atandı iletisi geldi')
    expect(doc.proof).toBe('Çalıştırılarak doğrulandı. Kaynak: pf-donem-islem {"ok":true}')
    expect(doc.quote).toBe('Yönetici atandı')
    expect(doc.summary).toBe('')
    expect(doc.acceptance).toEqual([])
  })
})
