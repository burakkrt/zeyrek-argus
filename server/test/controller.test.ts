import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'
import { overrides } from './support/site.ts'

const app = { project: 'qm', application: 'web' }

const script: Script = {
  plan: (prompt) =>
    prompt.includes('Sayfa: egt-liste')
      ? {
          ozet: 'Eğitim listesi',
          gorevler: [{ baslik: 'Satır işlemleri ve pencere', amac: 'Düğmeleri ve ayrıntı penceresini dene' }],
        }
      : { ozet: 'Basit sayfa', gorevler: [{ baslik: 'Kısa bakış', amac: 'Bak ve bitir' }] },
  task: (conversation, task, turn) => {
    if (task !== 'Satır işlemleri ve pencere') return { name: 'gorevi_bitir', input: { ozet: 'Bakıldı.' } }
    switch (turn) {
      case 1:
        return { name: 'tikla', input: { ref: refOf(conversation, 'Sil'), neden: 'Silmeyi dene' } }
      case 2:
        return {
          name: 'tikla',
          input: { ref: refOf(conversation, 'Hızlı ekle'), neden: 'Hızlı ekleme ne yapıyor' },
        }
      case 3:
        return {
          name: 'yaz',
          input: { ref: refOf(conversation, 'Ara'), metin: 'yangın', neden: 'Aramayı dene' },
        }
      case 4:
        return { name: 'tikla', input: { ref: refOf(conversation, 'Filtrele'), neden: 'Filtreyi uygula' } }
      case 5:
        return {
          name: 'tikla',
          input: { ref: refOf(conversation, 'Ayrıntılar'), neden: 'Ayrıntı penceresine bak' },
        }
      case 6:
        return [
          {
            name: 'bulgu_bildir',
            input: {
              tur: 'tutarsizlik',
              anahtar: 'toplam-satir-uyusmuyor',
              baslik: 'Toplam kayıt sayısı tablodakiyle uyuşmuyor',
              senaryo: 'Eğitim listesini aç',
              beklenen: 'Toplam, tablodaki satır sayısı olmalı (3)',
              gozlenen: '"Toplam: 5 kayıt" yazıyor, tabloda 3 satır var',
              alinti: 'Toplam: 5 kayıt',
              ref: refOf(conversation, 'Toplam: 5 kayıt'),
              kurallar: [],
              bastiran_kural: '',
            },
          },
          {
            name: 'bulgu_bildir',
            input: {
              tur: 'kesin',
              anahtar: 'hayalet',
              baslik: 'Ekranda olmayan bir şey',
              senaryo: '-',
              beklenen: '-',
              gozlenen: '-',
              alinti: 'Böyle bir metin yok',
              ref: '',
              kurallar: [],
              bastiran_kural: '',
            },
          },
        ]
      default:
        return { name: 'gorevi_bitir', input: { ozet: 'Pencerede ham değer, toplamda tutarsızlık.' } }
    }
  },
}

let h: Harness

beforeAll(async () => {
  h = await startHarness(script)
  const rules = join(h.ctx.config.memoryDir, 'apps', 'qm', 'web', 'rules')
  mkdirSync(rules, { recursive: true })
  writeFileSync(
    join(rules, 'sapkali-harf.md'),
    '---\nid: sapkali-harf\nkapsam: uygulama\ntur: sorun\ndurum: onayli\ndesen: "[âîûÂÎÛ]"\nkaynak: [musteri:Kitap1#1]\n---\nArayüzde şapkalı harf kullanılmaz.\n',
  )
})

afterAll(async () => {
  overrides.clear()
  await h.close()
})

