import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRun, listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness, type Script } from './support/harness.ts'

/**
 * Sayfa seçmek isteğe bağlıdır: yalnız girdiyle başlatılan koşuda sayfalar girdiden, uygulamanın sayfa listesinden
 * seçilir (liste dışı ad atılır) ve koşu o sayfalarla sürer. Ne sayfa ne girdi varsa koşu açılmaz; girdiden sayfa
 * çıkmazsa koşu nedenini söyleyerek durur.
 */
const app = { project: 'qm', application: 'web' }
let answer: { sayfalar: string[]; gerekce: string } = { sayfalar: [], gerekce: '' }
const script: Script = {
  pick: () => answer,
  plan: () => ({ ozet: 'Sayfa', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
  task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bakıldı.', eksik: '' } }),
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
})
afterAll(async () => {
  await h.close()
})

const start = (brief: string | null) =>
  h.ctx.runs.create({ ...app, environment: 'development', pages: [], options: { maxTasks: 1, maxSteps: 3, brief } })

describe('yalnız girdiyle koşu', () => {
  it('sayfalar girdiden seçilir, liste dışı ad atılır, koşu seçilen sayfalarla biter', async () => {
    answer = { sayfalar: ['egt-temiz', 'olmayan-sayfa', 'egt-temiz'], gerekce: 'Eğitim listesi istendi.' }
    const done = await h.waitFor(start('Eğitim modülündeki tüm arayüz sorunlarını bul').id)
    expect(done.status).toBe('bitti')
    expect(getRun(h.ctx.db, done.id)!.pages).toEqual(['egt-temiz'])
    const info = listEvents(h.ctx.db, done.id).flatMap((e) => (e.type === 'bilgi' ? [e.message] : []))
    expect(info).toContainEqual(expect.stringContaining('Girdiye göre 1 sayfa seçildi: egt-temiz.'))
    const picker = h.calls.find((c) => JSON.stringify(c.messages).includes('SAYFA SEÇİMİ GÖREVİ'))!
    expect(JSON.stringify(picker.messages)).toContain('Eğitim modülündeki tüm arayüz sorunlarını bul')
    expect(JSON.stringify(picker.messages)).toContain('egt-liste')
  })

  it('girdiden sayfa çıkmazsa koşu nedenini söyleyerek durur', async () => {
    answer = { sayfalar: ['olmayan-sayfa'], gerekce: '' }
    const done = await h.waitFor(start('Muhasebe raporlarını test et').id)
    expect(done.status).toBe('hata')
    expect(done.error).toContain('Girdiden test edilecek sayfa çıkarılamadı')
  })

  it('ne sayfa ne girdi varsa koşu açılmaz', () => {
    expect(() => start('  ')).toThrow('Sayfa seçin ya da girdi yazın.')
  })
})
