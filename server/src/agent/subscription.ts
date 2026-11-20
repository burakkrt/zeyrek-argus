import { randomUUID } from 'node:crypto'
import { query, type SDKResultMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ModelRole, PlanLimits, PlanWindow } from '@argus/shared'
import { ArgusError } from '../errors.ts'
import type { ContentBlock, CreateMessage, Message, MessageParams } from './model.ts'

/**
 * Claude hesabıyla (abonelik) model çağrısı: istek, kullanıcının bu bilgisayarda kendi hesabıyla giriş yaptığı Claude
 * Code üzerinden, Anthropic'in resmi Claude Agent SDK'sıyla gider. Argus oturum jetonunu okumaz, saklamaz, iletmez;
 * kimliği Claude Code kendisi yönetir (Anthropic kuralı: Claude.ai kimlik bilgisine aracılık edilmez). API anahtarı
 * alt sürecin ortamından çıkarılır, yoksa abonelik yerine anahtar kullanılır.
 *
 * Motorun sözleşmesi (`CreateMessage`, tek tur) aynen korunur: konuşma tek kullanıcı mesajına aktarılır (önceki turlar
 * metin, son mesajın görselleri görsel olarak), Claude Code'un yerleşik araçları kapalıdır, ayarlar ve CLAUDE.md
 * yüklenmez, oturum diske yazılmaz. Araçlı çağrıda model aracı yapılandırılmış çıktıyla seçer (`cagrilar`); sonuç
 * motorun beklediği `tool_use` bloklarına çevrilir, aracı yine motor çalıştırır. Döngü, korumalar ve kanıt kuralları
 * değişmez.
 */

type Params = MessageParams

const textOf = (blocks: unknown): string => {
  if (typeof blocks === 'string') return blocks
  if (!Array.isArray(blocks)) return ''
  return blocks
    .map((b: { type?: string; text?: string }) =>
      b.type === 'text' ? (b.text ?? '') : b.type === 'image' ? '[görüntü]' : '',
    )
    .filter(Boolean)
    .join('\n')
}

/** Sabit talimat: metin blokları birleştirilir; araçlı çağrıda araç listesi ve şemaları eklenir. */
export function systemOf(params: Params): string {
  const base = typeof params.system === 'string' ? params.system : textOf(params.system ?? [])
  if (!params.tools?.length) return base
  const tools = (params.tools as Array<{ name: string; description?: string; input_schema?: unknown }>)
    .map(
      (t) => `- ${t.name}: ${t.description ?? ''}\n  girdi şeması: ${JSON.stringify(t.input_schema ?? {})}`,
    )
    .join('\n')
  return (
    `${base}\n\n## Araçlar\nYanıtını yalnız aşağıdaki araçların çağrısı olarak ver (cagrilar: arac + girdi). Girdi, aracın ` +
    `şemasına uymalı. Birden çok araç çağırabilirsin; sırayla çalıştırılır ve sonuçları sonraki mesajda gelir.\n${tools}`
  )
}

/**
 * Konuşmanın tek kullanıcı mesajı hâli: önceki turlar metin olarak (asistanın araç çağrıları ve sonuçları dahil),
 * son mesaj kendi bloklarıyla (görseller korunur; araç sonucunun içindeki görsel de görsel bloğa çıkar).
 */
