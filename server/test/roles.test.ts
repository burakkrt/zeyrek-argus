import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { getSettings, saveSettings } from '../src/db/settings.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'

const app = { project: 'qm', application: 'web' }

const candidate = (conversation: string, anahtar: string, baslik: string, alinti: string) => ({
  name: 'bulgu_bildir',
  input: {
    tur: 'tutarsizlik',
    anahtar,
    baslik,
    senaryo: 'Eğitim listesini aç',
    beklenen: 'Toplam, tablodaki satır sayısı olmalı',
    gozlenen: 'Toplam 5, tabloda 3 satır',
    alinti,
    ref: alinti ? refOf(conversation, alinti) : '',
    kurallar: [],
    bastiran_kural: '',
  },
})

let planned = 'Liste gezintisi'

const script: Script = {
  plan: () => ({ ozet: 'Eğitim listesi', gorevler: [{ baslik: planned, amac: 'Listeye bak' }] }),
  inspect: (prompt) =>
    prompt.includes('- Sayfa açıldı.')
      ? {
          bulgular: [
            {
              tur: 'tutarsizlik',
              anahtar: 'toplam-tablo-uyusmuyor',
              baslik: 'Toplam 5 diyor, tabloda 3 satır var',
              senaryo: 'Eğitim listesini aç',
              beklenen: 'Toplam satır sayısıyla aynı olmalı',
              gozlenen: '"Toplam: 5 kayıt" yazıyor, tabloda 3 satır',
              alinti: 'Toplam: 5 kayıt',
            },
          ],
          notlar: ['"Onaylı ölçüm" etiketi açılış ekranında'],
        }
      : { bulgular: [], notlar: ['"Eğitim ayrıntısı" penceresi açık'] },
  terms: () => ({
    bulgular: [
      {
        tur: 'tutarsizlik',
        anahtar: 'ayrinti-liste-adi-farkli',
        baslik: 'Aynı kayıt listede ve pencerede farklı adla geçiyor',
        senaryo: 'Ayrıntılar penceresini aç',
        beklenen: 'Aynı adla geçmeli',
        gozlenen: 'Liste "Eğitim listesi" (ekran 1), pencere "Eğitim ayrıntısı" (ekran 2)',
        alinti: 'Durum: undefined',
      },
    ],
    notlar: [],
  }),
  task: (conversation, task, turn) => {
    if (task === 'Göz turu') {
      if (turn === 1)
        return { name: 'tikla', input: { ref: refOf(conversation, 'Ayrıntılar'), neden: 'Pencereyi aç' } }
      if (turn === 2)
        return { name: 'gorevi_bitir', input: { ozet: 'Pencere açıldı.', eksik: 'Filtre denenmedi' } }
      return { name: 'gorevi_bitir', input: { ozet: 'Filtre de denendi.', eksik: '' } }
    }
    if (task !== 'Liste gezintisi') return { name: 'gorevi_bitir', input: { ozet: 'Bakıldı.' } }
    switch (turn) {
      case 1:
      case 2:
        return { name: 'tikla', input: { ref: 'e9999', neden: 'Olmayan öğe' } }
      case 3:
        return [
          candidate(conversation, 'toplam-yanlis', 'Toplam tutmuyor', 'Toplam: 5 kayıt'),
          candidate(conversation, 'renk-begenilmedi', 'Başlık rengi hoşuma gitmedi', ''),
        ]
      default:
        return { name: 'gorevi_bitir', input: { ozet: 'Toplam tutarsız.' } }
    }
  },
  judge: (c) =>
    c.anahtar === 'yz:renk-begenilmedi' || c.anahtar === 'renk-begenilmedi'
      ? { karar: 'ret', tur: 'not', anahtar: c.anahtar, baslik: c.baslik, gerekce: 'Beğeni bulgu değildir.' }
      : {
          karar: 'kabul',
          tur: 'tutarsizlik',
          anahtar: 'toplam-kayit-sayisi',
          baslik: 'Toplam kayıt sayısı tabloyla uyuşmuyor',
          gerekce: 'Ekranda görülüyor.',
        },
}

let h: Harness

beforeAll(async () => {
  h = await startHarness(script)
  // İlk iki test göz kapalıyken gezgin + yargıç yolunu ölçer; üçüncüsü gözü açar.
  saveSettings(h.ctx.db, {
    models: { ...getSettings(h.ctx.db).models, explorer: 'claude-haiku-5-5' },
    inspector: false,
  })
})

