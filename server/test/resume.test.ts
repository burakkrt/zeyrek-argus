import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { STRATEGY_MARKER } from '../src/agent/strategist.ts'
import { DEFINITION_MARKER } from '../src/agent/investigator.ts'
import { getRun, listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness } from './support/harness.ts'

/**
 * Kaldığı yerden devam: durdurulan koşu aynı koşu olarak sürer. Biten vaka yeniden yürümez ve özeti sonraki vakalara
 * aynen gider; yarıda kalan vaka baştan, temiz bir konuşmayla yürür ve devam olduğunu "bilinenler"den öğrenir;
 * planlayıcı yeniden çağrılmaz; koşu bitince "bitti" olur.
 */
const item = (baslik: string) => ({
  baslik,
  amac: `${baslik} vakasını dene`,
  beklenen: '',
  dayanak: '',
  kaynak: 'tanim',
  sayfa: null,
  tam_tarama: false,
  bagimsiz: false,
})

let holdB = true
let heldB = false
let h: Harness
beforeAll(async () => {
  h = await startHarness({
    plan: () => ({ ozet: 'Liste', gorevler: [] }),
    task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bitti.', eksik: '' } }),
    strategy: () => ({
      name: 'plani_yaz',
      input: {
        tur: 'akis',
        anlasilan: 'Dönem akışı',
        senaryolar: ['Dönem açılır'],
        bitti_olcutu: 'Üç vaka yürütüldü.',
        bilinenler: [],
        yapilamayan: [],
        kalemler: [item('Vaka A'), item('Vaka B'), item('Vaka C')],
      },
    }),
    define: (conversation) => {
      const title = /TANIM KALEMİ: (Vaka [ABC])/.exec(conversation)?.[1] ?? '?'
      return { name: 'kalemi_bitir', input: { ozet: `${title} bitti, kayıt 7.`, kanitlar: [], eksik: '' } }
    },
    // B'nin ilk denemesi hiç bitmez: koşu o sırada durdurulur.
    hold: (prompt) => {
      if (!holdB || !prompt.includes(`${DEFINITION_MARKER}: Vaka B`)) return undefined
      heldB = true
      return new Promise<void>(() => undefined)
    },
  })
})
afterAll(() => h?.close())

const promptsFor = (title: string) =>
  h.calls
    .map((c) => JSON.stringify(c.messages))
    .filter((m) => m.includes(`${DEFINITION_MARKER}: ${title}`))

describe('kaldığı yerden devam', () => {
  it('biten vaka yeniden yürümez, yarıda kalan baştan yürür, planlayıcı yeniden çağrılmaz', async () => {
    const run = h.ctx.runs.create({
      project: 'qm',
      application: 'web',
      environment: 'development',
      pages: [],
      options: { maxTasks: 1, maxSteps: 3, brief: 'Dönem akışını test et' },
    })
    for (let i = 0; i < 200 && !heldB; i += 1) await new Promise((r) => setTimeout(r, 50))
    expect(heldB).toBe(true)
    h.ctx.runs.stop(run.id)
    expect((await h.waitFor(run.id)).status).toBe('durduruldu')
    expect(promptsFor('Vaka A')).toHaveLength(1)
    expect(() => h.ctx.runs.resume('yok')).toThrow('Koşu bulunamadı.')

    holdB = false
    // Geçen süre baştan sayılmaz: ilk başlangıç anı korunur.
    const firstStart = getRun(h.ctx.db, run.id)!.startedAt
    const strategyCalls = h.calls.filter((c) => JSON.stringify(c.messages).includes(STRATEGY_MARKER)).length
    expect(h.ctx.runs.resume(run.id).status).toBe('sirada')
    const done = await h.waitFor(run.id)
    expect(done.status).toBe('bitti')
    expect(done.id).toBe(run.id)

    expect(promptsFor('Vaka A')).toHaveLength(1)
    const b = promptsFor('Vaka B')
    expect(b).toHaveLength(2)
    // Yarıda kalan vaka yeni bir konuşmadır: devam olduğunu ve biten vakanın özetini "bilinenler"den okur.
    expect(b[1]).toContain('Devam: bu koşu durdurulup kaldığı yerden sürdürüldü')
    expect(b[1]).toContain('Vaka A: Vaka A bitti, kayıt 7.')
    expect(promptsFor('Vaka C')).toHaveLength(1)
    expect(h.calls.filter((c) => JSON.stringify(c.messages).includes(STRATEGY_MARKER))).toHaveLength(strategyCalls)

    const events = listEvents(h.ctx.db, run.id)
    expect(events.filter((e) => e.type === 'strateji')).toHaveLength(1)
    expect(events.some((e) => e.type === 'bilgi' && e.message.startsWith('Koşu kaldığı yerden sürüyor'))).toBe(true)
    expect(() => h.ctx.runs.resume(run.id)).toThrow('Yalnız durdurulan ya da yarıda kalan koşu devam ettirilebilir.')
    expect(firstStart).not.toBeNull()
    expect(done.startedAt).toBe(firstStart)
  }, 60_000)
})
