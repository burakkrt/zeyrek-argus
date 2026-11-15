import { describe, expect, it } from 'vitest'
import { apiPrint, comparePrints, maskTree, studioPrint, uiPrint } from './prints.ts'

const tree = (rows: string[], extra = '') =>
  [
    '- heading "Eğitim listesi" [level=1] [ref=e1]',
    '- table [ref=e2]:',
    ...rows.map((r, i) => `  - row "${r}" [ref=e${i + 3}]`),
    '  - … (+12 benzer row)',
    '- paragraph [ref=e40]: Toplam: 15 kayıt',
    extra,
  ]
    .filter(Boolean)
    .join('\n')

describe('değişiklik izi', () => {
  it('veri değişince arayüz izi aynı kalır, yapı değişince değişir', () => {
    const a = uiPrint(tree(['Yangın eğitimi 2024', 'İlk yardım', 'Tatbikat']))
    const b = uiPrint(tree(['Kalite eğitimi 2025', 'Denetim', 'Risk']))
    const c = uiPrint(
      tree(['Yangın eğitimi 2024', 'İlk yardım', 'Tatbikat'], '- button "Dışa aktar" [ref=e41]'),
    )
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(maskTree('- row "x 12" [ref=e9]')).toBe('- row "…"')
  })

  it('yalnız odağı değişen ekranın izi aynıdır (değişiklik izi odakla oynamaz)', () => {
    const screen = tree(
      ['Yangın eğitimi 2024'],
      '- link "Ana sayfa" [cursor=pointer] [ref=e50]:\n  - generic',
    )
    const focused = tree(
      ['Yangın eğitimi 2024'],
      '- link "Ana sayfa" [active] [cursor=pointer] [ref=e61]:\n    ',
    )
    expect(uiPrint(focused)).toBe(uiPrint(screen))
  })

  it('veri izi kimliklere ve sıraya bakmaz, uç kümesine bakar', () => {
    const get = (url: string) => ({ method: 'GET', url, status: 200, ms: 1 })
    expect(apiPrint([get('http://x/api/row/list'), get('http://x/api/row/5')])).toBe(
      apiPrint([get('http://x/api/row/9'), get('http://x/api/row/list')]),
    )
    expect(apiPrint([get('http://x/api/row/list')])).not.toBe(apiPrint([get('http://x/api/other')]))
  })

  it('Studio izi sürüm alanını yok sayar; karşılaştırma ilk ölçümü ve alınamayanı ayırır', () => {
    expect(studioPrint({ version: 1, schema: { b: 1, a: 2 } })).toBe(
      studioPrint({ schema: { a: 2, b: 1 }, version: 9 }),
    )
    expect(studioPrint({ schema: { a: 1 } })).not.toBe(studioPrint({ schema: { a: 2 } }))
    const print = { ui: 'u', api: 'a', studio: null }
    expect(comparePrints(null, print)).toEqual({ ui: 'ilk', api: 'ilk', studio: 'bilinmiyor' })
    expect(comparePrints({ ui: 'u', api: 'b', studio: 's' }, print)).toEqual({
      ui: 'ayni',
      api: 'degisti',
      studio: 'bilinmiyor',
    })
  })
})
