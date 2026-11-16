import { describe, expect, it } from 'vitest'
import { inspectsScreens, normalizeStrategy, pageWork, scanStrategy } from './strategist.ts'

const catalog = ['egt-liste', 'egt-form'].map((slug) => ({ id: slug, slug, name: slug }))
const raw = (
  kalemler: Array<{ baslik: string; kaynak: string; sayfa: string; tam_tarama: boolean }>,
  yontemler: string[] = [],
) => ({
  tur: 'bilinmeyen',
  anlasilan: 'A',
  senaryolar: [],
  bitti_olcutu: 'B',
  bilinenler: [],
  yapilamayan: [],
  yontemler,
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
      [],
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

  it('yöntemlerden yalnız var olanlar kalır; tam tarama arayüz yöntemini getirir; göz yalnız arayüz yönteminde açık', () => {
    const flow = normalizeStrategy(
      raw([{ baslik: 'Akış', kaynak: 'ikisi', sayfa: 'egt-liste', tam_tarama: false }], ['akis', 'uydurma']),
      catalog,
      [],
      ['genel', 'akis', 'arayuz'],
    )
    expect(flow.guides).toEqual(['akis'])
    expect(inspectsScreens(flow)).toBe(false)
    const scan = normalizeStrategy(
      raw([{ baslik: 'Tarama', kaynak: 'ekran', sayfa: 'egt-liste', tam_tarama: true }], ['akis']),
      catalog,
      [],
      ['genel', 'akis', 'arayuz'],
    )
    expect(scan.guides).toEqual(['akis', 'arayuz'])
    expect(inspectsScreens(scan)).toBe(true)
    expect(inspectsScreens(scanStrategy(['egt-form']))).toBe(true)
  })
})
