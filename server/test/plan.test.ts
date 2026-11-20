import type { RunStrategy } from '@argus/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { STRATEGY_MARKER } from '../src/agent/strategist.ts'
import { getPlan, getRun, listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness } from './support/harness.ts'

/**
 * Plan adımı: Yeni koşu önce planını yazar ve tarayıcı açmadan taslakta durur. İnsan planı elle düzenler ya da
 * Argus'a düzenletir (önceki taslak ve istek planlayıcıya gider); onaylayınca koşu kayıtlı planla başlar, planlayıcı
 * yeniden çağrılmaz.
 */
const app = { project: 'qm', application: 'web' }
let revisions = 0
const plani = (extra: string) => ({
  name: 'plani_yaz',
  input: {
    tur: 'arayuz',
    anlasilan: 'Eğitim listesi',
    senaryolar: ['Liste toplamı satırlarla tutmalı'],
    bitti_olcutu: 'Liste baştan sona denendi.',
    bilinenler: [],
    yapilamayan: [],
    kalemler: [
      { baslik: `Liste toplamı${extra}`, amac: 'Toplamı satırlarla karşılaştır', kaynak: 'ekran', sayfa: 'egt-liste', tam_tarama: false },
    ],
  },
})

let h: Harness
beforeAll(async () => {
  h = await startHarness({
    strategy: (prompt) => {
      if (prompt.includes('KULLANICININ DÜZENLEME İSTEĞİ')) revisions += 1
      return plani(prompt.includes('KULLANICININ DÜZENLEME İSTEĞİ: Arama kutusunu da dene') ? ' ve arama' : '')
    },
    plan: () => ({ ozet: 'Liste', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
    task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bakıldı.', eksik: '' } }),
  })
})
afterAll(() => h?.close())

const planned = async (runId: string) => {
  for (let i = 0; i < 200; i += 1) {
    if (getRun(h.ctx.db, runId)!.planState === 'taslak') return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('plan hazırlanmadı')
}
const strategyCalls = () =>
  h.calls.filter((c) => JSON.stringify(c.messages).includes(STRATEGY_MARKER)).length

describe('plan adımı', () => {
  it('taslakta durur; düzenleme isteği planlayıcıya gider; onaylanınca kayıtlı planla koşar', async () => {
    const run = h.ctx.runs.create({
      ...app,
      environment: 'development',
      pages: [],
      options: { maxTasks: 1, maxSteps: 3, brief: 'Eğitim listesini test et', reviewPlan: true },
    })
    expect(run.planState).toBe('hazirlaniyor')
    // Plan sayfası canlı akıştan güncellenir: taslak olunca "koşu güncellendi" bildirimi gider (yenilemeden görünsün).
    const announced: string[] = []
    const unsubscribe = h.ctx.bus.subscribe((m) => {
      if (m.type === 'kosu-guncellendi' && m.run.id === run.id && m.run.planState) announced.push(m.run.planState)
    })
    await planned(run.id)
    await new Promise((r) => setTimeout(r, 50))
    unsubscribe()
    expect(announced.at(-1)).toBe('taslak')
    // Taslakta koşu sırada bekler, tarayıcı açılmaz, bitmez.
    expect(getRun(h.ctx.db, run.id)!.status).toBe('sirada')
    expect(getPlan(h.ctx.db, run.id).plan!.items.map((i) => i.title)).toEqual(['Liste toplamı'])
    expect(getPlan(h.ctx.db, run.id).base!.items.map((i) => i.title)).toEqual(['Liste toplamı'])
    expect(getPlan(h.ctx.db, run.id).previous).toBeNull()

    // Elle düzenleme Argus'un yazdığı hâli değiştirmez; düzenletmede bırakılır, planlayıcıya Argus'un hâli gider.
    const first = getPlan(h.ctx.db, run.id).plan!
    h.ctx.runs.updatePlan(run.id, { ...first, items: first.items.map((i) => ({ ...i, title: 'Elle değiştirilen' })) })
    expect(getPlan(h.ctx.db, run.id).plan!.items.map((i) => i.title)).toEqual(['Elle değiştirilen'])
    expect(getPlan(h.ctx.db, run.id).base!.items.map((i) => i.title)).toEqual(['Liste toplamı'])
    h.ctx.runs.revisePlan(run.id, 'Arama kutusunu da dene')
    expect(getPlan(h.ctx.db, run.id).plan!.items.map((i) => i.title)).toEqual(['Liste toplamı'])
    expect(getPlan(h.ctx.db, run.id).previous!.items.map((i) => i.title)).toEqual(['Liste toplamı'])
    // Plan hazırlığında "İsteğin" son düzenleme isteğini gösterir; plan yeniden taslak olunca istek düşer.
    expect(getRun(h.ctx.db, run.id)!.planRequest).toBe('Arama kutusunu da dene')
    await new Promise((r) => setTimeout(r, 50))
    await planned(run.id)
    expect(getRun(h.ctx.db, run.id)!.planRequest).toBeNull()
    expect(revisions).toBe(1)
    const draft = getPlan(h.ctx.db, run.id).plan as RunStrategy
    expect(draft.items.map((i) => i.title)).toEqual(['Liste toplamı ve arama'])
    expect(getPlan(h.ctx.db, run.id).base!.items.map((i) => i.title)).toEqual(['Liste toplamı ve arama'])
    expect(getPlan(h.ctx.db, run.id).previous!.items.map((i) => i.title)).toEqual(['Liste toplamı'])
    const revisionCalls = h.calls.map((c) => JSON.stringify(c.messages)).filter((m) => m.includes('KULLANICININ DÜZENLEME İSTEĞİ'))
    expect(revisionCalls.length).toBeGreaterThan(0)
    expect(revisionCalls.some((m) => m.includes('Elle değiştirilen'))).toBe(false)

    // Elle düzenlenip onaylanan plan koşar; planlayıcı yeniden çağrılmaz.
    const before = strategyCalls()
    // İşareti kaldırılan vaka koşmaz.
    const edited = {
      ...draft,
      items: [
        ...draft.items.map((i) => ({ ...i, title: 'Elle düzeltilmiş vaka' })),
        { ...draft.items[0]!, title: 'Koşudan çıkarılan vaka', excluded: true },
      ],
    }
    h.ctx.runs.approvePlan(run.id, edited)
    const done = await h.waitFor(run.id)
    expect(done.status).toBe('bitti')
    expect(done.planState).toBe('onaylandi')
    expect(strategyCalls()).toBe(before)
    const strategy = listEvents(h.ctx.db, run.id).flatMap((e) => (e.type === 'strateji' ? [e.strategy] : []))[0]
    expect(strategy?.items.map((i) => i.title)).toEqual(['Elle düzeltilmiş vaka'])
  }, 60_000)

  it('taslak dışındayken düzenlenemez ve onaylanamaz; boş plan onaylanmaz', async () => {
    const run = h.ctx.runs.create({
      ...app,
      environment: 'development',
      pages: [],
      options: { maxTasks: 1, maxSteps: 3, brief: 'Eğitim listesini test et', reviewPlan: true },
    })
    expect(() => h.ctx.runs.approvePlan(run.id)).toThrow(/planı yazıyor/)
    await planned(run.id)
    const draft = getPlan(h.ctx.db, run.id).plan!
    expect(() => h.ctx.runs.approvePlan(run.id, { ...draft, items: [] })).toThrow('Planda en az bir vaka olmalı.')
    const allExcluded = { ...draft, items: draft.items.map((i) => ({ ...i, excluded: true })) }
    expect(() => h.ctx.runs.approvePlan(run.id, allExcluded)).toThrow('Planda en az bir vaka olmalı.')
    h.ctx.runs.stop(run.id)
    expect(getRun(h.ctx.db, run.id)!.status).toBe('durduruldu')
  }, 60_000)
})
