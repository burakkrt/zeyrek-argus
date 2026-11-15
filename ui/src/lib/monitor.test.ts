import { DEFINITION_PAGE, type RunEvent, type RunEventBody } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import {
  actionOf,
  COVERAGE_STATUS,
  buildFlowSections,
  rulerTicks,
  buildClock,
  buildLanes,
  findingIndexAt,
  stackLabels,
  buildMonitor,
  formatClock,
  frameIndexAt,
  pageLabel,
  prettyJson,
  pointerAt,
  scenarioSteps,
  stepIndexAt,
  TRAVEL_MS,
  zoomAt,
} from './monitor'

let seq = 0
let clock = Date.parse('2026-11-14T10:00:00Z')
const ev = (page: string | null, body: RunEventBody): RunEvent =>
  ({ ...body, runId: 'r', seq: ++seq, at: new Date((clock += 1_000)).toISOString(), page }) as RunEvent

const step = (page: string, outcome: string, extra: Partial<Extract<RunEventBody, { type: 'adim' }>> = {}) =>
  ev(page, {
    type: 'adim',
    tool: 'tikla',
    reason: 'Bakmak için',
    outcome,
    shot: `adim/${seq}.jpg`,
    target: null,
    ...extra,
  })

const finding = (page: string, key: string, outcome: 'yeni' | 'bastirildi' = 'yeni') =>
  ev(page, {
    type: 'bulgu',
    issueId: key,
    occurrenceId: key,
    key,
    title: key,
    kind: 'kesin',
    outcome,
    reason: null,
    shot: null,
  })

