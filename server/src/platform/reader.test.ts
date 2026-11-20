import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { McpClient } from './mcp.ts'
import { readableTools, writableTools } from './mcp.ts'
import { PlatformReader, READ_LIMIT } from './reader.ts'

const context = {
  project: 'qm',
  application: 'web',
  environment: 'development',
  projectId: 'p1',
  applicationId: 'a1',
}

const fakeClient = (
  respond: (tool: string, args: Record<string, unknown>) => unknown,
): McpClient & {
  calls: Array<{ tool: string; args: Record<string, unknown> }>
} => {
  const calls: Array<{ tool: string; args: Record<string, unknown> }> = []
  return {
    calls,
    readTools: () => [
      {
        name: 'workflow_get',
        description: 'Akış tanımını getirir. Ayrıntı.',
        inputSchema: { properties: { workflowId: {}, environment: {} }, required: ['workflowId'] },
      },
      {
        name: 'row_list',
        description: 'Kayıtları listeler.',
        inputSchema: { properties: { entityId: {}, project: {}, applicationId: {} } },
      },
    ],
    writeTools: () => [
      {
        name: 'row_create',
        description: 'Kayıt oluşturur.',
        inputSchema: { properties: { entityId: {}, values: {}, environment: {} }, required: ['entityId'] },
      },
      {
        name: 'microservice_execute',
        description: 'Mikroservisi çalıştırır.',
        inputSchema: {
          properties: {
            id: { type: 'string' },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
            body: { type: 'string', enum: ['none', 'json', 'form', 'raw', 'xml', 'binary', 'graphql'] },
            environment: {},
          },
          required: ['id', 'method'],
        },
      },
      {
        name: 'row_delete',
        description: 'Kayıt siler.',
        inputSchema: {
          properties: {
            entityId: { type: 'string' },
            id: { type: 'string' },
            ids: { type: 'array', items: { type: 'string' } },
            environment: {},
          },
          required: ['entityId'],
        },
      },
    ],
    async call(tool, args = {}) {
      calls.push({ tool, args })
      return respond(tool, args)
    },
    close: async () => undefined,
  }
}

describe('platform yazma kapısı', () => {
  it('yalnız veri ve çalıştırma araçları yazılabilir; uygulamanın tanımını değiştiren araç geçmez', () => {
    expect(
      writableTools([
        { name: 'row_create' },
        { name: 'process_execute', annotations: { readOnlyHint: false } },
        { name: 'workflow_update' },
        { name: 'page_schema_patch' },
        { name: 'deployment_start' },
        { name: 'user_create' },
      ]).map((t) => t.name),
    ).toEqual(['row_create', 'process_execute'])
  })

  it('yazma ortamı koşununkine sabitler, veri okumalarının önbelleğini boşaltır (tanımınkini değil); production koşusunda yazma kapalıdır', async () => {
    let version = 1
    const client = fakeClient((tool) =>
      tool === 'row_create' ? { id: 'r1', version: (version += 1) } : { version },
    )
    const reader = new PlatformReader(client, context, null)
    await reader.read('workflow_get', '{"workflowId":"w1"}')
    expect(reader.writeIndex()).toContain('row_create(entityId*, values)')
    expect(await reader.write('row_create', '{"entityId":"e1","environment":"production"}')).toContain('r1')
    expect(client.calls.at(-1)).toMatchObject({ tool: 'row_create', args: { environment: 'development' } })
    // Yazma yalnız veridir: tanım okuması önbellekte kalır, veri okuması (kayıt listesi) yeniden platforma gider.
    expect(await reader.read('workflow_get', '{"workflowId":"w1"}')).toContain('"version":1')
    expect(client.calls.filter((c) => c.tool === 'workflow_get')).toHaveLength(1)
    await reader.read('row_list', '{"entityId":"e1"}')
    await reader.write('row_create', '{"entityId":"e1"}')
    await reader.read('row_list', '{"entityId":"e1"}')
    expect(client.calls.filter((c) => c.tool === 'row_list')).toHaveLength(2)
    expect(await reader.write('workflow_update', '{}')).toMatch(/^Yazılamadı/)

    // Kullanıcının seçtiği dalda da yazılır; yalnız production'da kapalı.
    const branch = new PlatformReader(
      fakeClient(() => ({ id: 'r2' })),
      { ...context, environment: 'feature-yeni-ekran' },
      null,
    )
    expect(await branch.write('row_create', '{"entityId":"e1"}')).toContain('r2')
    const production = new PlatformReader(
      fakeClient(() => ({})),
      { ...context, environment: 'production' },
      null,
    )
    expect(production.writeIndex()).toBe('')
    expect(await production.write('row_create', '{"entityId":"e1"}')).toMatch(/^Yazılamadı/)
  })
})

