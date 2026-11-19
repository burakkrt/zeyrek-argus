import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness } from './support/harness.ts'

/**
 * Durdurma: kullanıcı "Durdur"a basınca koşu, o an süren model çağrısının bitmesini beklemeden durur (planlayıcının uzun
 * çağrısı dakikalar sürebilir). Koşu "durduruldu" biter, hata olarak yazılmaz.
 */
let calls = 0
let h: Harness
beforeAll(async () => {
  h = await startHarness({
    plan: () => ({ ozet: 'Liste', gorevler: [] }),
    task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bitti.', eksik: '' } }),
    // Planlayıcının çağrısı hiç bitmez: yalnız durdurma koşuyu bitirebilir.
    hold: () => {
      calls += 1
      return new Promise<void>(() => undefined)
    },
  })
})
afterAll(() => h?.close())

describe('durdurma', () => {
  it('süren model çağrısı beklenmeden koşu durur; hata yazılmaz', async () => {
    const run = h.ctx.runs.create({
      project: 'qm',
      application: 'web',
      environment: 'development',
      pages: [],
      options: { maxTasks: 1, maxSteps: 3, brief: 'Dönem akışını test et' },
    })
    for (let i = 0; i < 100 && !calls; i += 1) await new Promise((r) => setTimeout(r, 50))
    expect(calls).toBeGreaterThan(0)
    h.ctx.runs.stop(run.id)
    const done = await Promise.race([
      h.waitFor(run.id),
      new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
    ])
    expect(done?.status).toBe('durduruldu')
    expect(listEvents(h.ctx.db, run.id).some((e) => e.type === 'hata')).toBe(false)
  }, 20_000)
})
