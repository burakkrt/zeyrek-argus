import { RUN_CEILINGS } from '@argus/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'

/**
 * Kalite öncelikli motorda adım sınırı kullanıcıya bırakılmaz; kaçağı korumalar durdurur. Gezgin aynı işlemi sonsuza
 * dek tekrarlasa da görev güvenlik tavanına (RUN_CEILINGS) varmadan, birkaç turda "ilerleme durdu" diye kapanır.
 */
const app = { project: 'qm', application: 'web' }
let mode: 'ayni' | 'gidip-gel' = 'ayni'
const script: Script = {
  plan: () => ({ ozet: 'Liste', gorevler: [{ baslik: 'Döngü', amac: 'Dene' }] }),
  // Hiç bitirmeyen gezgin: ya hep aynı işlem, ya da pencereyi açıp sayfayı baştan açarak iki durum arasında gidip gelme (ekran her seferinde değişir).
  task: (conversation) =>
    mode === 'ayni'
      ? { name: 'kaydir', input: { yon: 'asagi', neden: 'Devamına bak' } }
      : conversation.lastIndexOf('Tıklandı: "Ayrıntılar"') > conversation.lastIndexOf('bastan_ac')
        ? { name: 'bastan_ac', input: { neden: 'Kapat' } }
        : { name: 'tikla', input: { ref: refOf(conversation, 'Ayrıntılar'), neden: 'Aç' } },
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
})
afterAll(async () => {
  await h.close()
})

describe('döngü koruması', () => {
  it.each(['ayni', 'gidip-gel'] as const)(
    '%s işlemi tekrarlayan gezginin görevi tavandan çok önce kapanır, koşu biter',
    async (m) => {
      mode = m
      const before = h.calls.length
      const run = h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 1 },
      })
      expect(run.options.maxSteps).toBe(RUN_CEILINGS.maxSteps)
      const done = await h.waitFor(run.id)
      expect(done.status).toBe('bitti')
      const explorer = h.calls.slice(before).filter((c) => JSON.stringify(c.messages).includes('GÖREV: '))
      expect(explorer.length).toBeLessThanOrEqual(10)
      const info = listEvents(h.ctx.db, done.id).flatMap((e) => (e.type === 'bilgi' ? [e.message] : []))
      expect(info).toContainEqual(expect.stringContaining('görevi kapatılıyor: İlerleme durdu'))
    },
  )
})
