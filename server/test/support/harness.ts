import { mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RunInfo } from '@argus/shared'
import type { CreateMessage, Message, MessageParams } from '../../src/agent/model.ts'
import type { Config } from '../../src/config.ts'
import { createContext, type AppContext } from '../../src/context.ts'
import { getRun } from '../../src/db/runs.ts'
import type { PlatformAccess } from '../../src/platform/credentials.ts'
import { startSite, TEST_USER } from './site.ts'

const require = createRequire(import.meta.url)
const FAKE_MCP = fileURLToPath(new URL('./fake-mcp.ts', import.meta.url))

export type Move = { name: string; input: Record<string, unknown> }

export interface Script {
  plan: (prompt: string) => { ozet: string; gorevler: Array<{ baslik: string; amac: string }> }
  /** Görev turu: konuşmanın bütün metni (ağaçlar dahil), görev başlığı ve bu görevdeki tur sırası. */
  task: (conversation: string, task: string, turn: number) => Move | Move[]
  learn?: (prompt: string) => unknown
}

function textOfParams(params: MessageParams): string {
  const out: string[] = []
  if (typeof params.system === 'string') out.push(params.system)
  else for (const block of params.system ?? []) out.push(block.text)
  for (const message of params.messages) {
    if (typeof message.content === 'string') {
      out.push(message.content)
      continue
    }
    for (const block of message.content ?? []) {
      if (block.type === 'text') out.push(block.text)
      if (block.type === 'tool_result') {
        if (typeof block.content === 'string') out.push(block.content)
        else for (const inner of block.content ?? []) if (inner.type === 'text') out.push(inner.text)
      }
    }
  }
  return out.join('\n')
}

const usage = {
  input_tokens: 1000,
  output_tokens: 50,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

/** Senaryolu sahte model: plan, görev ve ders çağrılarını ayırıp senaryodaki cevabı döner; çağrıları saklar. */
export function scriptedModel(script: Script): { model: CreateMessage; calls: MessageParams[] } {
  const calls: MessageParams[] = []
  const turns = new Map<string, number>()
  let n = 0
  const model: CreateMessage = async (params) => {
    calls.push(structuredClone(params))
    n += 1
    const reply = (content: unknown[], stop: string): Message =>
      ({
        id: `msg_${n}`,
        type: 'message',
        role: 'assistant',
        model: params.model,
        content,
        stop_reason: stop,
        stop_sequence: null,
        usage,
      }) as unknown as Message
    const prompt = textOfParams(params)
    if (params.output_config?.format) {
      const isTeacher = typeof params.system === 'string' && params.system.includes('öğretmenisin')
      const value = isTeacher ? (script.learn?.(prompt) ?? { oneriler: [] }) : script.plan(prompt)
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    const task = /GÖREV: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
    const turn = (turns.get(task) ?? 0) + 1
    turns.set(task, turn)
    const moves = [script.task(prompt, task, turn)].flat()
    return reply(
      moves.map((m, i) => ({ type: 'tool_use', id: `tu_${n}_${i}`, name: m.name, input: m.input })),
      'tool_use',
    )
  }
  return { model, calls }
}

/** Ekrandaki öğenin en son görülen ref'i (`"Sil" [ref=e7]`). */
export function refOf(conversation: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const quoted = [...conversation.matchAll(new RegExp(`"${escaped}"[^\\n]*\\[ref=(\\w+)\\]`, 'g'))]
  const inline = [...conversation.matchAll(new RegExp(`\\[ref=(\\w+)\\]: "?${escaped}`, 'g'))]
  const ref = [...quoted, ...inline].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).at(-1)?.[1]
  if (!ref) throw new Error(`Ekranda "${label}" yok`)
  return ref
}

export interface Harness {
  ctx: AppContext
  site: Awaited<ReturnType<typeof startSite>>
  calls: MessageParams[]
  waitFor(runId: string): Promise<RunInfo>
  close(): Promise<void>
}

export async function startHarness(script: Script, options: { memoryDir?: string } = {}): Promise<Harness> {
  const site = await startSite()
  const root = mkdtempSync(join(tmpdir(), 'argus-test-'))
  const config: Config = {
    rootDir: root,
    envFile: null,
    port: 0,
    dataDir: join(root, 'data'),
    memoryDir: options.memoryDir ?? join(root, 'memory'),
    zeyrekAppDir: null,
    anthropicApiKey: null,
    anthropicKeySource: null,
  }
  const access: PlatformAccess = {
    credentials: {
      orgApiBaseUrl: `${site.url}/api/org`,
      tenantApiBaseUrl: 'http://tenant.example.test',
      organization: 'acme',
      hostSuffix: 'example.test',
      studioBaseUrl: site.url,
      username: TEST_USER.username,
      password: TEST_USER.password,
    },
    launch: { command: process.execPath, args: [require.resolve('tsx/cli'), FAKE_MCP] },
    envFile: '(test)',
  }
  const { model, calls } = scriptedModel(script)
  const ctx = createContext(config, { access, model, headless: true })
  return {
    ctx,
    site,
    calls,
    async waitFor(runId) {
      for (let i = 0; i < 600; i += 1) {
        const run = getRun(ctx.db, runId)!
        if (!['sirada', 'calisiyor'].includes(run.status)) return run
        await new Promise((r) => setTimeout(r, 250))
      }
      throw new Error('koşu bitmedi')
    },
    async close() {
      await ctx.platform.close()
      ctx.db.close()
      await site.close()
    },
  }
}
