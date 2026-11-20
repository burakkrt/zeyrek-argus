import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startHarness, type Harness } from './support/harness.ts'
import { overrides } from './support/site.ts'

/**
 * Yükleme sürerken bildirilen bulgu: gezgin ekran yüklenirken bulgu bildirince Argus önce yüklemenin bitmesini bekler
 * (ağ ve ARIA yükleme göstergesi), sonra alıntıyı doğrular ve yargıca gönderir. Ekran hiç bitmiyorsa aday bir kez
 * yargıçsız geri çevrilir; aynı aday yeniden bildirilirse yargıca gider (bitmeyen yükleme gerçek bulgu olabilir).
 */
const app = { project: 'qm', application: 'web' }
const report = (anahtar: string, alinti: string) => ({
  name: 'bulgu_bildir',
  input: {
    anahtar,
    baslik: `${anahtar} bulgusu`,
    tur: 'kesin',
    onem: 'S3',
    senaryo: 'Sayfayı aç',
    beklenen: 'Doğru değer',
    gozlenen: alinti,
    alinti,
  },
})
const finish = { name: 'gorevi_bitir', input: { ozet: 'Bakıldı.', eksik: '' } }

// Sahte modelin görev sayacı görev adıyla tutulur (iki koşuda da "Bak"); sayfa başına ayrı sayılır.
const turns = new Map<string, number>()
const turnOf = (page: string) => {
  const turn = (turns.get(page) ?? 0) + 1
  turns.set(page, turn)
  return turn
}

let h: Harness
beforeAll(async () => {
  h = await startHarness({
    plan: () => ({ ozet: 'Sayfa', gorevler: [{ baslik: 'Bak', amac: 'Sayfaya bak' }] }),
    task: (prompt) => {
      if (prompt.includes('Geç yüklenen sayfa'))
        return turnOf('gec') === 1 ? report('gec-sayac', 'Zorunlu 0/5') : finish
      if (prompt.includes('Hiç bitmeyen sayfa'))
        return turnOf('hep') <= 2 ? report('bitmeyen-yukleme', 'Hiç bitmeyen sayfa') : finish
      return finish
    },
  })
})
afterAll(() => h?.close())

const judgeCalls = () => h.calls.filter((c) => JSON.stringify(c.messages).includes('YARGIÇ GÖREVİ')).length

describe('yükleme sürerken bildirilen bulgu', () => {
  it('yükleme göstergesi kalkana kadar beklenir; alıntı yüklemeden sonra görünse de doğrulanır', async () => {
    // Alıntı 2,5 sn sonra görünür: beklenmeseydi alıntı doğrulanamaz, bulgu "doğrulanamadı" kalırdı.
    overrides.set(
      'yuk-gec',
      `<!doctype html><html lang="tr"><body><h1>Geç yüklenen sayfa</h1><div id="s" aria-busy="true">Yükleniyor</div>` +
        `<script>setTimeout(() => { const s = document.getElementById('s'); s.removeAttribute('aria-busy'); s.textContent = 'Zorunlu 0/5' }, 2500)</script></body></html>`,
    )
    const before = judgeCalls()
    const run = await h.waitFor(h.ctx.runs.create({ ...app, environment: 'development', pages: ['yuk-gec'] }).id)
    expect(run.status).toBe('bitti')
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:gec-sayac')!
    const seen = h.ctx.issues.detail(issue.id).occurrences.find((o) => o.runId === run.id)!
    expect(seen.outcome).toBe('yeni')
    expect(judgeCalls() - before).toBe(1)
  }, 60_000)

  it('hiç bitmeyen yüklemede ilk bildirim yargıçsız geri çevrilir, ikinci bildirim yargıca gider ve kaydedilir', async () => {
    overrides.set(
      'yuk-hep',
      `<!doctype html><html lang="tr"><body><h1>Hiç bitmeyen sayfa</h1><div role="progressbar" aria-busy="true" style="width:40px;height:40px">…</div></body></html>`,
    )
    const before = judgeCalls()
    const run = await h.waitFor(h.ctx.runs.create({ ...app, environment: 'development', pages: ['yuk-hep'] }).id)
    expect(run.status).toBe('bitti')
    const replies = h.calls.map((c) => JSON.stringify(c.messages)).filter((m) => m.includes('Hiç bitmeyen sayfa'))
    expect(replies.some((m) => m.includes('Ekran hâlâ yükleniyor'))).toBe(true)
    expect(judgeCalls() - before).toBe(1)
    expect(h.ctx.issues.list({ app }).some((i) => i.key === 'yz:bitmeyen-yukleme')).toBe(true)
  }, 60_000)
})