describe('monitör modeli', () => {
  it('plan ağacını kurar: sayfa ve görev durumları, adımın görevi ve işlem anı', () => {
    const model = buildMonitor([
      ev(null, { type: 'kosu-basladi', pages: ['liste', 'karne'] }),
      ev('liste', { type: 'sayfa-basladi', url: 'u' }),
      ev('liste', {
        type: 'plan',
        summary: 's',
        tasks: [
          { title: 'Açılış', goal: 'g' },
          { title: 'Filtreler', goal: 'g' },
        ],
      }),
      ev('liste', { type: 'gorev-basladi', index: 0, title: 'Açılış' }),
      step('liste', 'Tıklandı: "Ara"', { actAt: 42 }),
      ev('liste', { type: 'gorev-bitti', index: 0, summary: 'ok' }),
      ev('liste', { type: 'gorev-basladi', index: 1, title: 'Filtreler' }),
      step('liste', 'Tıklandı: "Dönem"'),
    ])
    expect(model.pages.map((p) => [p.page, p.status])).toEqual([
      ['liste', 'suruyor'],
      ['karne', 'bekliyor'],
    ])
    expect(model.pages[0]!.tasks.map((t) => [t.title, t.status])).toEqual([
      ['Açılış', 'bitti'],
      ['Filtreler', 'suruyor'],
    ])
    expect(model.steps.map((s) => [s.outcome, s.task])).toEqual([
      ['Tıklandı: "Ara"', 0],
      ['Tıklandı: "Dönem"', 1],
    ])
    // İşlem anı varsa o, yoksa (eski koşu) olayın anı.
    expect(model.steps[0]!.at).toBe(42)
    expect(model.steps[1]!.at).toBe(clock)
  })

  it('okunur akış: görev başlıkları, adımlar, özetler ve bulgular sırasıyla; yargıç notu bulgunun ayrıntısına girer', () => {
    const model = buildMonitor([
      ev('liste', { type: 'sayfa-basladi', url: 'u' }),
      ev('liste', { type: 'plan', summary: 'Liste ekranı', tasks: [{ title: 'T', goal: 'g' }] }),
      ev('liste', { type: 'gorev-basladi', index: 0, title: 'T' }),
      step('liste', 'Tıklandı: "Vazgeç"', { dialog: 'Kaydedilmemiş değişiklikler var' }),
      ev('liste', { type: 'ag', requests: [] }),
      ev(null, { type: 'bilgi', message: 'Yargıç: kabul — düğme tepkisiz' }),
      finding('liste', 'vazgec'),
      finding('liste', 'bastirilan', 'bastirildi'),
      ev('liste', { type: 'gorev-bitti', index: 0, summary: 'Bitti.' }),
      ev('liste', { type: 'sayfa-bitti', summary: 's' }),
    ])
    expect(model.flow.map((r) => r.kind)).toEqual(['sayfa', 'not', 'gorev', 'adim', 'ag', 'bulgu', 'not'])
    expect(model.flow[0]).toMatchObject({ status: 'bitti' })
    expect(model.flow[2]).toMatchObject({ status: 'bitti' })
    expect(model.findings.map((f) => [f.event.key, f.judge])).toEqual([['vazgec', 'kabul — düğme tepkisiz']])
    expect(model.steps[0]!.dialog).toBe('Kaydedilmemiş değişiklikler var')
  })

  it('strateji ve cevap modele girer; tanım kalemlerinin satırı adlandırılır, platform okuması eylem olur', () => {
    const strategy = {
      kind: 'akis' as const,
      understood: 'Kalibrasyon atlanabilir mi',
      scenarios: [],
      doneWhen: 'Senaryo test edilir',
      known: [],
      infeasible: [],
      items: [],
    }
    const coverage = {
      status: 'kismen' as const,
      summary: 'Tanımdan test edildi.',
      tested: ['Kalibrasyonsuz ilerleme'],
      untested: ['Aşama ilerletme — veri yazar'],
    }
    const model = buildMonitor([
      ev(null, { type: 'strateji', strategy }),
      ev(DEFINITION_PAGE, { type: 'sayfa-basladi', url: '' }),
      step(DEFINITION_PAGE, 'Platformdan okundu: workflow_get', {
        tool: 'platform_oku',
        shot: null,
        platform: { tool: 'workflow_get', input: '{"id":"w1"}', result: '{"a":1}' },
      }),
      step(DEFINITION_PAGE, 'Platforma yazıldı: row_create', {
        tool: 'platform_yaz',
        shot: null,
        platform: {
          tool: 'row_create',
          input: '{"entityId":"e1"}',
          result: '{"data":{"id":7}}',
          write: true,
        },
      }),
      ev(null, { type: 'kapsam', coverage }),
    ])
    expect(model.strategy).toEqual(strategy)
    expect(model.coverage).toEqual(coverage)
    expect(
      model.flow.some((r) => r.kind === 'not' && r.text === 'Test planı · Kalibrasyon atlanabilir mi'),
    ).toBe(true)
    expect(COVERAGE_STATUS[coverage.status]).toEqual({ label: 'Kısmen', tone: 'warning' })
    expect(pageLabel(DEFINITION_PAGE)).toBe('Platform tanımları')
    expect(pageLabel('egt-liste')).toBe('egt-liste')
    expect(actionOf(model.steps[0]!)).toEqual({
      kind: 'platform',
      verb: 'Tanımı okudu',
      object: 'workflow_get',
    })
    // Platforma yazma da eylemdir; sahnede yazma olarak görünür.
    expect(actionOf(model.steps[1]!)).toEqual({
      kind: 'platform',
      verb: 'Platforma yazdı',
      object: 'row_create',
    })
    expect(model.steps[1]!.platform?.write).toBe(true)
    // Platform okuması sahnede gösterilmek üzere adıma girer; sonuç okunur biçimde (kesikse olduğu gibi).
    expect(model.steps[0]!.platform).toEqual({
      tool: 'workflow_get',
      input: '{"id":"w1"}',
      result: '{"a":1}',
    })
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(prettyJson('{"kesik":')).toBe('{"kesik":')
  })

  it('sayfa bitince süren görev de biter', () => {
    const model = buildMonitor([
      ev('liste', { type: 'plan', summary: 's', tasks: [{ title: 'T', goal: 'g' }] }),
      ev('liste', { type: 'gorev-basladi', index: 0, title: 'T' }),
      ev('liste', { type: 'sayfa-bitti', summary: 'bitti' }),
    ])
    expect(model.pages[0]).toMatchObject({ status: 'bitti', tasks: [{ status: 'bitti' }] })
  })
})

