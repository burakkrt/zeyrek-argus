import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRun } from '../src/db/runs.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'

/**
 * Koşu onayı: biten koşunun bulgularına insan karar verir (onayla / reddet); karar verilmemiş bulgu kalırken koşu
 * kapatılamaz. Önceki koşuda karar verilmiş sorun yeniden görülürse kararı onunla gelir, yeniden sorulmaz.
 */
const app = { project: 'qm', application: 'web' }
const candidate = (conversation: string, anahtar: string, baslik: string, alinti: string) => ({
  name: 'bulgu_bildir',
  input: {
    tur: 'tutarsizlik',
    anahtar,
    baslik,
    senaryo: 'Eğitim listesini aç',
    beklenen: 'Toplam satır sayısıyla aynı olmalı',
    gozlenen: 'Toplam 5, tabloda 3 satır',
    alinti,
    ref: refOf(conversation, alinti),
    kurallar: [],
    bastiran_kural: '',
  },
})
// Sahte model görev adımlarını koşular arasında sayar: yönlendirmeli devam koşusunun adayı, notu gören ilk görevde bir kez.
let steered = false
const script: Script = {
  plan: () => ({ ozet: 'Eğitim listesi', gorevler: [{ baslik: 'Liste', amac: 'Listeye bak' }] }),
  task: (conversation, _task, turn) => {
    if (conversation.includes('Yönlendirme: Kayıt sayısını da dene') && !steered) {
      steered = true
      return [
        candidate(conversation, 'kayit-sayisi-yanlis', 'Kayıt sayısı satırlarla tutmuyor', 'Toplam: 5 kayıt'),
      ]
    }
    return turn === 1
      ? [
          candidate(conversation, 'toplam-tutmuyor', 'Toplam tabloyla tutmuyor', 'Toplam: 5 kayıt'),
          candidate(conversation, 'baslik-farkli', 'Başlık listeyle farklı', 'Yangın eğitimi'),
        ]
      : { name: 'gorevi_bitir', input: { ozet: 'Bakıldı.', eksik: '' } }
  },
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
})
afterAll(async () => {
  await h.close()
})

const start = () =>
  h.waitFor(h.ctx.runs.create({ ...app, environment: 'development', pages: ['egt-liste'] }).id)

describe('koşu onayı', () => {
  it('karar verilmemiş bulgu kalırken koşu kapatılmaz; hepsine karar verilince kapanır', async () => {
    const run = await start()
    expect(run.status).toBe('bitti')
    // Gezginin iki adayı ve gözlerin bulduğu kusurlar: hepsi bu koşuda açık, karar bekliyor.
    const found = h.ctx.issues.list({ app, runId: run.id })
    expect(found.map((i) => i.key)).toEqual(
      expect.arrayContaining(['yz:toplam-tutmuyor', 'yz:baslik-farkli']),
    )
    expect(getRun(h.ctx.db, run.id)!.review).toEqual({ pending: found.length, accepted: 0, rejected: 0 })
    expect(() => h.ctx.runs.close(run.id, 'Burak')).toThrow(`${found.length} bulguya karar`)
    expect(getRun(h.ctx.db, run.id)!.closedAt).toBeNull()

    // Biri kalırken de kapanmaz.
    const [last, ...rest] = found
    for (const issue of rest) h.ctx.issues.decide(issue.id, 'duzeltilecek', 'Burak', null)
    expect(() => h.ctx.runs.close(run.id, 'Burak')).toThrow('1 bulguya karar')
    h.ctx.issues.decide(last!.id, 'bulgu-degil', 'Burak', 'Tasarım gereği.')
    expect(getRun(h.ctx.db, run.id)!.review).toEqual({ pending: 0, accepted: rest.length, rejected: 1 })

    const closed = h.ctx.runs.close(run.id, 'Burak')
    expect(closed.closedAt).not.toBeNull()
    expect(closed.closedBy).toBe('Burak')
  })

  it('önceki koşuda onaylanan sorun yeniden görülünce kararı onunla gelir; süren koşu kapatılamaz', async () => {
    const run = await start()
    // Bütün sorunlara önceki koşuda karar verildi: onaylananın kararı geçerli, reddedilen bastırılır; bekleyen yok.
    expect(getRun(h.ctx.db, run.id)!.review.pending).toBe(0)
    expect(h.ctx.runs.close(run.id, 'Burak').closedAt).not.toBeNull()

    const queued = h.ctx.runs.create({ ...app, environment: 'development', pages: ['egt-liste'] })
    expect(() => h.ctx.runs.close(queued.id, 'Burak')).toThrow('bitmeden')
    await h.waitFor(queued.id)
  })

  it('yönlendir ve sürdür: devam koşusunun yeni bulgusu ana koşunun onayına düşer; sürerken ve karar beklerken kapanmaz', async () => {
    const root = await start()
    expect(getRun(h.ctx.db, root.id)!.review.pending).toBe(0)

    const child = h.ctx.runs.continueRun(root.id, 'Kayıt sayısını da dene')
    expect(child.options.parentRunId).toBe(root.id)
    expect(child.options.brief).toContain('Yönlendirme: Kayıt sayısını da dene')
    expect(child.pages).toEqual(root.pages)
    // Devam koşusu sürerken ana koşu kapatılamaz.
    expect(() => h.ctx.runs.close(root.id, 'Burak')).toThrow('Devam koşusu')
    await h.waitFor(child.id)

    // Yeni bulgu ana koşunun onayında bekliyor; devam koşusunun onayı da aynı aileyi gösterir.
    const info = getRun(h.ctx.db, root.id)!
    expect(info.review.pending).toBe(1)
    expect(info.continuations.map((c) => c.id)).toEqual([child.id])
    expect(getRun(h.ctx.db, child.id)!.review).toEqual(info.review)
    expect(() => h.ctx.runs.close(root.id, 'Burak')).toThrow('1 bulguya karar')

    // Devam koşusundan sürdürmek yine ana koşuya bağlanır.
    const fresh = h.ctx.issues.list({ app, runId: child.id }).find((i) => i.key === 'yz:kayit-sayisi-yanlis')!
    h.ctx.issues.decide(fresh.id, 'duzeltilecek', 'Burak', null)
    const closed = h.ctx.runs.close(root.id, 'Burak')
    expect(closed.closedAt).not.toBeNull()
    expect(getRun(h.ctx.db, child.id)!.closedAt).not.toBeNull()
    // Kapatılmış koşu sürdürülemez.
    expect(() => h.ctx.runs.continueRun(root.id, 'Bir daha bak')).toThrow('kapatıldı')
  })
})
