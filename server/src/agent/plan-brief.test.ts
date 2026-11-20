import type { RunStrategy } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { approvedPlan, revisionBrief, sanitizePlan } from './plan-brief.ts'

const plan: RunStrategy = {
  kind: 'akis',
  scope: 'tam',
  understood: 'Dönem oluşturma akışı',
  scenarios: ['Zorunlu alanlar boşken kaydet'],
  doneWhen: 'Akış uçtan uca denendi',
  known: [],
  infeasible: [],
  items: [
    { title: 'Form doğrulaması', goal: 'Zorunlu alanları dene', source: 'ekran', page: 'pf-donem', fullScan: false, independent: false },
  ],
  guides: ['akis'],
}

describe('plan düzenleme isteği', () => {
  it('asıl istek, önceki taslak (kapsam, senaryolar, vakalar) ve kullanıcının isteği planlayıcıya birlikte gider', () => {
    const text = revisionBrief('Dönem akışını test et', plan, 'Kalibrasyon adımını da ekle')
    expect(text).toContain('Dönem akışını test et')
    expect(text).toContain('ÖNCEKİ TASLAK PLAN')
    expect(text).toContain('Kapsam: Dönem oluşturma akışı')
    expect(text).toContain('- Zorunlu alanlar boşken kaydet')
    expect(text).toContain('1. Form doğrulaması (ekran, pf-donem): Zorunlu alanları dene')
    expect(text).toContain('KULLANICININ DÜZENLEME İSTEĞİ: Kalibrasyon adımını da ekle')
  })

  it('kullanıcının koşudan çıkardığı vaka taslakta işaretli gider', () => {
    const text = revisionBrief('x', { ...plan, items: [{ ...plan.items[0]!, excluded: true }] }, 'Vakaları gözden geçir')
    expect(text).toContain('1. Form doğrulaması (ekran, pf-donem): Zorunlu alanları dene [kullanıcı koşudan çıkardı]')
  })

  it('istek ya da önceki plan yoksa asıl istek olduğu gibi kalır', () => {
    expect(revisionBrief('Dönem akışını test et', null, 'x')).toBe('Dönem akışını test et')
    expect(revisionBrief('Dönem akışını test et', plan, null)).toBe('Dönem akışını test et')
  })
})

describe('elle düzenlenen plan', () => {
  it('boş vaka, senaryo ve not atılır, metinler kırpılır, bilinmeyen kaynak "ikisi" olur, tanım vakasının sayfası boşalır', () => {
    const clean = sanitizePlan({
      ...plan,
      understood: '  Dönem akışı  ',
      scenarios: [' A ', '', 'B'],
      known: [' Kural ', ''],
      infeasible: ['', 'E-posta gönderilmez'],
      items: [
        { ...plan.items[0]!, title: '  Yeni vaka ', goal: ' Amaç ' },
        { ...plan.items[0]!, title: '   ', goal: '' },
        { ...plan.items[0]!, title: 'Tanım', source: 'tanim', page: 'pf-donem' },
        { ...plan.items[0]!, title: 'Garip', source: 'xyz' as never },
      ],
    })
    expect(clean.understood).toBe('Dönem akışı')
    expect(clean.scenarios).toEqual(['A', 'B'])
    expect(clean.known).toEqual(['Kural'])
    expect(clean.infeasible).toEqual(['E-posta gönderilmez'])
    expect(clean.items.map((i) => [i.title, i.goal, i.source, i.page])).toEqual([
      ['Yeni vaka', 'Amaç', 'ekran', 'pf-donem'],
      ['Tanım', 'Zorunlu alanları dene', 'tanim', null],
      ['Garip', 'Zorunlu alanları dene', 'ikisi', 'pf-donem'],
    ])
  })

  it('koşudan çıkarılan vaka taslakta işaretini korur, onaylanan plana girmez', () => {
    const clean = sanitizePlan({
      ...plan,
      items: [
        { ...plan.items[0]!, title: 'Dahil' },
        { ...plan.items[0]!, title: 'Çıkarılan', excluded: true },
        { ...plan.items[0]!, title: 'Yanlış işaret', excluded: 'evet' as never },
      ],
    })
    expect(clean.items.map((i) => [i.title, i.excluded])).toEqual([
      ['Dahil', undefined],
      ['Çıkarılan', true],
      ['Yanlış işaret', undefined],
    ])
    expect(approvedPlan(clean).items.map((i) => i.title)).toEqual(['Dahil', 'Yanlış işaret'])
  })
})
