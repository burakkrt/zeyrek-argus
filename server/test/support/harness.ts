import { cpSync, existsSync, mkdtempSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RunInfo } from '@argus/shared'
import { DEFINITION_MARKER } from '../../src/agent/investigator.ts'
import type { CreateMessage, Message, MessageParams } from '../../src/agent/model.ts'
import { STRATEGY_MARKER } from '../../src/agent/strategist.ts'
import { SUPERVISE_MARKER } from '../../src/agent/supervisor.ts'
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
  /** Yargıç kararı; verilmezse aday olduğu gibi kabul edilir. */
  judge?: (candidate: Record<string, string>, prompt: string) => unknown
  /** Gözün bir ekran durumunda bulduğu; verilmezse bulgu yok. */
  inspect?: (prompt: string) => unknown
  /** Terim gözü (sayfa sonunda etiket karşılaştırması); verilmezse bulgu yok. */
  terms?: (prompt: string) => unknown
  /** Sayfa bilgisi damıtma; verilmezse boş bilgi. */
  knowledge?: (prompt: string) => unknown
  /**
   * Anla adımı (girdili koşu): araç hamleleri; `plani_yaz` bitirir. Verilmezse seçilen her sayfa baştan sona taranır
   * (girdisiz koşuyla aynı).
   */
  strategy?: (conversation: string, turn: number) => Move | Move[]
  /** Gözetmen kararı (girdili koşu sonunda); verilmezse kapsam tam, kaçmış bulgu ve ek kalem yok. */
  supervise?: (prompt: string) => unknown
  /** Tanım kalemi: araç hamleleri; `kalemi_bitir` bitirir. Verilmezse hemen biter. */
  define?: (conversation: string, turn: number) => Move | Move[]
}

function judgeCandidate(prompt: string): Record<string, string> {
  const body = /Aday bulgu:\n([\s\S]*?)\n\nEkranın ağacı:/.exec(prompt)?.[1] ?? '{}'
  return JSON.parse(body) as Record<string, string>
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

/** Varsayılan strateji: seçilen her sayfa baştan sona taranır. */
function scanPlan(pages: string[]) {
  return {
    tur: 'arayuz',
    anlasilan: 'Tarama',
    sorular: [],
    basari: 'Bulgular',
    bilinenler: [],
    yapilamayan: [],
    kalemler: pages.map((sayfa) => ({
      baslik: 'Sayfanın tamamı',
      amac: '',
      kaynak: 'ekran',
      sayfa,
      tam_tarama: true,
    })),
  }
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
    if (params.output_config?.format && prompt.includes('TERİM GÖZÜ GÖREVİ')) {
      const value = script.terms?.(prompt) ?? { bulgular: [], notlar: [] }
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    if (params.output_config?.format && prompt.includes('GÖZ GÖREVİ')) {
      const value = script.inspect?.(prompt) ?? { bulgular: [], notlar: [] }
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    if (params.output_config?.format && prompt.includes('SAYFA BİLGİSİ GÖREVİ')) {
      const value = script.knowledge?.(prompt) ?? {
        amac: '',
        ekranlar: [],
        beklentiler: [],
        kapsanan: [],
        kapsanmayan: [],
        tuhafliklar: [],
      }
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    if (params.output_config?.format && prompt.includes(SUPERVISE_MARKER)) {
      const value = script.supervise?.(prompt) ?? {
        durum: 'tam',
        ozet: 'Kapsam test edildi.',
        test_edilen: [],
        test_edilemeyen: [],
        kacmis_bulgular: [],
        ek_kalemler: [],
      }
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    if (params.output_config?.format && prompt.includes('YARGIÇ GÖREVİ')) {
      const candidate = judgeCandidate(prompt)
      const value = script.judge?.(candidate, prompt) ?? {
        karar: 'kabul',
        tur: candidate.tur,
        anahtar: candidate.anahtar,
        baslik: candidate.baslik,
        gerekce: 'Ekranda görülüyor.',
      }
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    if (params.output_config?.format) {
      const isTeacher = typeof params.system === 'string' && params.system.includes('öğretmenisin')
      const value = isTeacher ? (script.learn?.(prompt) ?? { oneriler: [] }) : script.plan(prompt)
      return reply([{ type: 'text', text: JSON.stringify(value) }], 'end_turn')
    }
    const toolMoves = (moves: Move | Move[]) =>
      reply(
        [moves]
          .flat()
          .map((m, i) => ({ type: 'tool_use', id: `tu_${n}_${i}`, name: m.name, input: m.input })),
        'tool_use',
      )
    if (prompt.includes(STRATEGY_MARKER)) {
      const turn = (turns.get(STRATEGY_MARKER) ?? 0) + 1
      turns.set(STRATEGY_MARKER, turn)
      const selected = /KULLANICININ SEÇTİĞİ SAYFALAR[^:]*: (.+)/.exec(prompt)?.[1]?.split(', ') ?? []
      return toolMoves(script.strategy?.(prompt, turn) ?? { name: 'plani_yaz', input: scanPlan(selected) })
    }
    if (prompt.includes(DEFINITION_MARKER)) {
      const turn = (turns.get(DEFINITION_MARKER) ?? 0) + 1
      turns.set(DEFINITION_MARKER, turn)
      return toolMoves(
        script.define?.(prompt, turn) ?? {
          name: 'kalemi_bitir',
          input: { ozet: 'Bakıldı.', kanitlar: [], eksik: '' },
        },
      )
    }
    const task = /GÖREV: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
    const turn = (turns.get(task) ?? 0) + 1
    turns.set(task, turn)
    return toolMoves(script.task(prompt, task, turn))
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
  // Rol talimatları depodakilerdir: testler gerçek talimatla koşar (hafızanın geri kalanı her testte boş başlar).
  const memoryDir = options.memoryDir ?? join(root, 'memory')
  if (!existsSync(join(memoryDir, 'brain', 'roles')))
    cpSync(
      fileURLToPath(new URL('../../../memory/brain/roles', import.meta.url)),
      join(memoryDir, 'brain', 'roles'),
      {
        recursive: true,
      },
    )
  const config: Config = {
    rootDir: root,
    envFile: null,
    port: 0,
    dataDir: join(root, 'data'),
    memoryDir,
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