describe('oynatma saati', () => {
  it('uzun durgunluğu sıkıştırır, kısa aralığı olduğu gibi bırakır; iki yön birbirinin tersi', () => {
    const c = buildClock([1_000, 1_400, 11_400, 12_000], 1_500)
    expect(c.duration).toBe(400 + 1_500 + 600)
    expect(c.toPlay(1_400)).toBe(400)
    // 10 sn'lik boşluğun ortası, sıkıştırılmış 1,5 sn'nin ortasına düşer.
    expect(c.toPlay(6_400)).toBe(400 + 750)
    expect(c.toWall(400 + 750)).toBe(6_400)
    expect(c.toWall(c.toPlay(11_700))).toBeCloseTo(11_700)
    expect(c.toPlay(0)).toBe(0)
    expect(c.toWall(99_999)).toBe(12_000)
    // Kısaltılan tek bekleme, kısaltılmış aralığın ortasında işaretlenir.
    expect(c.gaps).toEqual([400 + 750])
  })

  it('o anki kare: önceki son kare; ilk kareden önce ilk kare; kare yoksa -1', () => {
    expect(frameIndexAt([100, 200, 300], 250)).toBe(1)
    expect(frameIndexAt([100, 200, 300], 300)).toBe(2)
    expect(frameIndexAt([100, 200, 300], 50)).toBe(0)
    expect(frameIndexAt([], 50)).toBe(-1)
  })

  it('anlatılan adım, imleç yola çıkınca değişir', () => {
    const steps = [{ at: 1_000 }, { at: 3_000 }]
    expect(stepIndexAt(steps, 0)).toBe(-1)
    expect(stepIndexAt(steps, 1_000 - TRAVEL_MS)).toBe(0)
    expect(stepIndexAt(steps, 3_000 - TRAVEL_MS - 1)).toBe(0)
    expect(stepIndexAt(steps, 3_000 - TRAVEL_MS)).toBe(1)
  })
})

describe('imleç', () => {
  const a = { at: 10_000, tool: 'tikla', target: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }
  const b = { at: 20_000, tool: 'tikla', target: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } }

  it('önceki hedeften sıradakine gider ve işlem anında varır; tıklamada halka çıkar', () => {
    const start = pointerAt([a, b], b.at - TRAVEL_MS)!
    expect(start.x).toBeCloseTo(0.15)
    expect(start.y).toBeCloseTo(0.15)
    const middle = pointerAt([a, b], b.at - TRAVEL_MS / 2)!
    expect(middle.x).toBeCloseTo(0.35)
    const arrived = pointerAt([a, b], b.at)!
    expect(arrived.x).toBeCloseTo(0.55)
    expect(arrived.y).toBeCloseTo(0.55)
    expect(arrived.ripple).toBe(0)
    expect(arrived.box).toEqual({ x: 0.5, y: 0.5, width: expect.closeTo(0.1), height: expect.closeTo(0.1) })
    expect(pointerAt([a, b], b.at + 1_000)!.ripple).toBeNull()
  })

  it('ilk hedeften önce imleç yok; uzun süre işlem olmazsa solar', () => {
    expect(pointerAt([a], a.at - TRAVEL_MS - 1)).toBeNull()
    expect(pointerAt([a], a.at + 1_000)!.opacity).toBe(1)
    expect(pointerAt([a], a.at + 10_000)!.opacity).toBe(0)
  })

  it('sayfayı kaplayan kapsayıcı çerçevelenmez; ekran dışına taşan hedef görünür kısma kırpılır', () => {
    const container = { at: 1_000, tool: 'tikla', target: { x: 0.07, y: -0.55, width: 0.61, height: 1.64 } }
    const state = pointerAt([container], 1_000)!
    expect(state.box).toBeNull()
    expect(state.y).toBeCloseTo(0.5)
    const edge = { at: 1_000, tool: 'tikla', target: { x: 0.9, y: 0.9, width: 0.2, height: 0.2 } }
    expect(pointerAt([edge], 1_000)!.box).toEqual({
      x: 0.9,
      y: 0.9,
      width: expect.closeTo(0.1),
      height: expect.closeTo(0.1),
    })
  })
})

