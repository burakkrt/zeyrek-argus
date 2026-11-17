import type { RunStrategy } from '@argus/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness, type Move } from './support/harness.ts'

/**
 * Kayıtlı vakalar ve yayın kapısı: çalıştırılarak kanıtlanan bulgu adımlarıyla saklanır; yeniden doğrulama koşusu
 * planlamadan vakayı tekrar kurar, bulgu yoksa sorun "düzeldi" olur. Yayın kapısı ortam farkını planlayıcıya verir,
 * kayıtlı vakaları ekler ve kanıtlı S1/S2 varsa kapıyı kapatır.
 */
const app = { project: 'qm', application: 'web' }
const KEY = 'yz:kalibrasyon-atlaniyor'
let fixed = false
let nextPlan: Move | null = null
let askExtra = false

const finding = {
  tur: 'kesin',
  onem: 'S2',
  baslik: 'Kalibrasyon atlanıyor',
  senaryo: 'Kalibrasyon kapalı dönemi ilerlet',
  beklenen: 'İlerletme engellenir',
  gozlenen: 'İlerletme serbest',
  kaynak: 'workflow_get donem → steps[0].onFalse',
  dogrulama: 'calistirildi',
  anahtar: '',
}
const plani: Move = {
  name: 'plani_yaz',
  input: {
    tur: 'kural',
    anlasilan: 'Kalibrasyon kuralı',
    senaryolar: ['Kalibrasyonsuz ilerletme engellenmeli'],
    bitti_olcutu: 'Kural çalıştırılır.',
    bilinenler: [],
    yapilamayan: [],
    yontemler: [],
    kalemler: [
      {
        baslik: 'Kalibrasyonsuz ilerletme',
        amac: 'Kuralı çalıştır',
        beklenen: 'Engellenir — workflow_get donem',
        kaynak: 'tanim',
        sayfa: '',
        tam_tarama: false,
        bagimsiz: true,
      },
    ],
  },
}

let h: Harness
beforeAll(async () => {
  h = await startHarness({
    strategy: () => nextPlan ?? plani,
    supervise: () => ({
      durum: 'kismen',
      ozet: 'Kapsam',
      test_edilen: [],
      test_edilemeyen: [],
      kacmis_bulgular: [],
      ek_kalemler: askExtra
        ? [
            {
              baslik: 'Ek vaka',
              amac: 'Ek',
              beklenen: '-',
              kaynak: 'tanim',
              sayfa: '',
              tam_tarama: false,
              bagimsiz: true,
            },
          ]
        : [],
    }),
    // Tur sayacı koşular arası süreceği için adım konuşmadan seçilir: okuma sonucu yoksa oku, kayıt yoksa bulguyu yaz.
    define: (conversation) => {
      const replay = conversation.includes('Yeniden doğrula:')
      if (conversation.includes('Veri kur') && !conversation.includes('"entityId"'))
        return {
          name: 'platform_yaz',
          input: {
            arac: 'row_create',
            girdi: '{"entityId":"anket","values":{"ad":"Argus test"}}',
            neden: 'Veri',
          },
        }
      if (conversation.includes('Veri kur') || conversation.includes('Koşu sonu temizlik'))
        return { name: 'kalemi_bitir', input: { ozet: 'Kayıt 7 bırakıldı.', kanitlar: [], eksik: '' } }
      if (!conversation.includes('Sonuç yayını'))
        return {
          name: 'platform_oku',
          input: { arac: 'workflow_get', girdi: '{"workflowId":"donem"}', neden: 'Kural' },
        }
      if (!conversation.includes('Kaydedildi (') && !(replay && fixed))
        return { name: 'tanim_bulgusu', input: { ...finding, anahtar: replay ? KEY : '' } }
      return {
        name: 'kalemi_bitir',
        input: {
          ozet: replay && fixed ? 'DÜZELDİ: ilerletme artık engelleniyor.' : 'Kural atlanıyor.',
          kanitlar: [],
          eksik: '',
        },
      }
    },
    plan: () => ({ ozet: 'Liste', gorevler: [] }),
    task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bitti.' } }),
  })
})
afterAll(async () => {
  await h.close()
})

const start = (mode: 'normal' | 'tekrar' | 'kapi', brief: string | null = null) =>
  h.ctx.runs.create({
    ...app,
    environment: 'development',
    pages: [],
    options: { maxTasks: 1, maxSteps: 3, brief, mode },
  })
const infos = (runId: string) =>
  listEvents(h.ctx.db, runId).flatMap((e) => (e.type === 'bilgi' ? [e.message] : []))

