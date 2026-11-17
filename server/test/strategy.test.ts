import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFINITION_PAGE, type RunStrategy } from '@argus/shared'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { normalizeItems } from '../src/agent/strategist.ts'
import { getRun, listEvents, listRuns } from '../src/db/runs.ts'
import { startHarness, type Harness, type Move, type Script } from './support/harness.ts'
import { overrides } from './support/site.ts'

/**
 * Anla adımı (girdili koşu): Argus bulgu uygulamasıdır. Güçlü model tanımları okuyarak test planını yazar; tanım kalemleri
 * tarayıcısız, platform okumasıyla test edilir, tanımdaki hata ve tutarsızlık kaynağıyla bulgu olarak kaydedilir ve
 * sonuçlar ekran kalemlerine geçer; gözetmen kaçmış bulguyu kaydeder, kapsam raporunu yazar; ekran kalemleri seçilen sayfada birer görevdir. Yalnız
 * tanım kalemi olan koşu tarayıcı açmadan biter. Strateji yazılamazsa koşu nedenini söyleyerek durur; ne sayfa ne
 * girdi varsa koşu açılmaz.
 */
const app = { project: 'qm', application: 'web' }
const read = (girdi: string): Move => ({
  name: 'platform_oku',
  input: { arac: 'workflow_get', girdi, neden: 'Kalibrasyon kuralı' },
})
const item = (baslik: string, kaynak: string, sayfa: string) => ({
  baslik,
  amac: `${baslik} amacı`,
  kaynak,
  sayfa,
  tam_tarama: false,
})
let plan: (turn: number) => Move = () => ({ name: 'plani_yaz', input: {} })
const finding = (baslik: string, kaynak: string) => ({
  tur: 'not',
  baslik,
  senaryo: 'Kalibrasyon oturumu açılmadan dönem ilerletilir',
  beklenen: 'Kullanıcı uyarılır ya da ilerletme engellenir',
  gozlenen: 'Uyarı yok, ilerletme serbest',
  kaynak,
})
const covered = () => ({
  durum: 'kismen',
  ozet: 'Kural tanımdan test edildi; aşama ilerletme veri yazdığı için ekranda denenmedi.',
  test_edilen: ['Kalibrasyonsuz ilerleme (tanım)'],
  test_edilemeyen: ['Aşamayı ilerletmek — veri yazar'],
  kacmis_bulgular: [
    finding('Kalibrasyonsuz yayında ham puan kullanılıyor', 'workflow_get donem, steps[1].publish'),
  ],
  ek_kalemler: [],
})
let verdict: (prompt: string) => unknown = covered
let defineOverride: ((conversation: string, turn: number) => Move | undefined) | undefined
const script: Script = {
  strategy: (_, turn) => plan(turn),
  supervise: (prompt) => verdict(prompt),
  // Her tanım kalemi: tanımı okur, bulguyu kaynağıyla kaydeder, biter.
  define: (conversation, turn) =>
    defineOverride?.(conversation, turn) ??
    (turn % 3 === 1
      ? read('{"workflowId":"donem"}')
      : turn % 3 === 2
        ? {
            name: 'tanim_bulgusu',
            input: finding(
              'Kalibrasyon kullanıcı uyarılmadan atlanabiliyor',
              'workflow_get donem, steps[0].onFalse',
            ),
          }
        : {
            name: 'kalemi_bitir',
            input: {
              ozet: 'Kalibrasyon kapalıysa Sonuç yayınına geçilir.',
              kanitlar: ['Kalibrasyon atlanır — workflow_get donem, steps[0].onFalse'],
              eksik: '',
            },
          }),
  plan: () => ({ ozet: 'Liste', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
  task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Ekranda teyit edildi.', eksik: '' } }),
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
})
afterAll(async () => {
  await h.close()
})
beforeEach(() => {
  verdict = covered
})

const start = (brief: string | null) =>
  h.ctx.runs.create({
    ...app,
    environment: 'development',
    pages: [],
    options: { maxTasks: 1, maxSteps: 3, brief },
  })
const strategyOf = (runId: string) =>
  listEvents(h.ctx.db, runId).flatMap((e) => (e.type === 'strateji' ? [e.strategy] : []))[0] as RunStrategy
const plani = (kalemler: ReturnType<typeof item>[]) => ({
  name: 'plani_yaz',
  input: {
    tur: 'akis',
    anlasilan: 'Kalibrasyon aşamasının atlanması',
    senaryolar: ['Kalibrasyon oturumu açılmadan ilerletme: uyarı ya da engel beklenir'],
    bitti_olcutu: 'Senaryo tanımdan ve ekrandan test edilir.',
    bilinenler: ['Kalibrasyon koşullu — workflow_get donem'],
    yapilamayan: ['Dönemi ilerletmek yazma ister.'],
    kalemler,
  },
})

describe('vaka hedefi', () => {
  it('beklenen sonuç ve dayanağı ayrı satırlarda hedefe girer (panel beklenen sonucu dayanaksız gösterir)', () => {
    const [item] = normalizeItems(
      [
        {
          baslik: 'Yetki',
          amac: 'Başkasının cevabını yazmayı dene',
          beklenen: '403 dönmeli',
          dayanak: 'workflow_get anket, checkOwner adımı',
          kaynak: 'tanim',
          sayfa: '',
          tam_tarama: false,
        },
      ],
      [],
    )
    expect(item!.goal).toBe(
      'Başkasının cevabını yazmayı dene\nBeklenen: 403 dönmeli\nDayanak: workflow_get anket, checkOwner adımı',
    )
  })
})

describe('anla adımı', () => {
  it('tanımı okuyup test planı yazar; tanım kalemi tarayıcısız test edilir, bulgusu kaydedilir, sonucu ekran kalemine geçer', async () => {
    plan = (turn) =>
      turn === 1
        ? read('{"workflowId":"donem"}')
        : plani([
            item('Kalibrasyon kuralı', 'tanim', ''),
            item('Dönem ekranında teyit', 'ikisi', 'egt-temiz'),
            item('Olmayan sayfa', 'ekran', 'olmayan-sayfa'),
          ])
    const before = h.calls.length
    const done = await h.waitFor(start('Kalibrasyon açılmazsa ne olur, test et').id)
    expect(done.status).toBe('bitti')
    // Sayfalar stratejinin ekran kalemlerinden: katalog dışı sayfa tanım kalemine döndü.
    expect(getRun(h.ctx.db, done.id)!.pages).toEqual(['egt-temiz'])
    expect(strategyOf(done.id).items.map((i) => [i.title, i.source, i.page])).toEqual([
      ['Kalibrasyon kuralı', 'tanim', null],
      ['Dönem ekranında teyit', 'ikisi', 'egt-temiz'],
      ['Olmayan sayfa', 'tanim', null],
    ])
    const events = listEvents(h.ctx.db, done.id)
    const definition = events.filter((e) => e.page === DEFINITION_PAGE)
    expect(definition.filter((e) => e.type === 'gorev-bitti')).toHaveLength(2)
    expect(
      definition.some((e) => e.type === 'adim' && e.outcome === 'Platformdan okundu: workflow_get'),
    ).toBe(true)
    // Planlayıcı (strateji) yazmaz: yalnız okuma aracı alır; tanım kalemini yürüten araştırmacı yazabilir.
    const toolNames = (c: (typeof h.calls)[number]) =>
      ((c.tools ?? []) as Array<{ name: string }>).map((t) => t.name)
    const planner = h.calls.slice(before).find((c) => toolNames(c).includes('plani_yaz'))!
    expect(toolNames(planner)).not.toContain('platform_yaz')
    const investigator = h.calls.slice(before).find((c) => toolNames(c).includes('kalemi_bitir'))!
    expect(toolNames(investigator)).toContain('platform_yaz')
    // Ekran kalemi tek görev oldu (sayfa planı çağrılmadı); tanım sonuçları ve "önce tanım" yönergesi isteminde.
    const calls = h.calls.slice(before).map((c) => JSON.stringify(c.messages))
    expect(calls.some((c) => c.includes('Bu sayfayı eksiksiz test etmek için'))).toBe(false)
    const explorerCall = h.calls
      .slice(before)
      .find((c) => JSON.stringify(c.messages).includes('GÖREV: Dönem ekranında teyit'))!
    const explorer = JSON.stringify(explorerCall.messages)
    // Tanım sonuçları sayfanın sabit bağlamında (talimat).
    expect(JSON.stringify(explorerCall.system)).toContain('Kalibrasyon kapalıysa Sonuç yayınına geçilir.')
    expect(explorer).toContain('Önce ilgili tanımı platform_oku ile oku')
    // Maliyet politikası: akış sorusunun teyit ekranında göz çalışmaz (gözün genel bulguları soruya katkı vermez).
    expect(calls.some((c) => c.includes('GÖZ GÖREVİ'))).toBe(false)
    expect(events.some((e) => e.type === 'bilgi' && e.message.startsWith('Göz bu sayfada kapalı'))).toBe(true)
    // Bütün model çağrıları rolüyle yerel izde; platform okumaları da.
    const trace = readFileSync(join(h.ctx.config.dataDir, 'runs', done.id, 'iz', 'iz.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { t: string; role: string | null })
    expect(trace.filter((l) => l.t === 'model').every((l) => l.role)).toBe(true)
    // Aynı okuma (strateji ve iki tanım kaleminde aynı girdi) platforma bir kez gider; sonrası okuyucunun belleğinden.
    expect(trace.filter((l) => l.t === 'mcp')).toHaveLength(1)
    expect(
      events.filter((e) => e.type === 'adim' && e.outcome === 'Platformdan okundu: workflow_get').length,
    ).toBeGreaterThanOrEqual(3)
    // Tanım bulgusu kaynağıyla kaydedildi (görüntüsüz); gözetmen kalem sonuçlarında geçen kaçmış bulguyu da kaydetti.
    const found = h.ctx.issues.list({ app, runId: done.id })
    expect(found.map((i) => i.title)).toEqual(
      expect.arrayContaining([
        'Kalibrasyon kullanıcı uyarılmadan atlanabiliyor',
        'Kalibrasyonsuz yayında ham puan kullanılıyor',
      ]),
    )
    const detail = h.ctx.issues.detail(found.find((i) => i.title.startsWith('Kalibrasyon kullanıcı'))!.id)
    expect(detail.occurrences[0]).toMatchObject({ page: DEFINITION_PAGE, shot: null, kind: 'not' })
    // Çalıştırılarak kanıtlanmayan tanım iddiası şüphedir (not), kanıt türü yazılır.
    expect(detail.occurrences[0]!.observed).toContain(
      'Tanımdan çıkarım, çalıştırılarak doğrulanmadı; kaynak: workflow_get donem, steps[0].onFalse',
    )
    expect(
      events.filter((e) => e.type === 'bulgu' && e.page === DEFINITION_PAGE).length,
    ).toBeGreaterThanOrEqual(2)
    // Gözetmen tanım ve ekran sonuçlarını görüp kapsam raporunu yazdı; rapor koşunun kaydında ve akışta.
    const supervisor = calls.find((c) => c.includes('GÖZETMEN GÖREVİ'))!
    expect(supervisor).toContain('Tanım — Kalibrasyon kuralı: Kalibrasyon kapalıysa Sonuç yayınına geçilir.')
    expect(supervisor).toContain('Ekran — egt-temiz:')
    expect(supervisor).toContain('Kalibrasyon kullanıcı uyarılmadan atlanabiliyor')
    expect(supervisor).not.toContain('Bu son tur')
    expect(getRun(h.ctx.db, done.id)!.coverage).toEqual({
      status: 'kismen',
      summary: 'Kural tanımdan test edildi; aşama ilerletme veri yazdığı için ekranda denenmedi.',
      tested: ['Kalibrasyonsuz ilerleme (tanım)'],
      untested: ['Aşamayı ilerletmek — veri yazar'],
      outOfScope: [],
    })
    expect(events.some((e) => e.type === 'kapsam')).toBe(true)
  })

  it('gözetmen kapsam boşluğu bulursa ek kalem ister; koşu onu yürütüp son turda kapsam raporunu yazar', async () => {
    plan = () => plani([item('Kalibrasyon kuralı', 'tanim', '')])
    const prompts: string[] = []
    verdict = (prompt) => {
      prompts.push(prompt)
      return prompts.length === 1
        ? {
            ...covered(),
            durum: 'eksik',
            kacmis_bulgular: [],
            ek_kalemler: [item('Onay akışı', 'tanim', '')],
          }
        : {
            ...covered(),
            ozet: 'Onay akışı tanımdan test edildi.',
            kacmis_bulgular: [],
            ek_kalemler: [item('Bir tur daha', 'tanim', '')],
          }
    }
    const done = await h.waitFor(start('Kalibrasyon ve onay akışını test et').id)
    expect(done.status).toBe('bitti')
    const events = listEvents(h.ctx.db, done.id)
    expect(events.filter((e) => e.type === 'gorev-bitti' && e.page === DEFINITION_PAGE)).toHaveLength(2)
    expect(
      events.some((e) => e.type === 'bilgi' && e.message.includes('1 ek kalem istedi: Onay akışı')),
    ).toBe(true)
    // İkinci tur son turdur: ek kalem istense de yürütülmez.
    expect(prompts).toHaveLength(2)
    expect(prompts[1]).toContain('Bu son tur')
    expect(prompts[1]).toContain('Tanım — Onay akışı:')
    expect(getRun(h.ctx.db, done.id)!.coverage).toMatchObject({
      status: 'kismen',
      summary: 'Onay akışı tanımdan test edildi.',
    })
  })

  it('kayıt sayfasındaki kalem, sayfanın yönlendirdiği listede ilgili kaydı açarak sürdürülür', async () => {
    overrides.set(
      'egt-sorunlu',
      `<!doctype html><html><body><h1>Kayıt</h1><script>location.replace('egt-liste')</script></body></html>`,
    )
    plan = () => plani([item('Dönem detayında aşama', 'ekran', 'egt-sorunlu')])
    const before = h.calls.length
    const done = await h.waitFor(start('Dönem detayında aşamayı kontrol et').id)
    overrides.delete('egt-sorunlu')
    expect(done.status).toBe('bitti')
    const events = listEvents(h.ctx.db, done.id)
    expect(
      events.some(
        (e) =>
          e.type === 'bilgi' &&
          e.message ===
            'egt-sorunlu bir kayıt sayfası; kalemleri egt-liste sayfasında ilgili kaydı açarak sürdürülüyor.',
      ),
    ).toBe(true)
    const explorer = h.calls
      .slice(before)
      .map((c) => JSON.stringify([c.system, c.messages]))
      .find((c) => c.includes('GÖREV: Dönem detayında aşama'))!
    expect(explorer).toContain('Sayfa: egt-liste')
    expect(explorer).toContain('Hedef \\"egt-sorunlu\\" bir kayıt sayfası')
  })

  it('sayfa koşuda yeniden açılınca bilinen sorun ikinci kez kaydedilmez (KOŞU ölçümü: aynı 20 sorun 3-4 kez listelendi)', async () => {
    const earlier = listRuns(h.ctx.db)[0]!.id
    h.ctx.issues.record({
      app,
      runId: earlier,
      page: 'egt-liste',
      phase: 'acilis',
      key: 'yz:toplam-bilinen',
      title: 'Toplam bilinen sorun',
      kind: 'tutarsizlik',
      source: 'yz',
      scenario: 'Listeyi aç',
      expected: 'Toplam satırla tutmalı',
      observed: 'Toplam 5, tabloda 3 satır',
      quote: 'Toplam: 5 kayıt',
      shot: null,
      box: null,
      rules: [],
      verified: true,
      suppressedByRule: null,
    })
    plan = () => plani([{ ...item('Liste bakışı', '', 'egt-liste'), tam_tarama: true }])
    verdict = (prompt) =>
      prompt.includes('Bu son tur')
        ? { ...covered(), kacmis_bulgular: [] }
        : {
            ...covered(),
            durum: 'eksik',
            kacmis_bulgular: [],
            ek_kalemler: [item('Liste ikinci bakış', '', 'egt-liste')],
          }
    const done = await h.waitFor(start('Liste toplamını test et').id)
    expect(done.status).toBe('bitti')
    // Sayfa iki kez açıldı (ek kalem), sorun yalnız ilk açılışta modelsiz doğrulandı.
    expect(listEvents(h.ctx.db, done.id).filter((e) => e.type === 'sayfa-basladi')).toHaveLength(2)
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:toplam-bilinen')!
    expect(h.ctx.issues.detail(issue.id).occurrences.filter((o) => o.runId === done.id)).toHaveLength(1)
    // Aynı koşuda aynı sayfada yeniden bildirilen (göz, yargıç) bilinen sorun ikinci görünüm olmaz; akışa da düşmez.
    const again = h.ctx.issues.record({
      app,
      runId: done.id,
      page: 'egt-liste',
      phase: 'gorev',
      key: 'yz:toplam-bilinen',
      title: 'Toplam bilinen sorun',
      kind: 'tutarsizlik',
      source: 'yz',
      scenario: 'Listeyi aç',
      expected: 'Toplam satırla tutmalı',
      observed: 'Toplam 5, tabloda 3 satır',
      quote: 'Toplam: 5 kayıt',
      shot: null,
      box: null,
      rules: [],
      verified: true,
      suppressedByRule: null,
    })
    expect(again.duplicate).toBe(true)
    expect(h.ctx.issues.detail(issue.id).occurrences.filter((o) => o.runId === done.id)).toHaveLength(1)
  })

  it('aynı kök nedenli tanım bulgusu farklı başlıkla gelse de bilinen anahtarla tek soruna eklenir (KOŞU V11: aynı bulgu 4 sorun oldu)', async () => {
    plan = () => plani([item('Oturum açma', 'tanim', ''), item('Oturum kuralı', 'tanim', '')])
    const second: string[] = []
    defineOverride = (conversation, turn) => {
      const step = turn % 3
      const first = conversation.includes('TANIM KALEMİ: Oturum açma')
      if (!first && step === 1) second.push(conversation)
      if (step === 1) return read('{"workflowId":"donem"}')
      if (step === 2)
        return {
          name: 'tanim_bulgusu',
          input: {
            ...finding(
              first ? 'İkinci açık oturum engellenmiyor' : 'Aynı döneme birden çok oturum açılabiliyor',
              'workflow_get donem',
            ),
            anahtar: first ? '' : 'yz:ikinci-acik-oturum-engellenmiyor',
            ...(first ? { tur: 'tutarsizlik', dogrulama: 'calistirildi', onem: 'S1' } : {}),
          },
        }
      return { name: 'kalemi_bitir', input: { ozet: 'Bakıldı.', kanitlar: [], eksik: '' } }
    }
    verdict = () => ({ ...covered(), kacmis_bulgular: [] })
    const done = await h.waitFor(start('Oturum açma kuralını test et').id)
    defineOverride = undefined
    expect(done.status).toBe('bitti')
    // İkinci kalem birincinin kaydettiği sorunu anahtarıyla gördü ve aynı soruna ekledi.
    expect(second.join('\n')).toContain(
      'yz:ikinci-acik-oturum-engellenmiyor — İkinci açık oturum engellenmiyor',
    )
    const keys = h.ctx.issues.list({ app, runId: done.id }).map((i) => i.key)
    expect(keys.filter((k) => k.includes('oturum'))).toEqual(['yz:ikinci-acik-oturum-engellenmiyor'])
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:ikinci-acik-oturum-engellenmiyor')!
    // Çalıştırılarak kanıtlanan bulgu türünü korur.
    expect(h.ctx.issues.detail(issue.id).occurrences[0]).toMatchObject({
      kind: 'tutarsizlik',
      severity: 'S1',
    })
    // Sorunun önemi en ağır görünümündendir; liste önce kritikleri gösterir.
    expect(issue.severity).toBe('S1')
    expect(h.ctx.issues.list({ app })[0]!.severity).toBe('S1')
    expect(h.ctx.issues.detail(issue.id).occurrences[0]!.observed).toContain('Çalıştırılarak doğrulandı')
    // İkinci kalemin bulgusu aynı soruna eklendi; aynı koşuda aynı sayfada ikinci görünüm yazılmaz.
    expect(h.ctx.issues.detail(issue.id).occurrences.filter((o) => o.runId === done.id)).toHaveLength(1)
  })

  it('test yöntemleri: planlayıcı dizini görür, seçilenler ve her koşu yüklenen talimata girer; akış testinde göz kapalı', async () => {
    const dir = join(h.ctx.config.memoryDir, 'brain', 'test')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'genel.md'),
      '---\nkimlik: genel\naciklama: Ortak ilkeler\nher_kosu: evet\n---\nGENEL YÖNTEM GÖVDESİ\n',
    )
    writeFileSync(join(dir, 'akis.md'), '---\nkimlik: akis\naciklama: Akış testi\n---\nAKIŞ YÖNTEM GÖVDESİ\n')
    writeFileSync(
      join(dir, 'arayuz.md'),
      '---\nkimlik: arayuz\naciklama: Arayüz taraması\n---\nARAYÜZ YÖNTEM GÖVDESİ\n',
    )
    try {
      plan = () => ({
        name: 'plani_yaz',
        input: {
          ...plani([item('Kural', 'tanim', ''), item('Ekranda teyit', 'ikisi', 'egt-liste')]).input,
          yontemler: ['akis'],
        },
      })
      const before = h.calls.length
      const done = await h.waitFor(start('Kayıt açmayı basitçe test et').id)
      expect(done.status).toBe('bitti')
      const calls = h.calls.slice(before)
      const text = (c: (typeof calls)[number]) => JSON.stringify({ system: c.system, messages: c.messages })
      // Planlayıcı yalnız dizini görür (gövdeleri değil).
      const planner = text(calls.find((c) => text(c).includes('TEST YÖNTEMLERİ'))!)
      expect(planner).toContain('- akis — Akış testi')
      expect(planner).not.toContain('AKIŞ YÖNTEM GÖVDESİ')
      // Araştırmacı ve gezgin seçilen ve her koşu yüklenen yöntemleri talimatında görür; seçilmeyen girmez.
      for (const marker of ['TANIM KALEMİ', 'GÖREV: Ekranda teyit']) {
        const call = text(calls.find((c) => text(c).includes(marker))!)
        expect(call).toContain('GENEL YÖNTEM GÖVDESİ')
        expect(call).toContain('AKIŞ YÖNTEM GÖVDESİ')
        expect(call).not.toContain('ARAYÜZ YÖNTEM GÖVDESİ')
      }
      const info = listEvents(h.ctx.db, done.id).flatMap((e) => (e.type === 'bilgi' ? [e.message] : []))
      expect(info).toContain('Test yöntemleri: genel, akis.')
      expect(info.some((m) => m.startsWith('Göz bu sayfada kapalı: arayüz yöntemi seçilmedi'))).toBe(true)
      expect(calls.some((c) => text(c).includes('GÖZ GÖREVİ'))).toBe(false)
      expect(strategyOf(done.id).guides).toEqual(['akis'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('yalnız tanım kalemi olan koşu tarayıcı açmadan biter', async () => {
    plan = () => plani([item('Kalibrasyon kuralı', 'tanim', '')])
    const done = await h.waitFor(start('Kalibrasyon kuralı nedir?').id)
    expect(done.status).toBe('bitti')
    expect(done.pages).toEqual([])
    const events = listEvents(h.ctx.db, done.id)
    expect(events.some((e) => e.type === 'bilgi' && e.message.includes('girildi'))).toBe(false)
    expect(events.filter((e) => e.type === 'gorev-bitti' && e.page === DEFINITION_PAGE)).toHaveLength(1)
  })

  it('strateji yazılamazsa koşu nedenini söyleyerek durur', async () => {
    plan = () => ({ name: 'platform_arac', input: { arac: 'workflow_get', neden: 'Bak' } })
    const done = await h.waitFor(start('Muhasebe raporlarını test et').id)
    expect(done.status).toBe('hata')
    expect(done.error).toContain('stratejisi yazılamadı')
  })

  it('ne sayfa ne girdi varsa koşu açılmaz', () => {
    expect(() => start('  ')).toThrow('Sayfa seçin ya da girdi yazın.')
  })
})
