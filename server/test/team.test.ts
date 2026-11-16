import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseFindings, serializeFindings } from '../src/memory/shared.ts'
import { startHarness, type Harness, type Script } from './support/harness.ts'

/**
 * Takım paylaşımı uçtan uca: Git'ten gelen (başka makinenin yazdığı) bulgu ve sayfa bilgisi bu makinenin koşusuna girer;
 * takım arkadaşının bulgusu alıntısıyla modelsiz doğrulanır; koşu sonunda bu makine yalnız kendi dosyasını yazar.
 */
const app = { project: 'qm', application: 'web' }
const script: Script = {
  plan: () => ({ ozet: 'Liste', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
  task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bakıldı.', eksik: '' } }),
}

let h: Harness
const appDir = () => join(h.ctx.config.memoryDir, 'apps/qm/web')
const teammate = (findings: Parameters<typeof serializeFindings>[2]) => {
  mkdirSync(join(appDir(), 'findings'), { recursive: true })
  writeFileSync(
    join(appDir(), 'findings', 'ayse.md'),
    serializeFindings('Ayşe', '2026-11-15T09:00:00.000Z', findings),
  )
}
const finding = (key: string, page: string, quote: string) => ({
  key,
  title: `${key} başlığı`,
  kind: 'tutarsizlik' as const,
  pages: [page],
  firstSeen: '2026-11-14T09:00:00.000Z',
  lastSeen: '2026-11-15T09:00:00.000Z',
  seenCount: 2,
  page,
  scenario: 'Listeyi aç',
  expected: 'Toplam satırla tutmalı',
  observed: 'Toplam 5, tabloda 3 satır',
  quote,
})

beforeAll(async () => {
  h = await startHarness(script)
})

afterAll(async () => {
  await h.close()
})

const run = () =>
  h.waitFor(
    h.ctx.runs.create({
      ...app,
      environment: 'development',
      pages: ['egt-liste'],
      options: { maxTasks: 1, maxSteps: 3 },
    }).id,
  )

describe('takım paylaşımı', () => {
  it('takım arkadaşının bulgusu ve sayfa bilgisi koşuya girer; bulgu modelsiz doğrulanır; yalnız kendi dosyası yazılır', async () => {
    teammate([
      finding('yz:toplam-tutmuyor', 'egt-liste', 'Toplam: 5 kayıt'),
      finding('yz:form-sorunu', 'egt-form', 'Kaydet'),
    ])
    const pages = join(appDir(), 'pages', 'egt-liste')
    mkdirSync(pages, { recursive: true })
    writeFileSync(
      join(pages, 'ayse.md'),
      '---\nsayfa: egt-liste\nyazar: Ayşe\nguncelleme: 2099-01-01T00:00:00.000Z\nkosu: KOS-2026-0001\niz_arayuz: x\niz_veri: y\niz_studio: \n---\n## Amaç\nAYŞENİN SAYFA BİLGİSİ\n',
    )
    const before = h.calls.length
    const done = await run()
    expect(done.status).toBe('bitti')

    // Takım arkadaşının bulgusu bu makinede de kayıtlı; alıntı ekranda olduğu için model çağrılmadan doğrulandı.
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:toplam-tutmuyor')!
    const detail = h.ctx.issues.detail(issue.id)
    expect(detail.elsewhere).toEqual([
      expect.objectContaining({ author: 'Ayşe', page: 'egt-liste', quote: 'Toplam: 5 kayıt' }),
    ])
    expect(detail.occurrences.find((o) => o.runId === done.id)).toMatchObject({
      outcome: 'tekrar',
      quote: 'Toplam: 5 kayıt',
    })
    const explorer = h.calls.slice(before).filter((c) => JSON.stringify(c.messages).includes('GÖREV: '))
    expect(explorer.some((c) => JSON.stringify(c.messages).includes('yz:toplam-tutmuyor —'))).toBe(false)
    // En yeni sayfa bilgisi (kimin yazdığından bağımsız) isteme girdi (tek görevli koşuda gezginin istemi).
    expect(explorer.some((c) => JSON.stringify(c.system).includes('AYŞENİN SAYFA BİLGİSİ'))).toBe(true)

    // Bu makine yalnız kendi bulgu dosyasını yazdı; Ayşe'ninkine dokunmadı.
    const mine = join(appDir(), 'findings', `${h.ctx.author().id}.md`)
    expect(existsSync(mine)).toBe(true)
    expect(parseFindings(readFileSync(mine, 'utf8')).findings.map((f) => f.key)).toContain(
      'yz:toplam-tutmuyor',
    )
    expect(parseFindings(readFileSync(join(appDir(), 'findings', 'ayse.md'), 'utf8')).findings).toHaveLength(
      2,
    )
  })

  it('birleşen karar dosyasında arkadaşın kararı ve yorumu, bu makinedeki daha yeni yorumla birlikte korunur', async () => {
    const issue = h.ctx.issues.list({ app }).find((i) => i.key === 'yz:toplam-tutmuyor')!
    // Ayşe 10:00'da karar verip yorum yazdı; bu makinede 11:00'de yorum yazıldı; Git ikisini union ile birleştirdi.
    h.ctx.issues.comment(issue.id, 'Burak', 'Benim yorumum')
    const mine = h.ctx.memory.decision(app, issue.key)!
    const at = '2000-01-01T10:00:00.000Z'
    // Birleşen dosyanın güncelleme anı en yeni yazımdır (burada bu makinenin yorumu): yerelden "yeni" görünmez.
    h.ctx.memory.writeDecision(app, {
      ...mine,
      updatedAt: mine.comments.at(-1)!.at,
      status: 'duzeltilecek',
      history: [...mine.history, { at, author: 'Ayşe', from: 'acik', to: 'duzeltilecek', note: null }],
      comments: [{ at, author: 'Ayşe', text: 'Ayşenin yorumu' }, ...mine.comments],
    })
    h.ctx.issues.syncFromMemory(app, h.ctx.author())
    const detail = h.ctx.issues.detail(issue.id)
    expect(detail.comments.map((c) => c.text)).toEqual(['Ayşenin yorumu', 'Benim yorumum'])
    expect(detail.status).toBe('duzeltilecek')
    // Sonraki yazım (yeni yorum) dosyaya ikisini de geri yazar; arkadaşın satırı kaybolmaz.
    h.ctx.issues.comment(issue.id, 'Burak', 'İkinci yorum')
    expect(h.ctx.memory.decision(app, issue.key)!.comments.map((c) => c.text)).toEqual([
      'Ayşenin yorumu',
      'Benim yorumum',
      'İkinci yorum',
    ])
  })

  it('takım arkadaşı artık görmediği bulguyu dosyasından çıkarınca, bu makinede hiç görülmemiş kopya da silinir', async () => {
    teammate([finding('yz:toplam-tutmuyor', 'egt-liste', 'Toplam: 5 kayıt')])
    h.ctx.issues.syncFromMemory(app, h.ctx.author())
    const keys = h.ctx.issues.list({ app, includeSuppressed: true }).map((i) => i.key)
    expect(keys).not.toContain('yz:form-sorunu')
    // Burada da görülen sorun kalır.
    expect(keys).toContain('yz:toplam-tutmuyor')
  })
})
