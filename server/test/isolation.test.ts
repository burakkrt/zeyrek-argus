import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'
import { overrides } from './support/site.ts'

/**
 * Ortam yalıtımı (KOS-2026-0035'in küçük ölçekli yeniden üretimi): gezgin formu yarım doldurup çıkmak isteyince
 * uygulama "kaydedilmedi, çıkılsın mı?" diye sorar. Çıkış onayı kabul edilir; sonraki görev sayfanın temiz hâlinden
 * başlar; adında "silinecek" geçen bir kaydın satırı veri sayılır, tıklanır; sonraki sayfa sorunsuz açılır.
 */
const app = { project: 'qm', application: 'web' }
const ROW = 'TEST-SIHIRBAZ geç yayın denemesi (ajan, silinecek) DD-2026-07 Beyaz yaka Kapandı'
const FORM =
  '<!doctype html><html><head><title>Dönem</title></head><body><h1>Yeni dönem</h1>' +
  '<label>Dönem adı <input id="ad"></label>' +
  '<a id="geri" href="/dev/qm/web/egt-liste">Dönem yönetimi</a>' +
  '<table><tbody><tr role="row" onclick="document.body.insertAdjacentHTML(\'beforeend\', \'<h2>Kayıt ayrıntısı</h2>\')">' +
  `<td>${ROW}</td></tr></tbody></table>` +
  '<script>let kirli = false; document.getElementById("ad").addEventListener("input", () => { kirli = true });' +
  'document.getElementById("geri").addEventListener("click", (e) => {' +
  ' if (kirli && !confirm("Girilen bilgiler kaydedilmedi. Sayfadan çıkılsın mı?")) e.preventDefault() })</script>' +
  '</body></html>'

const script: Script = {
  plan: () => ({
    ozet: 'Dönem formu',
    gorevler: [
      { baslik: 'Form', amac: 'Formu doldur, listeye dön' },
      { baslik: 'Satır', amac: 'Kaydın satırını aç' },
    ],
  }),
  task: (conversation, task, turn) => {
    if (task === 'Form') {
      if (turn === 1)
        return {
          name: 'yaz',
          input: { ref: refOf(conversation, 'Dönem adı'), metin: 'Deneme', neden: 'Doldur' },
        }
      if (turn === 2)
        return { name: 'tikla', input: { ref: refOf(conversation, 'Dönem yönetimi'), neden: 'Listeye dön' } }
      return { name: 'gorevi_bitir', input: { ozet: 'Bitti', eksik: '' } }
    }
    if (turn === 1)
      return {
        name: 'tikla',
        input: { ref: refOf(conversation, ROW), neden: 'Ayrıntı' },
      }
    return { name: 'gorevi_bitir', input: { ozet: 'Bitti', eksik: '' } }
  },
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
  overrides.set('egt-temiz', FORM)
})
afterAll(async () => {
  overrides.delete('egt-temiz')
  await h.close()
})

describe('ortam yalıtımı', () => {
  it('çıkış onayı kabul edilir, her görev temiz başlar, veri satırı tıklanır, sonraki sayfa açılır', async () => {
    const before = h.calls.length
    const done = await h
      .waitFor(
        h.ctx.runs.create({
          ...app,
          environment: 'development',
          pages: ['egt-temiz', 'egt-liste'],
          options: { maxSteps: 6 },
        }).id,
      )
      .then((r) => r)
    expect(done.status).toBe('bitti')
    const events = listEvents(h.ctx.db, done.id)
    const steps = events.flatMap((e) => (e.type === 'adim' ? [JSON.stringify(e)] : []))
    // Çıkış onayı kabul edildi ve liste açıldı.
    expect(steps.some((s) => s.includes('Girilen bilgiler kaydedilmedi') && s.includes('kabul edildi'))).toBe(
      true,
    )
    const conversations = h.calls.slice(before).map((c) => JSON.stringify(c.messages))
    const satir = conversations.filter((c) => c.includes('GÖREV: Satır'))
    // İkinci görev formun temiz hâlinden başladı (ilk görevin yazdığı değer yok) ve veri satırı tıklandı.
    expect(satir[0]).not.toContain('Deneme')
    expect(satir.some((c) => c.includes('Kayıt ayrıntısı'))).toBe(true)
    expect(steps.some((s) => s.includes('Salt okuma'))).toBe(false)
    // İkinci sayfa açıldı: açılış hatası yok.
    expect(events.some((e) => e.type === 'hata')).toBe(false)
    expect(events.filter((e) => e.type === 'sayfa-bitti')).toHaveLength(2)
  })
})
