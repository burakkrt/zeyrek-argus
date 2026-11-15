import { describe, expect, it } from 'vitest'
import type { McpClient } from './mcp.ts'
import { readableTools } from './mcp.ts'
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
    async call(tool, args = {}) {
      calls.push({ tool, args })
      return respond(tool, args)
    },
    close: async () => undefined,
  }
}

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
