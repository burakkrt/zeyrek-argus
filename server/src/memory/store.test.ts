import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Rule } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { selectRules } from './select.ts'
import { decisionFileName, MemoryStore, parseDecision, serializeDecision, type DecisionRecord } from './store.ts'

const app = { project: 'qm', application: 'web' }

const rule = (over: Partial<Rule>): Omit<Rule, 'file'> => ({
  id: 'kural',
  scope: 'uygulama',
  type: 'sorun',
  state: 'onayli',
  text: 'Bir kural.',
  sources: [],
  author: 'test',
  date: '2026-11-13',
  app,
  ...over,
})

describe('karar dosyası', () => {
  it('gidiş-dönüş: tarihçe, çok satırlı yorum ve örnek korunur', () => {
    const record: DecisionRecord = {
      key: 'goz:kesik-metin:en çok',
      title: 'Metin sığmıyor: "En çok"',
      kind: 'kesin',
      status: 'duzeltilecek',
      updatedAt: '2026-11-13T21:00:00.000Z',
      example: { page: 'anket-sonuc-raporu', scenario: 'Filtre satırına bak', expected: 'Tam görünür', observed: 'En çc' },
      history: [{ at: '2026-11-13T21:00:00.000Z', author: 'Burak', from: 'acik', to: 'duzeltilecek', note: 'dikkat: tüm filtreler' }],
      comments: [{ at: '2026-11-13T21:01:00.000Z', author: 'Burak', text: 'Düzelt ama\nbaşka sayfalara da bak' }],
    }
    expect(parseDecision(serializeDecision(record), 'test')).toEqual(record)
  })

  it('dosya adı okunur ve anahtara özgü', () => {
    expect(decisionFileName('goz:ham-deger:undefined')).toMatch(/^goz-ham-deger-undefined-[0-9a-f]{6}\.md$/)
    expect(decisionFileName('yz:a')).not.toBe(decisionFileName('yz:a '))
  })
})

describe('MemoryStore', () => {
  it('kuralı yazar ve okur; bozuk elle düzenlemeyi reddeder', () => {
    const store = new MemoryStore(mkdtempSync(join(tmpdir(), 'argus-memory-')))
    store.writeRule(rule({ id: 'tarih-bicimi', text: 'Tarih Türkçe gösterilir.', scope: 'platform', app: null }))
    store.writeRule(rule({ id: 'sapkali-harf', pattern: '[âîû]', sources: ['musteri:K1#1'] }))
    const rules = store.rules(app)
    expect(rules.map((r) => `${r.id}:${r.scope}:${r.file}`)).toEqual([
      'tarih-bicimi:platform:platform/rules/tarih-bicimi.md',
      'sapkali-harf:uygulama:apps/qm/web/rules/sapkali-harf.md',
    ])
    expect(rules[1]).toMatchObject({ pattern: '[âîû]', sources: ['musteri:K1#1'] })
    expect(() => store.writeFile('apps/qm/web/rules/x.md', '---\ndurum: belki\n---\nx')).toThrow(/durum/)
    expect(() => store.writeFile('../disari.md', 'x')).toThrow(/Hafıza dışına/)
  })
})

describe('selectRules', () => {
  const rules = [
    rule({ id: 'p', scope: 'platform', app: null, text: 'Platform kuralı' }),
    rule({ id: 'u', text: 'Uygulama kuralı' }),
    rule({ id: 'm', scope: 'modul:pf', text: 'Performans modülü kuralı' }),
    rule({ id: 's', scope: 'sayfa:pf-karne', text: 'Karne sayfası kuralı' }),
    rule({ id: 'baska', scope: 'modul:egt', text: 'Eğitim kuralı' }),
    rule({ id: 'aday', state: 'aday', text: 'Henüz onaysız' }),
    rule({ id: 'desen', pattern: '[âîû]', text: 'Şapkalı harf yok' }),
  ]

  it('kapsamı eşleşen onaylı kuralları özgüllük sırasıyla seçer, desenliyi göze ayırır', () => {
    const selection = selectRules(rules as Rule[], app, 'pf-karne', 1000)
    expect(selection.used.map((r) => r.id)).toEqual(['s', 'm', 'u', 'p'])
    expect(selection.patterns.map((p) => p.id)).toEqual(['desen'])
    expect(selection.text).toContain('[s] (sorun) Karne sayfası kuralı')
  })

  it('bütçeyi aşanı düşürür', () => {
    const selection = selectRules(rules as Rule[], app, 'pf-karne', 20)
    expect(selection.used.length).toBeLessThan(4)
    expect(selection.dropped.length).toBeGreaterThan(0)
    expect(selection.tokens).toBeLessThanOrEqual(20)
  })
})