describe('seçenekli alanlar', () => {
  it('dizin kısa seçenek listesini gösterir; uzun liste dizini şişirmez', () => {
    const reader = new PlatformReader(fakeClient(() => null), context, null)
    expect(reader.writeIndex()).toContain('microservice_execute(id*, method*(GET|POST|PUT|DELETE), body)')
  })

  it('yalnız harf büyüklüğü farklı seçenek şemadaki yazımına çevrilir; belirsiz ya da yanlış değere dokunulmaz', async () => {
    const client = fakeClient(() => ({ ok: true }))
    const reader = new PlatformReader(client, context, null)
    await reader.write('microservice_execute', '{"id":"m1","method":"post","body":"JSON"}')
    expect(client.calls.at(-1)!.args).toMatchObject({ method: 'POST', body: 'json' })
    await reader.write('microservice_execute', '{"id":"m1","method":"PATCH"}')
    expect(client.calls.at(-1)!.args).toMatchObject({ method: 'PATCH' })
  })
})

describe('test verisi temizliği', () => {
  it('şemada metin olan alana verilen sayı metne çevrilir (KOŞU: row_delete id 43 sayı diye reddedildi, kayıt kaldı)', async () => {
    const client = fakeClient(() => ({ success: true }))
    await new PlatformReader(client, context, null).write(
      'row_delete',
      '{"entityId":"e1","id":43,"ids":[44,45]}',
    )
    expect(client.calls.at(-1)!.args).toMatchObject({ id: '43', ids: ['44', '45'] })
  })

  it('koşu sonunda modelin silmediği test kayıtları silinir; sildikleri yeniden silinmez', async () => {
    let next = 0
    const client = fakeClient((tool) =>
      tool === 'row_create'
        ? next++ === 0
          ? { written: 2, ids: [{ id: 37 }, { id: 38 }] }
          : { data: { id: 41 } }
        : { success: true },
    )
    const reader = new PlatformReader(client, context, null)
    await reader.write('row_create', '{"entityId":"donem","rows":[{},{}]}')
    await reader.write('row_create', '{"entityId":"oturum","row":{}}')
    await reader.write('row_delete', '{"entityId":"donem","id":"37"}')
    expect(await reader.cleanup()).toBe(2)
    const deletes = client.calls.filter((c) => c.tool === 'row_delete').slice(1)
    expect(deletes.map((c) => c.args)).toEqual([
      expect.objectContaining({ entityId: 'donem', ids: ['38'], environment: 'development' }),
      expect.objectContaining({ entityId: 'oturum', ids: ['41'], environment: 'development' }),
    ])
    expect(await reader.cleanup()).toBe(0)
  })

  it('oluşturulan kayıtlar dosyada tutulur: yeni kapı (devam ya da kapanış) aynı kayıtları siler', async () => {
    const ledger = join(mkdtempSync(join(tmpdir(), 'argus-ledger-')), 'test-kayitlari.json')
    const client = fakeClient((tool) => (tool === 'row_create' ? { data: { id: 51 } } : { success: true }))
    const first = new PlatformReader(client, context, null, ledger)
    await first.write('row_create', '{"entityId":"donem","row":{}}')
    expect(JSON.parse(readFileSync(ledger, 'utf8'))).toEqual({ donem: ['51'] })
    // Sunucu yeniden başladı ya da koşu devam ettirildi: kayıtlar dosyadan gelir.
    const next = new PlatformReader(client, context, null, ledger)
    expect(next.pending).toBe(1)
    expect(await next.cleanup()).toBe(1)
    expect(client.calls.at(-1)).toMatchObject({ tool: 'row_delete', args: { entityId: 'donem', ids: ['51'] } })
    expect(JSON.parse(readFileSync(ledger, 'utf8'))).toEqual({})
    expect(new PlatformReader(client, context, null, ledger).pending).toBe(0)
  })
})

