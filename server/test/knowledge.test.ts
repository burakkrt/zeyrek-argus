import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { saveSettings } from '../src/db/settings.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'
import { overrides } from './support/site.ts'

/**
 * Öğrenen motor uçtan uca: koşu sonunda sayfa bilgisi yazılır ve sonraki koşunun istemine girer; değişmemiş sayfada
 * planlayıcı bilinen alanı yeniden gezmemeye yönlendirilir ve yeni öğrenme yoksa bilgi yeniden yazılmaz; sayfa değişince plan değişikliğe yönelir, yeni ekran incelenir, bilgi yenilenir.
 */
const app = { project: 'qm', application: 'web' }

const script: Script = {
  plan: () => ({ ozet: 'Eğitim listesi', gorevler: [{ baslik: 'Ayrıntı penceresi', amac: 'Pencereyi aç' }] }),
  // Sahte modelin tur sayacı koşular arasında sürer; karar konuşmaya göre verilir (pencere açık değilse aç).
  task: (conversation) =>
    conversation.includes('"Ayrıntılar"') && !conversation.includes('dialog "Eğitim ayrıntısı"')
      ? { name: 'tikla', input: { ref: refOf(conversation, 'Ayrıntılar'), neden: 'Pencereyi aç' } }
      : { name: 'gorevi_bitir', input: { ozet: 'Bakıldı.', eksik: '' } },
  inspect: (prompt) => ({
    bulgular: [],
    notlar: [prompt.includes('Eğitim ayrıntısı') ? '"Durum" pencerede' : '"Toplam: 5 kayıt" açılışta'],
  }),
  knowledge: () => ({
    amac: 'Eğitimlerin listesi.',
    ekranlar: ['Liste', 'Ayrıntılar ile açılan "Eğitim ayrıntısı" penceresi'],
    beklentiler: [{ metin: 'Toplam kayıt sayısı tablodaki satırla tutmalı', guven: 'orta' }],
    kapsanan: ['Ayrıntı penceresi'],
    kapsanmayan: ['Arama ve Filtrele'],
    tuhafliklar: [],
  }),
}

let h: Harness

beforeAll(async () => {
  h = await startHarness(script)
  saveSettings(h.ctx.db, { inspector: true })
})

afterAll(async () => {
  overrides.clear()
  await h.close()
})

const run = async () =>
  h.waitFor(
    h.ctx.runs.create({
      ...app,
      environment: 'development',
      pages: ['egt-liste'],
      options: { maxTasks: 2, maxSteps: 3 },
    }).id,
  )

// Sayfanın sabit bağlamı talimattadır (önbellek); istemin tamamı talimat + mesajlardır.
const promptsSince = (from: number, marker: string) =>
  h.calls
    .slice(from)
    .map((c) => JSON.stringify({ system: c.system, messages: c.messages }))
    .filter((c) => c.includes(marker))

const infoOf = (runId: string) =>
  listEvents(h.ctx.db, runId).flatMap((e) => (e.type === 'bilgi' ? [e.message] : []))

describe('öğrenen motor', () => {
  // Her kişi kendi dosyasını yazar: pages/<sayfa>/<yazar>.md.
  const file = () => join(h.ctx.config.memoryDir, 'apps/qm/web/pages/egt-liste', `${h.ctx.author().id}.md`)

  it('ilk koşu sayfa bilgisini yazar; değişmemiş sayfada ikinci koşu bilinen alanı yeniden gezmez, ekranı yeniden inceler', async () => {
    const first = h.calls.length
    const one = await run()
    expect(one.status).toBe('bitti')
    expect(promptsSince(first, 'GÖZ GÖREVİ')).toHaveLength(2)
    // Sabit sayfa bağlamı (modülün bilinen sorunları dahil) yalnız talimatta ve iki göz çağrısında birebir aynı: ikinci
    // çağrı onu önbellekten okur; mesajlarda tekrar etmez.
    const eyes = h.calls.slice(first).filter((c) => JSON.stringify(c.messages).includes('GÖZ GÖREVİ'))
    expect(JSON.stringify(eyes[0]!.system)).toContain('Bu modülde bilinen sorunlar')
    expect(JSON.stringify(eyes[0]!.system)).toBe(JSON.stringify(eyes[1]!.system))
    expect(eyes.some((c) => JSON.stringify(c.messages).includes('Bu modülde bilinen sorunlar'))).toBe(false)
    expect(existsSync(file())).toBe(true)
    const knowledge = readFileSync(file(), 'utf8')
    expect(knowledge).toContain(`kosu: ${one.code}`)
    expect(knowledge).toContain('- Arama ve Filtrele')
    expect(knowledge).toContain('Toplam kayıt sayısı tablodaki satırla tutmalı (güven: orta)')
    // İlk koşuda sayfa bilgisi yoktu: plan olağan biçimde, değişiklik yönlendirmesi olmadan yapılır.
    expect(promptsSince(first, 'DEĞİŞİKLİK İZİ')).toHaveLength(0)

    const second = h.calls.length
    const two = await run()
    expect(two.status).toBe('bitti')
    const planner = promptsSince(second, 'Bu sayfayı eksiksiz test etmek için')
    expect(planner).toHaveLength(1)
    expect(planner[0]).toContain('Sayfa bilgisi (önceki koşulardan')
    expect(planner[0]).toContain('Sayfa değişmedi')
    expect(planner[0]).toContain('Arama ve Filtrele')
    // Önceki koşuda incelenen açılış ekranı yeniden incelenir (ikinci bakış bulgu kaçırmaz), koşu içinde bir kez.
    expect(promptsSince(second, 'GÖZ GÖREVİ').filter((p) => p.includes('- Sayfa açıldı.'))).toHaveLength(1)
    // Yeni öğrenme yok (sayfa aynı, bulgu yok): bilgi yeniden yazılmaz, öğretmen çağrılmaz.
    expect(infoOf(two.id)).toContain('Sayfa bilgisi güncel: yeni öğrenme olmadığı için yeniden yazılmadı.')
    expect(promptsSince(second, 'SAYFA BİLGİSİ GÖREVİ')).toHaveLength(0)
    expect(readFileSync(file(), 'utf8')).toContain(`kosu: ${one.code}`)
  })

  it('sayfa değişince plan değişikliğe yönelir, yeni ekran incelenir, bilgi yeniden yazılır', async () => {
    overrides.set(
      'egt-liste',
      '<!doctype html><html><head><title>Eğitim listesi</title></head><body><h1>Eğitim listesi</h1>' +
        '<nav><button>Aktif</button><button>Kapandı</button></nav><p>Toplam: 2 kayıt</p></body></html>',
    )
    const from = h.calls.length
    const three = await run()
    expect(three.status).toBe('bitti')
    const planner = promptsSince(from, 'Bu sayfayı eksiksiz test etmek için')
    expect(planner[0]).toContain('Sayfa değişti')
    expect(promptsSince(from, 'GÖZ GÖREVİ').length).toBeGreaterThan(0)
    expect(promptsSince(from, 'SAYFA BİLGİSİ GÖREVİ')).toHaveLength(1)
    expect(readFileSync(file(), 'utf8')).toContain(`kosu: ${three.code}`)
    overrides.delete('egt-liste')
  })
})
