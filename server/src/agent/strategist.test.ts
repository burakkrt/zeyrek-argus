import { describe, expect, it } from 'vitest'
import { inspectsScreens, normalizeStrategy, pageWork, scanStrategy } from './strategist.ts'

const catalog = ['egt-liste', 'egt-form'].map((slug) => ({ id: slug, slug, name: slug }))
const raw = (kalemler: Array<{ baslik: string; kaynak: string; sayfa: string; tam_tarama: boolean }>) => ({
  tur: 'bilinmeyen',
  anlasilan: 'A',
  sorular: [],
  basari: 'B',
  bilinenler: [],
  yapilamayan: [],
  kalemler: kalemler.map((k) => ({ ...k, amac: `${k.baslik} amacı` })),
})

describe('strateji', () => {
  it('katalog dışı sayfalı ekran kalemi tanıma döner; seçilip planda olmayan sayfa baştan sona taranır', () => {
    const strategy = normalizeStrategy(
      raw([
        { baslik: 'Kural', kaynak: 'tanim', sayfa: 'egt-liste', tam_tarama: true },
        { baslik: 'Liste', kaynak: 'ekran', sayfa: 'egt-liste', tam_tarama: false },
        { baslik: 'Hayalet', kaynak: 'ekran', sayfa: 'yok', tam_tarama: true },
      ]),
      catalog,
      ['egt-form'],
    )
    expect(strategy.kind).toBe('karisik')
    expect(strategy.items.map((i) => [i.title, i.source, i.page, i.fullScan])).toEqual([
      ['Kural', 'tanim', null, false],
      ['Liste', 'ekran', 'egt-liste', false],
      ['Hayalet', 'tanim', null, false],
      ['Sayfanın tamamı', 'ekran', 'egt-form', true],
    ])
  })

  it('sayfa işi: kalemler görev olur, "ikisi" önce tanımı okutur; tam tarama varsa planlayıcı da çalışır', () => {
    const items = normalizeStrategy(
      raw([
        { baslik: 'Teyit', kaynak: 'ikisi', sayfa: 'egt-liste', tam_tarama: false },
        { baslik: 'Tarama', kaynak: 'ekran', sayfa: 'egt-liste', tam_tarama: true },
      ]),
      catalog,
      [],
    ).items
    expect(pageWork(items, 'egt-liste')).toEqual({
      scan: true,
      tasks: [
        {
          baslik: 'Teyit',
          amac: 'Teyit amacı Önce ilgili tanımı platform_oku ile oku, sonra ekranda teyit et.',
        },
      ],
    })
    expect(pageWork(scanStrategy(['egt-form']).items, 'egt-form')).toEqual({ scan: true, tasks: [] })
  })

  it('göz arayüz işinde açık: tam taramada ya da arayüz/karışık istekte; kural/akış teyidinde kapalı', () => {
    expect(inspectsScreens('akis', false)).toBe(false)
    expect(inspectsScreens('kural', false)).toBe(false)
    expect(inspectsScreens('akis', true)).toBe(true)
    expect(inspectsScreens('arayuz', false)).toBe(true)
    expect(inspectsScreens('karisik', false)).toBe(true)
  })
})
