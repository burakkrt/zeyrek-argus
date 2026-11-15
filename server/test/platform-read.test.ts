import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getRun, listEvents } from '../src/db/runs.ts'
import { startHarness, type Harness, type Script } from './support/harness.ts'

/**
 * Tek araç kutusu: gezgin aynı görevde platformdan tanım okur ve ekrana bakar. Okuma araçları sunucunun "salt okuma"
 * işaretinden gelir (yazan ve kara listedeki araç dizinde yoktur), ortam koşununkine sabitlenir, okuma akışa ve
 * yerel ize yazılır.
 */
const app = { project: 'qm', application: 'web' }
const script: Script = {
  plan: () => ({ ozet: 'Liste', gorevler: [{ baslik: 'Kalibrasyon', amac: 'Kalibrasyon atlanabilir mi' }] }),
  task: (_, __, turn) =>
    turn === 1
      ? {
          name: 'platform_oku',
          input: {
            arac: 'workflow_get',
            girdi: '{"workflowId":"donem","environment":"production"}',
            neden: 'Kural',
          },
        }
      : turn === 2
        ? {
            name: 'platform_yaz',
            input: {
              arac: 'row_create',
              girdi: '{"entityId":"donem","values":{"ad":"Argus test"},"environment":"production"}',
              neden: 'Test kaydı',
            },
          }
        : turn === 3
          ? { name: 'ekrana_bak', input: { goruntu: false, neden: 'Ekranda teyit' } }
          : {
              name: 'gorevi_bitir',
              input: { ozet: 'Kalibrasyon kapalıysa Sonuç yayınına geçilir.', eksik: '' },
            },
}

let h: Harness
beforeAll(async () => {
  h = await startHarness(script)
})
afterAll(async () => {
  await h.close()
})

describe('platform okuması', () => {
  it('gezgin tanımı okur ve ekrana bakar; ortam sabit, yazan ve kara listedeki araç dizinde yok, okuma izde', async () => {
    const before = h.calls.length
    const done = await h.waitFor(
      h.ctx.runs.create({
        ...app,
        environment: 'development',
        pages: ['egt-liste'],
        options: { maxTasks: 1 },
      }).id,
    )
    expect(done.status).toBe('bitti')
    // Girdisiz koşu (yalnız sayfa): anla adımı ve gözetmen çalışmaz, kapsam raporu yoktur.
    expect(getRun(h.ctx.db, done.id)!.coverage).toBeNull()
    const explorer = h.calls.slice(before).filter((c) => JSON.stringify(c.messages).includes('GÖREV: '))
    const tools = explorer[0]!.tools as Array<{ name: string; description: string }>
    const oku = tools.find((t) => t.name === 'platform_oku')!
    expect(oku.description).toContain('workflow_get(workflowId*) — Akış tanımını getirir.')
    expect(oku.description).toContain('environment=development')
    expect(oku.description).not.toContain('user_list')
    expect(oku.description).not.toContain('page_schema_patch')
    // Yazma: veri aracı açık, uygulamanın tanımını değiştiren araç yok; ortam development'a sabitlendi.
    const yaz = tools.find((t) => t.name === 'platform_yaz')!
    expect(yaz.description).toContain('row_create(entityId*, values*)')
    expect(yaz.description).not.toContain('workflow_update')
    expect(yaz.description).not.toContain('page_schema_patch')
    expect(JSON.stringify(explorer[2]!.messages.at(-1))).toContain('\\"environment\\":\\"development\\"')
    // Okumanın sonucu modele döndü: ortam development'a sabitlendi, kalibrasyon koşulu geldi.
    const second = JSON.stringify(explorer[1]!.messages.at(-1))
    expect(second).toContain('kalibrasyonAcik')
    expect(second).toContain('\\"environment\\":\\"development\\"')
    const steps = listEvents(h.ctx.db, done.id).flatMap((e) => (e.type === 'adim' ? [e.outcome] : []))
    expect(steps).toEqual(
      expect.arrayContaining([
        'Platformdan okundu: workflow_get',
        'Platforma yazıldı: row_create',
        'Ekrana bakıldı',
      ]),
    )
    const written = listEvents(h.ctx.db, done.id).find((e) => e.type === 'adim' && e.tool === 'platform_yaz')
    expect(written?.type === 'adim' && written.platform).toMatchObject({ tool: 'row_create', write: true })
    // Okuma izleme ekranında gösterilmek üzere adımda: araç, girdi ve sonucun başı.
    const read = listEvents(h.ctx.db, done.id).find((e) => e.type === 'adim' && e.tool === 'platform_oku')
    expect(read?.type === 'adim' && read.platform).toMatchObject({
      tool: 'workflow_get',
      input: expect.stringContaining('donem'),
    })
    expect(read?.type === 'adim' && read.platform?.result).toContain('kalibrasyonAcik')
    const trace = readFileSync(join(h.ctx.config.dataDir, 'runs', done.id, 'iz', 'iz.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { t: string; tool?: string; args?: { environment?: string } })
    expect(trace.find((l) => l.t === 'mcp')).toMatchObject({
      tool: 'workflow_get',
      args: { environment: 'development' },
    })
    expect(trace.find((l) => l.t === 'mcp' && l.tool === 'row_create')).toMatchObject({
      args: { environment: 'development' },
    })
    // Gezgin oluşturduğu test kaydını silmedi: koşu sonunda kapı siler ve akışa yazar.
    expect(trace.find((l) => l.t === 'mcp' && l.tool === 'row_delete')).toMatchObject({
      args: { entityId: 'donem', ids: ['7'], environment: 'development' },
    })
    expect(
      listEvents(h.ctx.db, done.id).some(
        (e) => e.type === 'bilgi' && e.message === 'Koşunun oluşturup silmediği 1 test kaydı silindi.',
      ),
    ).toBe(true)
  })
})
