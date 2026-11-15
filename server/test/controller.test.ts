import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { saveAttachment } from '../src/runs/attachments.ts'
import { appSessionFile, deleteAppUser, forgetAppSessions, saveAppUser } from '../src/db/settings.ts'
import { refOf, startHarness, type Harness, type Script } from './support/harness.ts'
import { APP_USER, overrides } from './support/site.ts'

const app = { project: 'qm', application: 'web' }

const script: Script = {
  plan: (prompt) =>
    prompt.includes('Sayfa: egt-form')
      ? { ozet: 'Form', gorevler: [{ baslik: 'Vazgeç', amac: 'Vazgeç düğmesini dene' }] }
      : prompt.includes('Sayfa: egt-liste')
        ? {
            ozet: 'Eğitim listesi',
            gorevler: [
              { baslik: 'Satır işlemleri ve pencere', amac: 'Düğmeleri ve ayrıntı penceresini dene' },
            ],
          }
        : { ozet: 'Basit sayfa', gorevler: [{ baslik: 'Kısa bakış', amac: 'Bak ve bitir' }] },
  task: (conversation, task, turn) => {
    if (task === 'Vazgeç' && turn === 1)
      return { name: 'tikla', input: { ref: refOf(conversation, 'Vazgeç'), neden: 'Vazgeç ne yapıyor' } }
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
    // Monitör karesi diske yazılır ama modele gitmez: tıklamadan sonraki turda görüntü bloğu yok.
    expect(lastTurn).not.toContain('"type":"image"')
    const click = events.find((e) => e.type === 'adim' && e.outcome === 'Tıklandı: "Ayrıntılar"')
    if (click?.type !== 'adim') throw new Error('Ayrıntılar tıklaması akışta yok')
    expect(existsSync(join(h.ctx.config.dataDir, 'runs', run.id, click.shot!))).toBe(true)
    // Hedef kutusu görünüm alanına oranla: imleç monitörde öğenin üstüne çizilir.
    expect(click.target).not.toBeNull()
    expect(click.target!.x).toBeGreaterThan(0)
    expect(click.target!.y).toBeGreaterThan(0)
    expect(click.target!.x + click.target!.width).toBeLessThanOrEqual(1)
    expect(click.target!.y + click.target!.height).toBeLessThanOrEqual(1)
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
    // "Düzeldi" Argus'un bu makinedeki gözlemidir: yerelde kayıtlı, paylaşılan karar dosyasına yazılmaz.
    expect(h.ctx.issues.detail(kesik.id).history.at(-1)).toMatchObject({ to: 'duzeldi', author: 'Argus' })
    expect(h.ctx.memory.decision(app, kesik.key)?.status ?? null).not.toBe('duzeldi')

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

  it('kimliksiz açılan kayıt sayfası başka sayfaya yönlenirse atlanır: model çağrılmaz, bulgu yazılmaz', async () => {
    overrides.set(
      'egt-kayit',
      `<!doctype html><html><body><h1>Kayıt</h1><script>location.replace('sayfa-bulunamadi')</script></body></html>`,
    )
    overrides.set(
      'sayfa-bulunamadi',
      '<!doctype html><html><body><h1>Aradığınız sayfa bulunamadı</h1></body></html>',
    )
    const callsBefore = h.calls.length
    const run = await h.waitFor(
      h.ctx.runs.create({ ...app, environment: 'development', pages: ['egt-kayit'] }).id,
    )
    const events = listEvents(h.ctx.db, run.id)
    expect(run.status).toBe('bitti')
    expect(
      events.some((e) => e.type === 'hata' && e.message.includes('"sayfa-bulunamadi" sayfasına yönlendirdi')),
    ).toBe(true)
    expect(events.some((e) => e.type === 'sayfa-bitti')).toBe(true)
    expect(events.some((e) => e.type === 'plan' || e.type === 'bulgu')).toBe(false)
    expect(h.calls.length).toBe(callsBefore)
  })

  it('tarayıcı onay penceresi modele ve akışa söylenir (düğme "tepkisiz" sanılmaz); koşu kare kare kaydedilir', async () => {
    overrides.set(
      'egt-form',
      `<!doctype html><html lang="tr"><body><h1>Yeni gösterge</h1><input placeholder="Ad"><button id="v">Vazgeç</button>
      <script>document.getElementById('v').onclick = () => {
        if (confirm('Kaydedilmemiş değişiklikler var. Çıkılsın mı?')) location.href = 'egt-temiz'
      }</script></body></html>`,
    )
    const run = await h.waitFor(
      h.ctx.runs.create({ ...app, environment: 'development', pages: ['egt-form'] }).id,
    )
    expect(run.status).toBe('bitti')
    const events = listEvents(h.ctx.db, run.id)
    const click = events.find((e) => e.type === 'adim' && e.outcome.startsWith('Tıklandı: "Vazgeç"'))
    if (click?.type !== 'adim') throw new Error('Vazgeç tıklaması akışta yok')
    expect(click.outcome).toContain(
      'onay penceresi ("Kaydedilmemiş değişiklikler var. Çıkılsın mı?") → kabul edildi',
    )
    // Model aynı notu tıklamanın sonucunda okur; çıkış onayı kabul edildiği için sayfadan çıkılır (formda kilitlenmez).
    const after = h.calls.find(
      (c) => c.tools && JSON.stringify(c.messages.at(-1)).includes('Tıklandı: \\"Vazgeç\\"'),
    )!
    expect(JSON.stringify(after.messages.at(-1))).toContain('Tarayıcı penceresi açıldı')
    expect(JSON.stringify(after.messages.at(-1))).toContain('/dev/qm/web/egt-temiz')
    // İşlem anı kayıtla hizalı: tıklama, adım olayından önce yapıldı.
    expect(click.actAt).toBeLessThanOrEqual(Date.parse(click.at))
    // Kayıt: ekran yayınının kareleri koşu klasöründe, adlarında alındıkları an.
    const frames = readdirSync(join(h.ctx.config.dataDir, 'runs', run.id, 'kare'))
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((f) => /^\d{13}\.jpg$/.test(f))).toBe(true)
  })

  it('uygulama oturumu saklanır: ikinci koşu yeniden giriş yapmaz, kullanıcı değişince yeniden girilir', async () => {
    saveAppUser(h.ctx.db, app, APP_USER.identifier, APP_USER.password)
    const stateFile = appSessionFile(h.ctx.config.dataDir, app, APP_USER.identifier)
    const runOnce = async (user?: string) => {
      const run = await h.waitFor(
        h.ctx.runs.create({
          ...app,
          environment: 'development',
          pages: ['gizli'],
          options: { maxTasks: 1, maxSteps: 3, user: user ?? null },
        }).id,
      )
      const message = listEvents(h.ctx.db, run.id).find((e) => e.type === 'bilgi')
      return { run, message: message?.type === 'bilgi' ? message.message : '' }
    }
    try {
      expect((await runOnce()).message).toMatch(
        /giriş ekranından girildi \(onur@ornek.test\); oturum sonraki koşular için saklandı/,
      )
      expect(h.site.signIns()).toBe(1)
      // Saklanan dosyada uygulama çerezi var, platform jetonu yok.
      const stored = readFileSync(stateFile, 'utf8')
      expect(stored).toContain('SY_Token')
      expect(stored).not.toContain('NG_AccessToken')

      expect((await runOnce(APP_USER.identifier)).message).toMatch(/Saklanan uygulama oturumu sürdürüldü/)
      expect(h.site.signIns()).toBe(1)

      // Parola değişince saklanan oturum silinir; sonraki koşu yeniden girer.
      forgetAppSessions(h.ctx.config.dataDir, app, APP_USER.identifier)
      expect((await runOnce()).message).toMatch(/giriş ekranından girildi/)
      expect(h.site.signIns()).toBe(2)

      // Bozuk oturum dosyası koşuyu düşürmez: silinir, yeniden girilir.
      writeFileSync(stateFile, '{yarım')
      const recovered = await runOnce()
      expect(recovered.run.status).toBe('bitti')
      expect(recovered.message).toMatch(/giriş ekranından girildi/)
      expect(h.site.signIns()).toBe(3)

      // Hesabı olmayan kullanıcı istenirse koşu modelsiz durur, nedeni yazılır.
      const callsBefore = h.calls.length
      const missing = await runOnce('yok@ornek.test')
      expect(missing.run.status).toBe('hata')
      expect(missing.run.error).toContain('"yok@ornek.test" için kayıtlı hesap yok')
      expect(h.calls.length).toBe(callsBefore)
    } finally {
      deleteAppUser(h.ctx.db, app, APP_USER.identifier)
      forgetAppSessions(h.ctx.config.dataDir, app)
    }
  })

  it('hesabı olmayan kişiye süper girişle geçilir, koşu sonunda kapatılır; saklanan oturum asıl hesabın kalır', async () => {
    saveAppUser(h.ctx.db, app, APP_USER.identifier, APP_USER.password)
    const identityFile = join(h.ctx.config.memoryDir, 'apps', 'qm', 'web', 'kimlik.md')
    mkdirSync(join(h.ctx.config.memoryDir, 'apps', 'qm', 'web'), { recursive: true })
    writeFileSync(
      identityFile,
      [
        '---',
        'super_giris_baslat: sy-super-login-start',
        'super_giris_bitir: sy-super-login-stop',
        'super_giris_hedef_alani: target_id',
        'super_giris_kullanicilar: dashboard/sg_kullanici',
        'super_giris_sayfa: dashboard',
        'super_giris_jeton_alani: token',
        'super_giris_cerez: SY_Token',
        'super_giris_govde_page: dashboard',
        '---',
        'Test',
      ].join('\n'),
    )
    const runAs = async (user: string) => {
      const run = await h.waitFor(
        h.ctx.runs.create({
          ...app,
          environment: 'development',
          pages: ['gizli'],
          options: { maxTasks: 1, maxSteps: 3, user },
        }).id,
      )
      return {
        run,
        messages: listEvents(h.ctx.db, run.id).flatMap((e) => ('message' in e ? [e.message] : [])),
      }
    }
    try {
      const switched = await runAs('çetin test')
      expect(switched.run.status).toBe('bitti')
      expect(switched.messages).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Süper girişle Çetin Test kişisine geçildi \(asıl hesap: onur@ornek.test\)/),
          'Süper giriş kapatıldı.',
        ]),
      )
      expect(h.site.superStarts).toEqual(['k1'])
      expect(h.site.superStops()).toBe(1)
      // Sayfa gerçekten süper giriş jetonuyla (Çetin olarak) gezildi.
      expect(h.site.pageViews).toContain('super-k1')
      // Saklanan oturum süper girişin değil asıl hesabın jetonunu taşır.
      const stored = readFileSync(appSessionFile(h.ctx.config.dataDir, app, APP_USER.identifier), 'utf8')
      expect(stored).toContain('gecerli')
      expect(stored).not.toContain('super-k1')

      // Listede olmayan kişi: koşu modelsiz durur, süper giriş açılmaz.
      const callsBefore = h.calls.length
      const unknown = await runAs('Bilinmeyen Kişi')
      expect(unknown.run.status).toBe('hata')
      expect(unknown.run.error).toContain('"Bilinmeyen Kişi" süper giriş listesinde yok')
      expect(h.site.superStarts).toEqual(['k1'])
      expect(h.calls.length).toBe(callsBefore)
    } finally {
      rmSync(identityFile, { force: true })
      deleteAppUser(h.ctx.db, app, APP_USER.identifier)
      forgetAppSessions(h.ctx.config.dataDir, app)
    }
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
  it('kullanıcının talimatı planlayıcıya ve gezgine, eklediği dosyalar yalnız planlayıcıya gider', async () => {
    const image = saveAttachment(
      h.ctx.config.dataDir,
      new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
      'ekran.png',
    )
    const sheet = saveAttachment(
      h.ctx.config.dataDir,
      new TextEncoder().encode('no;bulgu\n7;Toplam tutmuyor'),
      'musteri.csv',
    )
    const data = Buffer.from([137, 80, 78, 71, 1, 2, 3]).toString('base64')
    const before = h.calls.length
    const run = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-temiz'],
        options: {
          maxTasks: 2,
          maxSteps: 3,
          brief: '  Kaydet düğmesinin yerine bak  ',
          attachments: [image, sheet, 'yok.png'],
        },
      }).id,
    )
    expect(run.options).toMatchObject({ brief: 'Kaydet düğmesinin yerine bak', attachments: [image, sheet] })
    const calls = h.calls.slice(before).map((c) => JSON.stringify(c.messages))
    const planner = calls.filter((c) => c.includes('KULLANICININ TALİMATI'))
    expect(planner).toHaveLength(1)
    expect(planner[0]).toContain('Kaydet düğmesinin yerine bak')
    expect(planner[0]).toContain(data)
    expect(planner[0]).toContain('Ek: musteri.csv')
    expect(planner[0]).toContain('7;Toplam tutmuyor')
    const explorer = calls.filter((c) => c.includes('GÖREV: '))
    expect(explorer.length).toBeGreaterThan(0)
    expect(
      explorer.every((c) => c.includes('Kullanıcının bu koşu için talimatı: Kaydet düğmesinin yerine bak')),
    ).toBe(true)
    expect(explorer.some((c) => c.includes(data) || c.includes('7;Toplam tutmuyor'))).toBe(false)

    const single = h.calls.length
    await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-temiz'],
        options: { maxTasks: 1, maxSteps: 3, brief: 'Tarih alanını dene' },
      }).id,
    )
    const singleCalls = h.calls.slice(single).map((c) => JSON.stringify(c.messages))
    expect(singleCalls.some((c) => c.includes('KULLANICININ TALİMATI'))).toBe(false)
    expect(singleCalls.find((c) => c.includes('GÖREV: '))).toContain(
      'talimatını önce karşıla: Tarih alanını dene',
    )
  })
})