export function transcriptOf(params: Params): ContentBlock[] {
  const messages = params.messages
  const history = messages.slice(0, -1).map((m) => {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content
    const lines = (blocks as Array<Record<string, unknown>>).flatMap((b) => {
      if (b.type === 'text') return [`${m.role === 'assistant' ? '[asistan] ' : ''}${String(b.text)}`]
      if (b.type === 'tool_use')
        return [`[asistan aracı çağırdı] ${String(b.name)} ${JSON.stringify(b.input)}`]
      if (b.type === 'tool_result') return [`[araç sonucu] ${textOf(b.content)}`]
      if (b.type === 'image') return ['[görüntü]']
      return []
    })
    return `### ${m.role === 'assistant' ? 'Asistan' : 'Kullanıcı'}\n${lines.join('\n')}`
  })
  const last = messages.at(-1)
  const lastBlocks =
    typeof last?.content === 'string' ? [{ type: 'text', text: last.content }] : (last?.content ?? [])
  // Motorun önbellek işaretleri Claude Code'un 1 saatlik işaretiyle aynı süreye çevrilir: süre farkı isteği düşürüyordu
  // ("ttl='1h' … must not come after a ttl='5m'", KOS-2026-0040); işaretsiz göndermek ise büyüyen ön eki (gözün ekran
  // notları) her çağrıda yeniden yazdırıyordu.
  const plain = ({ cache_control: cache, ...block }: Record<string, unknown>) =>
    (cache ? { ...block, cache_control: { type: 'ephemeral', ttl: '1h' } } : block) as unknown as ContentBlock
  const tail = (lastBlocks as Array<Record<string, unknown>>).flatMap((b): ContentBlock[] => {
    if (b.type === 'text' || b.type === 'image' || b.type === 'document') return [plain(b)]
    if (b.type === 'tool_result') {
      const inner = Array.isArray(b.content) ? (b.content as Array<Record<string, unknown>>) : []
      return [
        { type: 'text', text: `[araç sonucu] ${textOf(b.content)}` },
        ...inner.filter((i) => i.type === 'image').map(plain),
      ]
    }
    return []
  })
  // API bir istekte en çok 4 önbellek işareti kabul eder; Claude Code kendi işaretlerini de ekler. Mesajda en çok
  // TAIL_CACHE_MARKS işaret kalır, en sondakiler (önbellek için en değerli ön ek) korunur: gözün çağrısı 5 işaretle
  // reddediliyordu ("A maximum of 4 blocks with cache_control", KOS-2026-0061).
  let marks = 0
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const block = tail[i] as unknown as Record<string, unknown>
    if (!block.cache_control) continue
    marks += 1
    if (marks > TAIL_CACHE_MARKS) {
      const { cache_control: _dropped, ...rest } = block
      tail[i] = rest as unknown as ContentBlock
    }
  }
  return [
    ...(history.length
      ? [{ type: 'text' as const, text: `ÖNCEKİ KONUŞMA:\n\n${history.join('\n\n')}\n\nŞİMDİKİ MESAJ:` }]
      : []),
    ...tail,
  ]
}

/** Abonelik mesajında kalan en çok önbellek işareti (API sınırı 4; geri kalanı Claude Code'undur). */
const TAIL_CACHE_MARKS = 2

/** Araçlı çağrının yapılandırılmış çıktı şeması: çağrılacak araçlar ve girdileri. */
export function callSchema(params: Params): Record<string, unknown> {
  const names = (params.tools as Array<{ name: string }>).map((t) => t.name)
  return {
    type: 'object',
    properties: {
      cagrilar: {
        type: 'array',
        items: {
          type: 'object',
          properties: { arac: { type: 'string', enum: names }, girdi: { type: 'object' } },
          required: ['arac', 'girdi'],
        },
      },
    },
    required: ['cagrilar'],
  }
}

/**
 * Claude Code hatasını kullanıcının yapacağı işe çevirir: oturum yoksa ya da süresi dolduysa terminalde kendi hesabıyla
 * giriş (Argus girişi kendisi yapmaz, kimlik bilgisine dokunmaz).
 */
export function subscriptionError(message: string): ArgusError {
  if (/authenticat|oauth|log ?in|credential|not logged/i.test(message))
    return new ArgusError(
      'SUBSCRIPTION_AUTH',
      'Claude hesabına bağlı değil ya da oturumun süresi dolmuş: bir terminalde `claude` çalıştırıp /login ile kendi hesabınla giriş yap, sonra Ayarlar’da Hesabı denetle.',
    )
  return new ArgusError('SUBSCRIPTION', `Claude hesabıyla çağrı başarısız: ${message.slice(0, 400)}`)
}

/**
 * Abonelik limitleri: SDK'nın `rate_limit_event` mesajındaki pencereler (`unifiedWindows`, yoksa mesajın kendi penceresi).
 * Kullanım 0–1 kesirdir (ölçüldü 2026-11-20: haftalık 0.87 = profilde %87); yüzdeye çevrilir. Tanınmayan biçim null.
 */
export function planLimitsOf(info: unknown, at = new Date()): PlanLimits | null {
  if (!info || typeof info !== 'object') return null
  const record = info as {
    rateLimitType?: string
    utilization?: number
    resetsAt?: number
    unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number } | undefined>
  }
  const windowOf = (raw: { utilization?: number; resetsAt?: number } | undefined): PlanWindow | null =>
    raw && typeof raw.utilization === 'number' && raw.utilization >= 0 && raw.utilization <= 1
      ? {
          percent: Math.round(raw.utilization * 1000) / 10,
          resetsAt: typeof raw.resetsAt === 'number' ? new Date(raw.resetsAt * 1000).toISOString() : null,
        }
      : null
  const own = { utilization: record.utilization, resetsAt: record.resetsAt }
  const fiveHour = windowOf(record.unifiedWindows?.five_hour ?? (record.rateLimitType === 'five_hour' ? own : undefined))
  const week = windowOf(record.unifiedWindows?.seven_day ?? (record.rateLimitType === 'seven_day' ? own : undefined))
  return fiveHour || week ? { fiveHour, week, at: at.toISOString() } : null
}

