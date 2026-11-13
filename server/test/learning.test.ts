import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listProposals } from '../src/memory/proposals.ts'
import { startHarness, type Harness, type Script } from './support/harness.ts'

const app = { project: 'qm', application: 'web' }

const item = (over: Record<string, unknown>) => ({
  islem: 'ekle',
  id: 'x',
  kapsam: 'uygulama',
  tur: 'sorun',
  metin: 'x',
  desen: '',
  ilgili: [],
  gerekce: 'test',
  kaynak: [],
  ...over,
})

const script: Script = {
  plan: () => ({ ozet: 'Sayfa', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
  task: (conversation) =>
    conversation.includes('SORUN SAYMA')
      ? {
          name: 'bulgu_bildir',
          input: {
            tur: 'kesin',
            anahtar: 'tablo-kimlik',
            baslik: 'Tabloda kimlik görünüyor',
            senaryo: 'Listeyi aç',
            beklenen: '-',
            gozlenen: 'Sorumlu sütununda kimlik',
            alinti: '',
            ref: '',
            kurallar: [],
            bastiran_kural: 'kimlik-sutunu-normal',
          },
        }
      : { name: 'gorevi_bitir', input: { ozet: 'Bakıldı.' } },
  learn: (prompt) =>
    prompt.includes('Yeni kararlar')
      ? {
          oneriler: [
            item({
              id: 'tarih-filtresi-turkce',
              metin: 'Tarih filtreleri Türkçe biçimde (gg.aa.yyyy) olmalı.',
              kaynak: ['goz:guid'],
            }),
            item({
              id: 'kimlik-sutunu-normal',
              tur: 'sorun-degil',
              metin: 'Sorumlu sütununda kimlik görünmesi bulgu değildir.',
              kaynak: ['goz:guid'],
            }),
          ],
        }
      : {
          siniflar: { istek: 1, veri: 0, hata: 1 },
          oneriler: [item({ id: 'sapkali-harf', metin: 'Şapkalı harf kullanılmaz.', desen: '[âîû]' })],
        },
}

let h: Harness

beforeAll(async () => {
  h = await startHarness(script)
  // Bir koşu: sorun kayıtları oluşsun.
  await h.waitFor(
    h.ctx.runs.create({
      ...app,
      environment: 'development',
      pages: ['egt-liste'],
      options: { maxTasks: 1, maxSteps: 3 },
    }).id,
  )
})

afterAll(async () => {
  await h.close()
})

describe('öğrenme', () => {
  it('"sorun ara" kuralı kendiliğinden devreye girer, "sorun sayma" kuralı onay bekler; kaynakları izlenir', async () => {
    const guid = h.ctx.issues.list({ app }).find((i) => i.key === 'goz:guid')!
    h.ctx.issues.decide(guid.id, 'bulgu-degil', 'Burak', 'Sorumlu sütununda kimlik normal')
    const proposals = await h.ctx.learner.learnFromDecisions(app, 'Burak')
    expect(proposals.map((p) => `${p.rule.id}:${p.status}`)).toEqual([
      'tarih-filtresi-turkce:otomatik',
      'kimlik-sutunu-normal:bekliyor',
    ])

    const rules = h.ctx.memory.rules(app)
    expect(rules.find((r) => r.id === 'tarih-filtresi-turkce')).toMatchObject({
      state: 'onayli',
      sources: ['goz:guid'],
    })
    expect(rules.find((r) => r.id === 'kimlik-sutunu-normal')).toBeUndefined()
    expect(existsSync(join(h.ctx.config.memoryDir, 'apps/qm/web/rules/tarih-filtresi-turkce.md'))).toBe(true)

    // Öğrenilen kararlar bir daha ders çıkarıcıya gitmez.
    expect(h.ctx.learner.pendingDecisions(app)).toBe(0)
  })

  it('"sorun sayma" kuralı onaylanınca bastırma kaydı tutulur; kural emekliye ayrılınca bastırdığı sorun yeniden görünür', async () => {
    const pending = listProposals(h.ctx.db, { app, status: 'bekliyor' }).find(
      (p) => p.rule.id === 'kimlik-sutunu-normal',
    )!
    h.ctx.learner.accept(pending.id, 'Burak')
    expect(h.ctx.memory.rule(app, 'kimlik-sutunu-normal')).toMatchObject({
      state: 'onayli',
      type: 'sorun-degil',
    })

    await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 1, maxSteps: 3 },
      }).id,
    )
    expect(h.ctx.issues.list({ app }).some((i) => i.key === 'yz:tablo-kimlik')).toBe(false)
    const hidden = h.ctx.issues
      .list({ app, includeSuppressed: true })
      .find((i) => i.key === 'yz:tablo-kimlik')!
    expect(h.ctx.issues.detail(hidden.id).occurrences[0]).toMatchObject({
      outcome: 'bastirildi',
      reason: 'Kural gereği: kimlik-sutunu-normal',
    })

    h.ctx.learner.setRuleState(app, 'kimlik-sutunu-normal', 'emekli')
    expect(h.ctx.issues.list({ app }).some((i) => i.key === 'yz:tablo-kimlik')).toBe(true)
  })

  it('kendiliğinden devreye girmiş kural geri alınabilir; bakım aynı metinli kuralları birleştirmeyi önerir', async () => {
    const auto = listProposals(h.ctx.db, { app, status: 'otomatik' })[0]!
    h.ctx.learner.reject(auto.id)
    expect(h.ctx.memory.rule(app, 'tarih-filtresi-turkce')).toMatchObject({ state: 'emekli' })

    const base = {
      scope: 'uygulama' as const,
      type: 'sorun' as const,
      state: 'onayli' as const,
      sources: [],
      author: 't',
      date: '2026-11-13',
      app,
    }
    h.ctx.memory.writeRule({ ...base, id: 'bir', text: 'Listeler Türkçe sıralanır.' })
    h.ctx.memory.writeRule({ ...base, id: 'iki', text: 'Listeler türkçe sıralanır!' })
    const hygiene = h.ctx.learner.hygiene(app, 'Burak')
    expect(hygiene.find((p) => p.action === 'birlestir')).toMatchObject({
      rule: { id: 'bir' },
      related: ['iki'],
      status: 'bekliyor',
    })
  })
})
