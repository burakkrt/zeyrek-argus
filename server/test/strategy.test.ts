import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFINITION_PAGE, type RunStrategy } from '@argus/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getRun, listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness, type Move, type Script } from './support/harness.ts'
import { overrides } from './support/site.ts'

/**
 * Anla adımı (girdili koşu): güçlü model tanımları okuyarak stratejiyi yazar; tanım kalemleri tarayıcısız, platform
 * okumasıyla cevaplanır ve sonuçları ekran kalemlerine geçer; ekran kalemleri seçilen sayfada birer görevdir. Yalnız
 * tanım kalemi olan koşu tarayıcı açmadan biter. Strateji yazılamazsa koşu nedenini söyleyerek durur; ne sayfa ne
 * girdi varsa koşu açılmaz.
 */
const app = { project: 'qm', application: 'web' }
const read = (girdi: string): Move => ({
  name: 'platform_oku',
  input: { arac: 'workflow_get', girdi, neden: 'Kalibrasyon kuralı' },
})
const item = (baslik: string, kaynak: string, sayfa: string) => ({
  baslik,
  amac: `${baslik} amacı`,
  kaynak,
  sayfa,
  tam_tarama: false,
})
let plan: (turn: number) => Move = () => ({ name: 'plani_yaz', input: {} })
const answered = () => ({
  durum: 'cevaplandi',
  cevap: 'Kalibrasyon kapalıysa dönem Sonuç yayınına geçer.',
  kanitlar: ['workflow_get donem, steps[0].onFalse'],
  eksik: '',
  ek_kalemler: [],
})
let verdict: (prompt: string) => unknown = answered
const script: Script = {
  strategy: (_, turn) => plan(turn),
  supervise: (prompt) => verdict(prompt),
  define: (_, turn) =>
    turn % 2 === 1
      ? read('{"workflowId":"donem"}')
      : {
          name: 'kalemi_bitir',
          input: {
            ozet: 'Kalibrasyon kapalıysa Sonuç yayınına geçilir.',
            kanitlar: ['Kalibrasyon atlanır — workflow_get donem, steps[0].onFalse'],
            eksik: '',
          },
        },
  plan: () => ({ ozet: 'Liste', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
  task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Ekranda teyit edildi.', eksik: '' } }),
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
})
afterAll(async () => {
  await h.close()
})
beforeEach(() => {
  verdict = answered
})

const start = (brief: string | null) =>
  h.ctx.runs.create({
    ...app,
    environment: 'development',
    pages: [],
    options: { maxTasks: 1, maxSteps: 3, brief },
  })
const strategyOf = (runId: string) =>
  listEvents(h.ctx.db, runId).flatMap((e) => (e.type === 'strateji' ? [e.strategy] : []))[0] as RunStrategy
const plani = (kalemler: ReturnType<typeof item>[]) => ({
  name: 'plani_yaz',
  input: {
    tur: 'akis',
    anlasilan: 'Kalibrasyon kapalıyken dönem ilerler mi',
    sorular: ['Kalibrasyon açılmadan ilerlenebilir mi?'],
    basari: 'Soru kanıtla cevaplanır.',
    bilinenler: ['Kalibrasyon koşullu — workflow_get donem'],
    yapilamayan: ['Dönemi ilerletmek yazma ister.'],
    kalemler,
  },
})

describe('anla adımı', () => {
  it('tanımı okuyup strateji yazar; tanım kalemi tarayıcısız cevaplanır, sonucu ekran kalemine geçer', async () => {
    plan = (turn) =>
      turn === 1
        ? read('{"workflowId":"donem"}')
        : plani([
            item('Kalibrasyon kuralı', 'tanim', ''),
            item('Dönem ekranında teyit', 'ikisi', 'egt-temiz'),
            item('Olmayan sayfa', 'ekran', 'olmayan-sayfa'),
          ])
    const before = h.calls.length
    const done = await h.waitFor(start('Kalibrasyon açılmazsa dönem ilerler mi?').id)
    expect(done.status).toBe('bitti')
    // Sayfalar stratejinin ekran kalemlerinden: katalog dışı sayfa tanım kalemine döndü.
    expect(getRun(h.ctx.db, done.id)!.pages).toEqual(['egt-temiz'])
    expect(strategyOf(done.id).items.map((i) => [i.title, i.source, i.page])).toEqual([
      ['Kalibrasyon kuralı', 'tanim', null],
      ['Dönem ekranında teyit', 'ikisi', 'egt-temiz'],
      ['Olmayan sayfa', 'tanim', null],
    ])
    const events = listEvents(h.ctx.db, done.id)
    const definition = events.filter((e) => e.page === DEFINITION_PAGE)
    expect(definition.filter((e) => e.type === 'gorev-bitti')).toHaveLength(2)
    expect(
      definition.some((e) => e.type === 'adim' && e.outcome === 'Platformdan okundu: workflow_get'),
    ).toBe(true)
    // Ekran kalemi tek görev oldu (sayfa planı çağrılmadı); tanım sonuçları ve "önce tanım" yönergesi isteminde.
    const calls = h.calls.slice(before).map((c) => JSON.stringify(c.messages))
    expect(calls.some((c) => c.includes('Bu sayfayı eksiksiz test etmek için'))).toBe(false)
    const explorer = calls.find((c) => c.includes('GÖREV: Dönem ekranında teyit'))!
    expect(explorer).toContain('Kalibrasyon kapalıysa Sonuç yayınına geçilir.')
    expect(explorer).toContain('Önce ilgili tanımı platform_oku ile oku')
    // Maliyet politikası: akış sorusunun teyit ekranında göz çalışmaz (gözün genel bulguları soruya katkı vermez).
    expect(calls.some((c) => c.includes('GÖZ GÖREVİ'))).toBe(false)
    expect(events.some((e) => e.type === 'bilgi' && e.message.startsWith('Göz bu sayfada kapalı'))).toBe(true)
    // Bütün model çağrıları rolüyle yerel izde; platform okumaları da.
    const trace = readFileSync(join(h.ctx.config.dataDir, 'runs', done.id, 'iz', 'iz.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { t: string; role: string | null })
    expect(trace.filter((l) => l.t === 'model').every((l) => l.role)).toBe(true)
    // Aynı okuma (strateji ve iki tanım kaleminde aynı girdi) platforma bir kez gider; sonrası okuyucunun belleğinden.
    expect(trace.filter((l) => l.t === 'mcp')).toHaveLength(1)
    expect(
      events.filter((e) => e.type === 'adim' && e.outcome === 'Platformdan okundu: workflow_get').length,
    ).toBeGreaterThanOrEqual(3)
    // Gözetmen tanım ve ekran sonuçlarını görüp isteğin cevabını yazdı; cevap koşunun kaydında ve akışta.
    const supervisor = calls.find((c) => c.includes('GÖZETMEN GÖREVİ'))!
    expect(supervisor).toContain('Tanım — Kalibrasyon kuralı: Kalibrasyon kapalıysa Sonuç yayınına geçilir.')
    expect(supervisor).toContain('Ekran — egt-temiz:')
    expect(supervisor).not.toContain('Bu son tur')
    expect(getRun(h.ctx.db, done.id)!.answer).toEqual({
      status: 'cevaplandi',
      answer: 'Kalibrasyon kapalıysa dönem Sonuç yayınına geçer.',
      evidence: ['workflow_get donem, steps[0].onFalse'],
      missing: '',
    })
    expect(events.some((e) => e.type === 'cevap')).toBe(true)
  })

  it('gözetmen cevabı eksik bulursa ek kalem ister; koşu onu yürütüp son turda cevabı yazar', async () => {
    plan = () => plani([item('Kalibrasyon kuralı', 'tanim', '')])
    const prompts: string[] = []
    verdict = (prompt) => {
      prompts.push(prompt)
      return prompts.length === 1
        ? {
            durum: 'kismen',
            cevap: 'Eksik.',
            kanitlar: [],
            eksik: 'Onay akışı',
            ek_kalemler: [item('Onay akışı', 'tanim', '')],
          }
        : {
            durum: 'kismen',
            cevap: 'Onay akışı okunamadı.',
            kanitlar: [],
            eksik: 'Onay akışı',
            ek_kalemler: [item('Bir tur daha', 'tanim', '')],
          }
    }
    const done = await h.waitFor(start('Kalibrasyon ve onay akışı nasıl işler?').id)
    expect(done.status).toBe('bitti')
    const events = listEvents(h.ctx.db, done.id)
    expect(events.filter((e) => e.type === 'gorev-bitti' && e.page === DEFINITION_PAGE)).toHaveLength(2)
    expect(
      events.some((e) => e.type === 'bilgi' && e.message.includes('1 ek kalem istedi: Onay akışı')),
    ).toBe(true)
    // İkinci tur son turdur: ek kalem istense de yürütülmez.
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('Bu son tur')
    expect(prompts[1]).toContain('Tanım — Onay akışı:')
    expect(getRun(h.ctx.db, done.id)!.answer).toMatchObject({
      status: 'kismen',
      answer: 'Onay akışı okunamadı.',
    })
  })

  it('kayıt sayfasındaki kalem, sayfanın yönlendirdiği listede ilgili kaydı açarak sürdürülür', async () => {
    overrides.set(
      'egt-sorunlu',
      `<!doctype html><html><body><h1>Kayıt</h1><script>location.replace('egt-liste')</script></body></html>`,
    )
    plan = () => plani([item('Dönem detayında aşama', 'ekran', 'egt-sorunlu')])
    const before = h.calls.length
    const done = await h.waitFor(start('Dönem detayında aşamayı kontrol et').id)
    overrides.delete('egt-sorunlu')
    expect(done.status).toBe('bitti')
    const events = listEvents(h.ctx.db, done.id)
    expect(
      events.some(
        (e) =>
          e.type === 'bilgi' &&
          e.message ===
            'egt-sorunlu bir kayıt sayfası; kalemleri egt-liste sayfasında ilgili kaydı açarak sürdürülüyor.',
      ),
    ).toBe(true)
    const explorer = h.calls
      .slice(before)
      .map((c) => JSON.stringify(c.messages))
      .find((c) => c.includes('GÖREV: Dönem detayında aşama'))!
    expect(explorer).toContain('Sayfa: egt-liste')
    expect(explorer).toContain('Hedef \\"egt-sorunlu\\" bir kayıt sayfası')
  })

  it('yalnız tanım kalemi olan koşu tarayıcı açmadan biter', async () => {
    plan = () => plani([item('Kalibrasyon kuralı', 'tanim', '')])
    const done = await h.waitFor(start('Kalibrasyon kuralı nedir?').id)
    expect(done.status).toBe('bitti')
    expect(done.pages).toEqual([])
    const events = listEvents(h.ctx.db, done.id)
    expect(events.some((e) => e.type === 'bilgi' && e.message.includes('girildi'))).toBe(false)
    expect(events.filter((e) => e.type === 'gorev-bitti' && e.page === DEFINITION_PAGE)).toHaveLength(1)
  })

  it('strateji yazılamazsa koşu nedenini söyleyerek durur', async () => {
    plan = () => ({ name: 'platform_arac', input: { arac: 'workflow_get', neden: 'Bak' } })
    const done = await h.waitFor(start('Muhasebe raporlarını test et').id)
    expect(done.status).toBe('hata')
    expect(done.error).toContain('stratejisi yazılamadı')
  })

  it('ne sayfa ne girdi varsa koşu açılmaz', () => {
    expect(() => start('  ')).toThrow('Sayfa seçin ya da girdi yazın.')
  })
})