describe('platform okuma kapısı', () => {
  it('yalnız okuma işaretli ve kara listede olmayan araçlar açılır', () => {
    expect(
      readableTools([
        { name: 'workflow_get', annotations: { readOnlyHint: true } },
        { name: 'workflow_update', annotations: { readOnlyHint: false } },
        { name: 'page_schema_patch' },
        { name: 'user_list', annotations: { readOnlyHint: true } },
        { name: 'connector_credential_list', annotations: { readOnlyHint: true } },
      ]).map((t) => t.name),
    ).toEqual(['workflow_get'])
  })

  it('ortam koşunun ortamına sabitlenir: model production istese de development okunur', async () => {
    const client = fakeClient((_, args) => ({ ok: true, args }))
    const reader = new PlatformReader(client, context, null)
    await reader.read('workflow_get', '{"workflowId":"w1","environment":"production"}')
    await reader.read('row_list', '{"entityId":"e1","environment":"production"}')
    expect(client.calls.map((c) => c.args.environment)).toEqual(['development', 'development'])
    // Şemadaki bağlam alanları verilmediyse doldurulur; verilen korunur.
    expect(client.calls[1]!.args).toMatchObject({ project: 'qm', applicationId: 'a1' })
    expect(client.calls[0]!.args).not.toHaveProperty('project')
    await reader.read('row_list', '{"entityId":"e1","project":"baska"}')
    expect(client.calls[2]!.args.project).toBe('baska')
  })

  it('uzun sonuç dilimlenir, devamı platforma yeniden gitmeden okunur; yanlış araç, bozuk girdi ve hata açıklamayla döner', async () => {
    const client = fakeClient((tool) => {
      if (tool === 'row_list') throw new Error('400: entityId gerekli')
      return { veri: 'a'.repeat(READ_LIMIT) + 'b'.repeat(READ_LIMIT) + 'SON' }
    })
    const reader = new PlatformReader(client, context, null)
    const first = await reader.read('workflow_get', '{"workflowId":"w1"}')
    expect(first.length).toBeLessThan(READ_LIMIT + 200)
    expect(first).toContain(`devam=${READ_LIMIT}`)
    expect(await reader.read('workflow_get', '{"workflowId":"w1"}', READ_LIMIT)).toContain(
      `devam=${READ_LIMIT * 2}`,
    )
    const last = await reader.read('workflow_get', '{"workflowId":"w1"}', READ_LIMIT * 2)
    expect(last).toContain('SON')
    expect(last).not.toContain('devam=')
    expect(client.calls.filter((c) => c.tool === 'workflow_get')).toHaveLength(1)
    expect(await reader.read('user_list', '{}')).toContain('okuma araçları arasında yok')
    expect(await reader.read('workflow_get', 'json değil')).toContain('Girdi JSON nesnesi olmalı')
    const failed = await reader.read('row_list', '{}')
    expect(failed).toContain('Okunamadı: 400: entityId gerekli')
    expect(failed).toContain('Girdi şeması')
  })

  it('dizin araç başına tek satır; bağlam kimlikleri taşır', () => {
    const reader = new PlatformReader(
      fakeClient(() => null),
      context,
      null,
    )
    // Dizin girdi alanlarını taşır (bağlamın doldurduğu alanlar hariç; zorunlular *).
    expect(reader.index()).toBe(
      'workflow_get(workflowId*) — Akış tanımını getirir.\nrow_list(entityId) — Kayıtları listeler.',
    )
    expect(reader.contextLine()).toContain('applicationId=a1')
  })
})