describe('kayıtlı vakalar', () => {
  it('yeniden doğrulanacak vaka yoksa tekrar koşusu açılmaz', () => {
    expect(() => start('tekrar')).toThrow(/kayıtlı vaka yok/)
  })

  it('çalıştırılarak kanıtlanan bulgu adımlarıyla saklanır; tekrar koşusu hâlâ varsa yeni görünüm yazar, yoksa kritik ve yüksek önemliyi kapatmaz, insana bildirir', async () => {
    await h.waitFor(start('normal', 'Kalibrasyon kuralını test et').id)
    const [recorded] = h.ctx.issues.recordedCases(app)
    expect(recorded).toMatchObject({ key: KEY, steps: [{ tool: 'workflow_get', write: false }] })

    const again = start('tekrar')
    await h.waitFor(again.id)
    const strategy = listEvents(h.ctx.db, again.id).flatMap((e) =>
      e.type === 'strateji' ? [e.strategy] : [],
    )[0] as RunStrategy
    expect(strategy.items).toEqual([expect.objectContaining({ caseKey: KEY, independent: true })])
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === KEY)!
    expect(h.ctx.issues.detail(issue.id).occurrences.some((o) => o.runId === again.id)).toBe(true)
    expect(h.ctx.issues.detail(issue.id).status).toBe('acik')

    fixed = true
    const third = start('tekrar')
    await h.waitFor(third.id)
    // S2: görülmese de kendiliğinden kapanmaz, insan onayı bekler.
    expect(h.ctx.issues.detail(issue.id).status).toBe('acik')
    expect(infos(third.id).some((m) => m.startsWith(`Kayıtlı vaka görülmedi (S2): ${KEY}.`))).toBe(true)
  })
})

describe('yayın kapısı', () => {
  it('ortam farkı planlayıcının isteğine girer; kanıtlı S2 bulgu kapıyı kapatır', async () => {
    fixed = false
    const before = h.calls.length
    const gate = start('kapi')
    await h.waitFor(gate.id)
    const planner = h.calls.slice(before).find((c) => JSON.stringify(c).includes('plani_yaz'))!
    expect(JSON.stringify(planner)).toContain('Yayın kapısı: development → production')
    expect(JSON.stringify(planner)).toContain('donem')
    expect(infos(gate.id).some((m) => m.startsWith('Yayın kapısı KAPALI'))).toBe(true)
  })
})

describe('koşu sonu temizliği', () => {
  it('tanım kalemi yazdıysa ve ekran kalemi varsa bırakılan kayıtlar ekrandan sonra silinir', async () => {
    nextPlan = {
      name: 'plani_yaz',
      input: {
        ...(plani.input as Record<string, unknown>),
        kalemler: [
          {
            baslik: 'Veri kur',
            amac: 'Veri kur',
            beklenen: '-',
            kaynak: 'tanim',
            sayfa: '',
            tam_tarama: false,
            bagimsiz: false,
          },
          {
            baslik: 'Listede gör',
            amac: 'Bak',
            beklenen: '-',
            kaynak: 'ekran',
            sayfa: 'egt-liste',
            tam_tarama: false,
            bagimsiz: false,
          },
        ],
      },
    }
    const run = start('normal', 'Listeyi test et')
    await h.waitFor(run.id)
    nextPlan = null
    const events = listEvents(h.ctx.db, run.id)
    const plans = events.flatMap((e) =>
      e.type === 'plan' && e.page === '@tanimlar' ? [e.tasks.map((t) => t.title)] : [],
    )
    expect(plans.at(-1)).toEqual(['Veri kur', 'Koşu sonu temizlik'])
    const order = events.flatMap((e) => (e.type === 'sayfa-basladi' ? [e.page] : []))
    expect(order.lastIndexOf('@tanimlar')).toBeGreaterThan(order.indexOf('egt-liste'))
  })
})

describe('kapsam', () => {
  it('kapsam süre ya da sayı sınırı koymaz: dar kapsamda da gözetmen ek kalem açar, ama yalnız istenen kapsamın içinde', async () => {
    askExtra = true
    const run = async (kapsam: string) => {
      nextPlan = { name: 'plani_yaz', input: { ...(plani.input as Record<string, unknown>), kapsam } }
      const before = h.calls.length
      const created = start('normal', 'Kalibrasyon atlanıyor mu bak')
      await h.waitFor(created.id)
      const supervisor = h.calls.slice(before).find((c) => JSON.stringify(c).includes('ek_kalemler'))
      return {
        extra: infos(created.id).some((m) => m.startsWith('Gözetmen kapsamı tamamlamak için')),
        narrow: JSON.stringify(supervisor).includes('İstek dar kapsamlı'),
        scope: infos(created.id).find((m) => m.startsWith('Kapsam:')),
      }
    }
    expect(await run('soru')).toEqual({ extra: true, narrow: true, scope: 'Kapsam: Soru; 1 kalem.' })
    expect(await run('tam')).toMatchObject({ extra: true, narrow: false })
    askExtra = false
    nextPlan = null
  })
})