describe('otomatik yakınlaştırma', () => {
  const a = { at: 10_000, tool: 'tikla', target: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 } }
  const b = { at: 11_500, tool: 'tikla', target: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } }
  const far = { at: 30_000, tool: 'tikla', target: { x: 0.5, y: 0.5, width: 0.1, height: 0.1 } }

  it('işlemden önce imlecin olduğu yere yaklaşır, işlemden sonra geri açılır', () => {
    const at = (wall: number) => zoomAt([a, far], wall, pointerAt([a, far], wall))
    expect(at(a.at - TRAVEL_MS - 300).scale).toBe(1)
    expect(at(a.at).scale).toBe(1.6)
    expect(at(a.at)).toMatchObject({ x: expect.closeTo(0.15), y: expect.closeTo(0.15) })
    expect(at(a.at + 5_000).scale).toBe(1)
  })

  it('art arda işlemlerde yakın kalır ve imleçle kayar; sayfayı kaplayan hedefte yaklaşmaz', () => {
    const between = (a.at + b.at) / 2
    expect(zoomAt([a, b], between, pointerAt([a, b], between)).scale).toBe(1.6)
    const container = { at: 1_000, tool: 'tikla', target: { x: 0, y: 0, width: 1, height: 0.9 } }
    expect(zoomAt([container], 1_000, pointerAt([container], 1_000)).scale).toBe(1)
  })
})

describe('eylem cümlesi', () => {
  it('sunucunun sonuç metninden fiil ve nesne; pencere notu atılır', () => {
    expect(actionOf({ tool: 'tikla', outcome: 'Tıklandı: "Vazgeç" — Tarayıcı penceresi açıldı' })).toEqual({
      kind: 'tikla',
      verb: 'Tıkladı',
      object: '“Vazgeç”',
    })
    expect(actionOf({ tool: 'tikla', outcome: 'Salt okuma: "Sil" basılmadı.' }).verb).toBe(
      'Basmadı (yazma işi)',
    )
    expect(actionOf({ tool: 'yaz', outcome: 'Yazıldı: ""' })).toMatchObject({
      verb: 'Alanı boşalttı',
      object: '',
    })
    expect(actionOf({ tool: 'tus', outcome: 'Tuş: Tab' }).object).toBe('Tab')
    expect(actionOf({ tool: 'kaydir', outcome: 'Yukarı kaydırıldı' }).object).toBe('yukarı')
  })

  it('ekrana bakış ikiye ayrılır: ağacı okudu ya da görüntüyle inceledi', () => {
    expect(actionOf({ tool: 'ekrana_bak', outcome: 'Ekrana bakıldı' })).toMatchObject({
      kind: 'okudu',
      verb: 'Sayfayı okudu',
    })
    expect(actionOf({ tool: 'ekrana_bak', outcome: 'Ekrana bakıldı (görüntüyle)' }).kind).toBe('goruntu')
  })
})

describe('şeritler', () => {
  it('görev sonraki göreve, son görev sayfanın sonuna kadar; sayfa sonraki sayfaya ya da kaydın sonuna kadar', () => {
    clock = Date.parse('2026-11-14T11:00:00Z')
    const model = buildMonitor([
      ev('a', { type: 'sayfa-basladi', url: 'u' }),
      ev('a', {
        type: 'plan',
        summary: 's',
        tasks: [
          { title: 'T1', goal: 'g' },
          { title: 'T2', goal: 'g' },
        ],
      }),
      ev('a', { type: 'gorev-basladi', index: 0, title: 'T1' }),
      step('a', 'Tıklandı: "X"'),
      ev('a', { type: 'gorev-basladi', index: 1, title: 'T2' }),
      ev('a', { type: 'sayfa-bitti', summary: 's' }),
      ev('b', { type: 'sayfa-basladi', url: 'u' }),
      finding('b', 'k'),
    ])
    const c = buildClock(
      model.flow.map((r) => r.at),
      60_000,
    )
    const lanes = buildLanes(model, c, model.end!)
    expect(lanes.pages.map((p) => [p.page, p.start, p.end])).toEqual([
      ['a', 0, 6_000],
      ['b', 6_000, 7_000],
    ])
    expect(lanes.tasks.map((t) => [t.title, t.start, t.end])).toEqual([
      ['T1', 2_000, 4_000],
      ['T2', 4_000, 6_000],
    ])
    expect(lanes.steps).toEqual([{ index: 0, pos: 3_000, kind: 'tikla', dialog: false }])
    expect(lanes.findings.map((f) => f.pos)).toEqual([7_000])
  })

  it('bulgu gezgini o ana kadar görülen son bulguyu sayar', () => {
    expect(findingIndexAt([{ at: 10 }, { at: 20 }], 5)).toBe(-1)
    expect(findingIndexAt([{ at: 10 }, { at: 20 }], 20)).toBe(1)
  })
})