/** Son bilinen abonelik limitleri (bütün oturumlarda ortak; koşu yöneticisi koşunun kullanımına yazar). */
let latestLimits: PlanLimits | null = null
export const currentPlanLimits = (): PlanLimits | null => latestLimits

export interface TurnUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/**
 * Oturumun o ana kadarki toplam kullanımı (modele göre toplanır). SDK sürekli oturumda toplamı birikimli verir; turun
 * kullanımı bir önceki toplamdan farktır (`messageOf`'un `before`'u).
 */
export function totalsOf(result: SDKResultMessage): TurnUsage {
  const models = Object.values(result.modelUsage ?? {})
  return {
    input_tokens: models.reduce((s, u) => s + u.inputTokens, 0),
    output_tokens: models.reduce((s, u) => s + u.outputTokens, 0),
    cache_creation_input_tokens: models.reduce((s, u) => s + u.cacheCreationInputTokens, 0),
    cache_read_input_tokens: models.reduce((s, u) => s + u.cacheReadInputTokens, 0),
  }
}

const NO_USAGE: TurnUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

/** SDK sonucunu motorun beklediği yanıta çevirir: araç çağrıları, yapılandırılmış çıktı ya da metin; kullanım turunkidir. */
export function messageOf(params: Params, result: SDKResultMessage, before: TurnUsage = NO_USAGE): Message {
  if (result.subtype !== 'success' || result.is_error) {
    if (result.subtype === 'success' && result.api_error_status === 429)
      throw new ArgusError(
        'SUBSCRIPTION_LIMIT',
        'Claude hesabının kullanım sınırı doldu; sınır yenilenince yeniden deneyin ya da Ayarlar → Yapay zekâ ve öğrenme’den API anahtarına geçin.',
      )
    throw subscriptionError(result.subtype === 'success' ? result.result : result.subtype)
  }
  const totals = totalsOf(result)
  const usage = Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Math.max(0, value - before[key as keyof TurnUsage])]),
  ) as unknown as TurnUsage
  const base = {
    id: `abonelik_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: params.model,
    usage,
  }
  if (params.tools?.length) {
    const calls =
      ((result.structured_output as { cagrilar?: Array<{ arac: string; girdi: unknown }> }) ?? {}).cagrilar ??
      []
    return {
      ...base,
      content: calls.map((c) => ({
        type: 'tool_use',
        id: `toolu_${randomUUID()}`,
        name: c.arac,
        input: c.girdi ?? {},
      })),
      stop_reason: calls.length ? 'tool_use' : 'end_turn',
    } as unknown as Message
  }
  const text = params.output_config?.format ? JSON.stringify(result.structured_output ?? {}) : result.result
  return { ...base, content: [{ type: 'text', text }], stop_reason: 'end_turn' } as unknown as Message
}

/**
 * Sürekli oturum: araçlı konuşma (gezgin görevi, tanım araştırması, strateji) Claude Code'da tek oturum olarak sürer;
 * her turda yalnız yeni mesaj gönderilir, önceki turlar Claude Code'un önbelleğinden okunur. Her çağrıda yeni oturum
 * açmak konuşmanın tamamını yeniden gönderiyordu (KOS-2026-0040: devam turu başına ≈ 57–76 bin yeni token; API
 * yolunda ≈ 1–3 bin). Konuşmanın kimliği, bir önceki yanıtta üretilen araç çağrısı kimlikleridir (motor o yanıtı
 * konuşmaya aynen ekler): eşleşen oturum sürdürülür, eşleşmeyen çağrı tam konuşmayla yeni oturum açar. Tek seferlik
 * çağrı (araçsız: göz, yargıç, gözetmen…) oturum tutmaz. Boşta kalan oturum `IDLE_MS` sonra, sınırı aşan en eski
 * oturum hemen kapanır.
 */
const IDLE_MS = 120_000
const MAX_SESSIONS = 6
const SESSION_TURNS = 1_000

type QueryFn = typeof query
type Query = ReturnType<QueryFn>
type Options = NonNullable<Parameters<QueryFn>[0]['options']>

/** Claude Code'da süren tek konuşma: mesajlar sırayla gönderilir, her mesaj bir tur sonucu döner. */
class Session {
  private readonly inbox: SDKUserMessage[] = []
  private wake: (() => void) | null = null
  private closed = false
  private readonly q: Query
  private readonly events: AsyncIterator<unknown>
  timer: ReturnType<typeof setTimeout> | undefined
  /** Oturumun bir önceki turdaki toplam kullanımı (turun kullanımı farktır). */
  used: TurnUsage = NO_USAGE

  constructor(
    run: QueryFn,
    options: Options,
    private model: string,
  ) {
    this.q = run({ prompt: this.prompt(), options })
    this.events = this.q[Symbol.asyncIterator]()
  }

  /** Oturumun girdi akışı: kuyruktaki mesajları sırayla verir, yenisi gelene kadar bekler. */
  private async *prompt(): AsyncGenerator<SDKUserMessage> {
    while (!this.closed) {
      while (this.inbox.length) yield this.inbox.shift()!
      await new Promise<void>((resolve) => (this.wake = resolve))
    }
  }

  async turn(content: ContentBlock[]): Promise<SDKResultMessage> {
    this.inbox.push({
      type: 'user',
      message: { role: 'user', content: content as never },
      parent_tool_use_id: null,
    })
    this.wake?.()
    for (;;) {
      const next = await this.events.next()
      if (next.done) throw new ArgusError('SUBSCRIPTION', 'Claude Code oturumu yanıt vermeden kapandı.')
      const value = next.value as { type?: string; rate_limit_info?: unknown }
      if (value.type === 'rate_limit_event') latestLimits = planLimitsOf(value.rate_limit_info) ?? latestLimits
      if (value.type === 'result') return next.value as SDKResultMessage
    }
  }

  async useModel(model: string): Promise<void> {
    if (model === this.model) return
    await this.q.setModel(model)
    this.model = model
  }

  close(): void {
    clearTimeout(this.timer)
    this.closed = true
    this.wake?.()
    this.q.close()
  }
}

/** Mesajdaki araç çağrısı kimlikleri (konuşmanın oturum anahtarı); araç çağrısı yoksa boş. */
const toolIdsOf = (message: { content?: unknown } | undefined): string =>
  (Array.isArray(message?.content) ? (message.content as Array<{ type?: string; id?: string }>) : [])
    .filter((b) => b.type === 'tool_use')
    .map((b) => b.id)
    .join(',')

export function subscriptionModel(run: QueryFn = query): CreateMessage {
  const live = new Map<string, Session>()
  const keep = (key: string, session: Session) => {
    live.set(key, session)
    session.timer = setTimeout(() => {
      live.delete(key)
      session.close()
    }, IDLE_MS)
    session.timer.unref?.()
    while (live.size > MAX_SESSIONS) {
      const [oldest, stale] = live.entries().next().value!
      live.delete(oldest)
      stale.close()
    }
  }
  return async (params, role?: ModelRole) => {
    const model = String(params.model)
    const key = params.messages.length > 1 ? toolIdsOf(params.messages.at(-2)) : ''
    let session = key ? live.get(key) : undefined
    let content: ContentBlock[]
    if (session) {
      live.delete(key)
      clearTimeout(session.timer)
      await session.useModel(model)
      content = transcriptOf({ ...params, messages: params.messages.slice(-1) })
    } else {
      const format = params.tools?.length
        ? callSchema(params)
        : (params.output_config?.format as { schema?: Record<string, unknown> } | undefined)?.schema
      session = new Session(
        run,
        {
          model,
          systemPrompt: systemOf(params),
          tools: [],
          settingSources: [],
          persistSession: false,
          maxTurns: SESSION_TURNS,
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: undefined,
            CLAUDE_AGENT_SDK_CLIENT_APP: `zeyrek-argus/${role ?? 'model'}`,
          },
          ...(params.output_config?.effort ? { effort: params.output_config.effort } : {}),
          ...(format ? { outputFormat: { type: 'json_schema', schema: format } } : {}),
        },
        model,
      )
      content = transcriptOf(params)
    }
    let message: Message
    try {
      const result = await session.turn(content)
      message = messageOf(params, result, session.used)
      session.used = totalsOf(result)
    } catch (error) {
      session.close()
      throw error instanceof ArgusError
        ? error
        : subscriptionError(error instanceof Error ? error.message : String(error))
    }
    const next = params.tools?.length ? toolIdsOf(message) : ''
    if (next) keep(next, session)
    else session.close()
    return message
  }
}