describe('kontrolcü (uçtan uca, senaryolu model)', () => {
  it('gözler token harcamadan bulur, kontrolcü pencereyi açıp gezer; yazma isteği sunucuya ulaşmaz', async () => {
    const created = h.ctx.runs.create({
      ...app,
      environment: 'development',
      pages: ['egt-liste', 'egt-sorunlu'],
      options: { maxTasks: 2, maxSteps: 8 },
    })
    const run = await h.waitFor(created.id)
    expect(run.status).toBe('bitti')

    const keys = h.ctx.issues.list({ app, includeSuppressed: true }).map((i) => i.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'goz:guid',
        'goz:desen:sapkali-harf',
        'goz:kesik-metin:süreci devam eden dokümanlar',
        'goz:kesik-metin:en çok',
        'goz:ham-deger:undefined',
        'yz:toplam-satir-uyusmuyor',
        'yz:hayalet',
      ]),
    )
    expect(keys.some((k) => k.startsWith('goz:konsol:beklenmeyen veri'))).toBe(true)
    expect(keys).toContain('goz:istek:GET /api/qm/web/yok/:id:404')
    // Aynı açılışta kaydedilen konsol/istek sorunu hemen "düzeldi" diye kapanmaz.
    const failedRequest = h.ctx.issues
      .list({ app, includeSuppressed: true })
      .find((i) => i.key === 'goz:istek:GET /api/qm/web/yok/:id:404')!
    expect(failedRequest.status).toBe('acik')

    // Pencerede görülen ham değer etkileşim sırasında bulundu; kanıt kutulu.
    const raw = h.ctx.issues.detail(
      h.ctx.issues.list({ app }).find((i) => i.key === 'goz:ham-deger:undefined')!.id,
    )
    expect(raw.occurrences[0]).toMatchObject({ outcome: 'yeni' })
    expect(raw.occurrences[0]!.box).not.toBeNull()
    expect(existsSync(join(h.ctx.config.dataDir, 'runs', run.id, raw.occurrences[0]!.shot!))).toBe(true)

    // Alıntısı ekranda olan doğrulandı, olmayan "doğrulanamadı" notuna indi.
    const issues = h.ctx.issues.list({ app, includeSuppressed: true })
    const total = h.ctx.issues.detail(issues.find((i) => i.key === 'yz:toplam-satir-uyusmuyor')!.id)
    expect(total).toMatchObject({ kind: 'tutarsizlik' })
    expect(total.occurrences[0]!.box).not.toBeNull()
    const ghost = h.ctx.issues.detail(issues.find((i) => i.key === 'yz:hayalet')!.id)
    expect(ghost).toMatchObject({ kind: 'not' })
    expect(ghost.occurrences[0]).toMatchObject({ outcome: 'dogrulanamadi' })

    // Salt okuma: "Sil" basılmadı, "Hızlı ekle"nin yazma isteği engellendi; arama (açılışta görülen uç) geçti.
    expect(h.site.writes).toEqual([])
    const events = listEvents(h.ctx.db, run.id)
    expect(events.some((e) => e.type === 'adim' && e.outcome.startsWith('Salt okuma: "Sil"'))).toBe(true)
    expect(
      events.some(
        (e) => e.type === 'ag' && e.requests.some((r) => r.blocked && r.url.endsWith('/entities/e1/row')),
      ),
    ).toBe(true)
    expect(
      events.some(
        (e) => e.type === 'ag' && e.requests.some((r) => !r.blocked && r.url.endsWith('/row/list')),
      ),
    ).toBe(true)
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'kosu-basladi',
        'arastirma',
        'plan',
        'gorev-basladi',
        'adim',
        'gorev-bitti',
        'sayfa-bitti',
        'kosu-bitti',
      ]),
    )

    // "?" ipucu okunup modele tanım olarak verildi.
    expect(
      h.calls.some((c) => JSON.stringify(c.messages).includes('yöneticinin onayladığı ölçüm sayısı')),
    ).toBe(true)
    // Desenli kural isteme girmedi (göz olarak koştu), tarayıcı Türkçe açıldı.
    expect(JSON.stringify(h.calls[0]!.system)).toContain('gözler bakıyor')

    // Token: etkileşimden sonra gezgine ağacın tamamı değil yalnız değişen kısım gider; adım görüntüsü alınmaz.
    // (Gözün çağrısı da aynı adımı anar ama araç taşımaz; burada gezginin konuşmasına bakılır.)
    const afterDialog = h.calls.find(
      (c) => c.tools && JSON.stringify(c.messages.at(-1)).includes('Tıklandı: \\"Ayrıntılar\\"'),
    )!
    const lastTurn = JSON.stringify(afterDialog.messages.at(-1))
    expect(lastTurn).toContain('Yalnız değişen kısım')
    expect(lastTurn).toContain('Eğitim ayrıntısı')
    expect(lastTurn).not.toContain('Yangın eğitimi')
    expect(events.filter((e) => e.type === 'adim').every((e) => e.shot === null)).toBe(true)
  })

  it('karar Git dosyasına yazılır; "bulgu değil" sonraki koşuda bastırılır, düzelen göz sorunu kendiliğinden kapanır, yeniden bozulunca açılır', async () => {
    const guid = h.ctx.issues.list({ app }).find((i) => i.key === 'goz:guid')!
    h.ctx.issues.decide(guid.id, 'bulgu-degil', 'Burak', 'Bu ekranda kimlik bilerek gösteriliyor')
    const record = h.ctx.memory.decision(app, 'goz:guid')
    expect(record).toMatchObject({ status: 'bulgu-degil' })
    expect(record!.comments[0]!.text).toBe('Bu ekranda kimlik bilerek gösteriliyor')

    const kesik = h.ctx.issues
      .list({ app })
      .find((i) => i.key === 'goz:kesik-metin:süreci devam eden dokümanlar')!
    h.ctx.issues.decide(kesik.id, 'duzeltilecek', 'Burak', null)
    overrides.set(
      'egt-temiz',
      '<!doctype html><html><body><h1>Temiz</h1><p>Sorumlu: 01917edf-bf08-723a-b3ec-13ad41ea0bc8</p></body></html>',
    )

    const second = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-temiz'],
        options: { maxTasks: 1, maxSteps: 3 },
      }).id,
    )
    const suppressed = h.ctx.issues.detail(guid.id).occurrences.find((o) => o.runId === second.id)
    expect(suppressed).toMatchObject({ outcome: 'bastirildi', reason: 'İnsan kararı: bulgu değil' })

    // egt-liste yeniden: kesik metin artık yoksa düzeldi; sonra yeniden bozulunca yeniden açılır.
    overrides.set('egt-liste', '<!doctype html><html><body><h1>Eğitim listesi</h1></body></html>')
    await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 1, maxSteps: 3 },
      }).id,
    )
    expect(h.ctx.issues.detail(kesik.id).status).toBe('duzeldi')
    expect(h.ctx.memory.decision(app, kesik.key)!.history.at(-1)).toMatchObject({
      to: 'duzeldi',
      author: 'Argus',
    })

    overrides.delete('egt-liste')
    const fourth = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 1, maxSteps: 3 },
      }).id,
    )
    const reopened = h.ctx.issues.detail(kesik.id)
    expect(reopened.status).toBe('acik')
    expect(reopened.occurrences.find((o) => o.runId === fourth.id)).toMatchObject({
      outcome: 'yeniden-acildi',
    })
  })

  it('production ve hazır olmayan dal reddedilir; dal adresi /branch/<slug> ile kurulur', async () => {
    expect(() => h.ctx.runs.create({ ...app, environment: 'production', pages: ['egt-temiz'] })).toThrow(
      /production/,
    )
    const envs = await h.ctx.platform.catalog.environments('qm')
    expect(envs.map((e) => e.name)).not.toContain('production')
    const failed = await h.waitFor(
      h.ctx.runs.create({ ...app, environment: 'feature/yarim', pages: ['egt-temiz'] }).id,
    )
    expect(failed).toMatchObject({ status: 'hata' })
    expect(failed.error).toMatch(/hazır değil/)
    const branch = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'feature/yeni-ekran',
        pages: ['egt-temiz'],
        options: { maxTasks: 1, maxSteps: 3 },
      }).id,
    )
    const started = listEvents(h.ctx.db, branch.id).find((e) => e.type === 'sayfa-basladi')
    expect(started && 'url' in started ? started.url : '').toBe(
      `${h.site.url}/branch/feature-yeni-ekran/qm/web/egt-temiz`,
    )
  })
})