describe('bulgu etiketleri', () => {
  it('çakışan etiket alt satıra iner, kısaltılmaz; ayrık etiketler aynı satırda kalır', () => {
    const slots = stackLabels([
      { pos: 6, width: 30 },
      { pos: 16, width: 35 },
      { pos: 60, width: 20 },
    ])
    expect(slots.map((s) => [s.row, s.left, s.width])).toEqual([
      [0, 6, 30],
      [1, 16, 35],
      [0, 60, 20],
    ])
  })

  it('sağ kenara taşan etiket sola kayar; satırlar dolunca etiket kısalır ama hiç binmez', () => {
    expect(stackLabels([{ pos: 95, width: 20 }])[0]).toMatchObject({ row: 0, left: 80, width: 20 })
    const slots = stackLabels(
      [10, 11, 12, 13].map((pos) => ({ pos, width: 30 })),
      3,
    )
    expect(slots.map((s) => s.row)).toEqual([0, 1, 2, 0])
    expect(slots[3]!.left).toBeGreaterThanOrEqual(slots[0]!.left + slots[0]!.width)
  })
})

describe('cetvel', () => {
  it('etiket aralığı süreye ve genişliğe göre yuvarlak bir süre; aralarda küçük çentik', () => {
    // 1:46'lık kayıt, 1000 px: 10 sn aralık, 2 sn küçük çentik.
    const t = rulerTicks(106_000, 1_000)
    expect(t.major.slice(0, 3)).toEqual([0, 10_000, 20_000])
    expect(t.major.at(-1)).toBe(100_000)
    expect(t.minor.slice(0, 4)).toEqual([2_000, 4_000, 6_000, 8_000])
    // Dar alanda aralık büyür; kısa kayıtta küçülür.
    expect(rulerTicks(106_000, 400).major[1]).toBe(30_000)
    expect(rulerTicks(8_000, 1_000).major[1]).toBe(1_000)
  })
})

describe('akış bölümleri', () => {
  it('sayfa › görev › adım; ağ isteği adımın sayacına, plan ve özet başlıklara girer; sayfa öncesi notlar akışa girmez', () => {
    const model = buildMonitor([
      ev(null, { type: 'bilgi', message: 'Saklanan oturum sürdürüldü.' }),
      ev('liste', { type: 'sayfa-basladi', url: 'u' }),
      finding('liste', 'acilis'),
      ev('liste', { type: 'plan', summary: 'Liste ekranı.', tasks: [{ title: 'Filtre', goal: 'g' }] }),
      ev('liste', { type: 'gorev-basladi', index: 0, title: 'Filtre' }),
      step('liste', 'Yazıldı: "PLN"'),
      ev('liste', {
        type: 'ag',
        requests: [
          { method: 'POST', url: 'http://x/a', status: 200, ms: 5 },
          { method: 'POST', url: 'http://x/b', status: 0, ms: 0, blocked: true },
        ],
      }),
      finding('liste', 'filtre'),
      ev(null, { type: 'hata', message: 'Model yanıt vermedi.' }),
      ev('liste', { type: 'gorev-bitti', index: 0, summary: 'Filtre denendi.' }),
    ])
    const flow = buildFlowSections(model)
    expect(flow.pages).toHaveLength(1)
    const [page] = flow.pages
    expect(page).toMatchObject({ page: 'liste', plan: 'Liste ekranı.' })
    expect(page!.opening.map((e) => e.kind)).toEqual(['bulgu'])
    const [task] = page!.tasks
    expect(task).toMatchObject({
      title: 'Filtre',
      summary: 'Filtre denendi.',
      steps: 1,
      findings: 1,
      status: 'bitti',
    })
    expect(task!.entries.map((e) => e.kind)).toEqual(['adim', 'bulgu', 'hata'])
    expect(task!.entries[0]).toMatchObject({ requests: 2, blocked: 1 })
  })
})

describe('biçim', () => {
  it('bulgu senaryosu numaralı adımlara bölünür', () => {
    expect(scenarioSteps("1. Sayfayı aç. 2. Vazgeç'e bas.")).toEqual(['Sayfayı aç.', "Vazgeç'e bas."])
    expect(scenarioSteps("Formu doldur, Vazgeç'e bas.")).toEqual(["Formu doldur, Vazgeç'e bas."])
  })

  it('süre dakika:saniye', () => {
    expect(formatClock(65_400)).toBe('1:05')
    expect(formatClock(-5)).toBe('0:00')
  })
})