afterAll(async () => {
  await h.close()
})

const messages = (runId: string) =>
  listEvents(h.ctx.db, runId).flatMap((e) => (e.type === 'bilgi' ? [e.message] : []))

describe('model rolleri, yargıç ve modelsiz doğrulama', () => {
  it('gezgin ucuz modelle başlar, takılınca yükselir; yargıç adayı reddeder ya da anahtarını eşler', async () => {
    const run = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 2, maxSteps: 8 },
      }).id,
    )
    expect(run.status).toBe('bitti')

    const explorer = h.calls.filter((c) => JSON.stringify(c.messages).includes('GÖREV: Liste gezintisi'))
    expect(explorer.slice(0, 2).map((c) => c.model)).toEqual(['claude-haiku-5-5', 'claude-haiku-5-5'])
    expect(explorer.at(-1)!.model).toBe('claude-sonnet-5-5')
    expect(messages(run.id)).toContainEqual(expect.stringContaining('claude-haiku-5-5 → claude-sonnet-5-5'))

    // Yargıç Opus'tur, tek seferlik içeriği önbelleğe yazmaz; bilinen/reddedilen listesi yalnız ona gider.
    const judge = h.calls.filter((c) => JSON.stringify(c.messages).includes('YARGIÇ GÖREVİ'))
    expect(judge.map((c) => c.model)).toEqual(['claude-opus-5-5', 'claude-opus-5-5'])
    expect(judge.every((c) => c.cache_control === undefined)).toBe(true)
    expect(JSON.stringify(judge[0]!.system)).toContain('dediği sorunlar (aynısıysa reddet)')
    expect(explorer.some((c) => JSON.stringify([c.system, c.messages]).includes('dediği sorunlar'))).toBe(
      false,
    )

    const keys = h.ctx.issues.list({ app, includeSuppressed: true }).map((i) => i.key)
    expect(keys).toContain('yz:toplam-kayit-sayisi')
    expect(keys).not.toContain('yz:toplam-yanlis')
    expect(keys).not.toContain('yz:renk-begenilmedi')
    expect(messages(run.id)).toContainEqual(expect.stringContaining('Yargıç reddetti: Başlık rengi'))

    expect(run.usage.roles?.judge).toMatchObject({ requests: 2, model: 'claude-opus-5-5' })
    expect(run.usage.roles?.explorer?.model).toBe('claude-haiku-5-5+claude-sonnet-5-5')
    expect(messages(run.id)).toContainEqual(
      'Değişiklik izi (önceki koşuya göre): arayüz ilk ölçüm, veri uçları ilk ölçüm, Studio tanımı ilk ölçüm.',
    )
  })

  it('açık sorunun alıntısı açılışta ekrandaysa model çağrılmadan doğrulanır; değişmeyen sayfanın izi aynı çıkar', async () => {
    const before = h.calls.length
    const run = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 1, maxSteps: 3 },
      }).id,
    )
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:toplam-kayit-sayisi')!
    const occurrence = h.ctx.issues.detail(issue.id).occurrences.find((o) => o.runId === run.id)
    expect(occurrence).toMatchObject({ outcome: 'tekrar', quote: 'Toplam: 5 kayıt' })
    expect(h.ctx.db.prepare('select phase from occurrences where id = ?').get(occurrence!.id)).toEqual({
      phase: 'acilis',
    })
    expect(occurrence!.box).not.toBeNull()
    const status = listEvents(h.ctx.db, run.id).find((e) => e.type === 'sorun-durumu')
    expect(status).toMatchObject({ key: 'yz:toplam-kayit-sayisi', state: 'var' })

    // Gezgine "yeniden bak" diye gitmedi (sayfa bilgisini damıtan öğretmen açık sorunları bilerek görür).
    const explorer = h.calls.slice(before).filter((c) => JSON.stringify(c.messages).includes('GÖREV: '))
    expect(explorer.some((c) => JSON.stringify(c.messages).includes('yz:toplam-kayit-sayisi —'))).toBe(false)
    expect(messages(run.id)).toContainEqual(
      'Değişiklik izi (sayfa bilgisine göre): arayüz aynı, veri uçları aynı, Studio tanımı aynı.',
    )
  })

  it('göz açıkken her yeni ekranı Opus bir kez inceler, bulgusu kutulu kanıtla kaydedilir; eksik bırakan gezgin yükselir', async () => {
    saveSettings(h.ctx.db, { inspector: true })
    planned = 'Göz turu'
    const before = h.calls.length
    const run = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 2, maxSteps: 6 },
      }).id,
    )
    expect(run.status).toBe('bitti')
    const calls = h.calls.slice(before)
    const inspector = calls.filter((c) => JSON.stringify(c.messages).includes('GÖZ GÖREVİ'))
    expect(inspector.every((c) => c.model === 'claude-opus-5-5' && c.cache_control === undefined)).toBe(true)
    // Açılış ekranı bir kez incelenir (plan ve görev başı aynı ekranı gösterse de); pencere açılınca yeniden.
    expect(inspector.filter((c) => JSON.stringify(c.messages).includes('- Sayfa açıldı.'))).toHaveLength(1)
    const dialog = inspector.find((c) => JSON.stringify(c.messages).includes('Tıklandı: \\"Ayrıntılar\\"'))!
    // Önceki ekranın notu sonraki incelemeye taşınır.
    expect(JSON.stringify(dialog.messages)).toContain('Önceki ekranların notları')
    expect(JSON.stringify(dialog.messages)).toContain('etiketi açılış ekranında')
    // Notlar ekran başına önbellek işaretli bloktadır (ön ek yalnız artar); ekranın kendisi işaretsiz sonda durur.
    const blocks = (
      dialog.messages as Array<{ content: Array<{ type: string; text?: string; cache_control?: unknown }> }>
    )[0]!.content
    const notes = blocks.find((b) => b.text?.includes('etiketi açılış ekranında'))!
    expect(notes.cache_control).toEqual({ type: 'ephemeral' })
    expect(blocks.indexOf(notes)).toBeLessThan(
      blocks.findIndex((b) => b.text?.includes('Tıklandı: "Ayrıntılar"')),
    )
    expect(blocks.filter((b) => b.cache_control)).toHaveLength(1)
    // Sayfanın taban ağacı (açılış ekranı) önbellekli ön ektedir; pencere ekranı ona göre yalnız fark olarak gider.
    const base = blocks.find((b) => b.text?.startsWith('Sayfanın taban ağacı'))!
    expect(base.text).toContain('Yangın eğitimi')
    expect(blocks.indexOf(base)).toBeLessThan(blocks.indexOf(notes))
    const current = blocks.find((b) => b.text?.includes('Bu ekranın ağacı'))!
    expect(current.text).toContain('Yalnız değişen kısım')
    expect(current.text).toContain('Eğitim ayrıntısı')
    expect(current.text).not.toContain('Yangın eğitimi')

    // Terim gözü: sayfa sonunda bir kez; incelenen ekranların etiketleri geçtikleri ekranlarla gider, bulgu alıntının
    // geçtiği ekranın (pencere) görüntüsüyle doğrulanır.
    const terms = calls.filter((c) => JSON.stringify(c.messages).includes('TERİM GÖZÜ GÖREVİ'))
    expect(terms).toHaveLength(1)
    expect(JSON.stringify(terms[0]!.messages)).toContain('heading \\"Eğitim listesi\\" (ekran 1,2)')
    expect(JSON.stringify(terms[0]!.messages)).toContain('dialog \\"Eğitim ayrıntısı\\" (ekran 2)')
    const named = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:ayrinti-liste-adi-farkli')!
    const sighting = h.ctx.issues.detail(named.id).occurrences.find((o) => o.runId === run.id)!
    expect(sighting).toMatchObject({ outcome: 'yeni', quote: 'Durum: undefined' })
    expect(sighting.box).not.toBeNull()

    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:toplam-tablo-uyusmuyor')!
    const occurrence = h.ctx.issues.detail(issue.id).occurrences.find((o) => o.runId === run.id)!
    expect(occurrence.box).not.toBeNull()
    const shot = readFileSync(join(h.ctx.config.dataDir, 'runs', run.id, occurrence.shot!))
    expect(shot.subarray(1, 4).toString()).toBe('PNG')

    const explorer = calls.filter((c) => JSON.stringify(c.messages).includes('GÖREV: Göz turu'))
    expect(JSON.stringify(explorer[0]!.messages)).toContain('ayrı bir göz inceliyor')
    expect(explorer.at(-1)!.model).toBe('claude-sonnet-5-5')
    expect(messages(run.id)).toContainEqual(expect.stringContaining('maddesini eksik bıraktı'))
  })
})
