import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it } from 'vitest'
import { UsageMeter, type Message, type MessageParams } from './model.ts'
import {
  callSchema,
  messageOf,
  subscriptionError,
  subscriptionModel,
  systemOf,
  transcriptOf,
} from './subscription.ts'

const tool = {
  name: 'tikla',
  description: 'Öğeye tıklar.',
  input_schema: { type: 'object', properties: { ref: { type: 'string' } } },
}
const params = (over: Partial<MessageParams>): MessageParams =>
  ({ model: 'claude-sonnet-5-5', max_tokens: 100, messages: [], ...over }) as MessageParams
const success = (over: Record<string, unknown>) =>
  ({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '',
    modelUsage: {
      'claude-sonnet-5-5': {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 100,
        cacheCreationInputTokens: 20,
      },
    },
    ...over,
  }) as unknown as SDKResultMessage

describe('Claude hesabıyla çağrı', () => {
  it('talimat metin bloklarından; araçlı çağrıda araç listesi ve şemaları eklenir', () => {
    const system = [
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B' },
    ]
    expect(systemOf(params({ system } as never))).toBe('A\nB')
    const withTools = systemOf(params({ system: 'Temel', tools: [tool] } as never))
    expect(withTools).toContain('Temel')
    expect(withTools).toContain('- tikla: Öğeye tıklar.')
    expect(withTools).toContain('"ref"')
  })

  it('konuşma tek mesaja aktarılır: önceki turlar metin, son mesajın ve araç sonucunun görseli görsel bloğu', () => {
    const image = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }
    const content = transcriptOf(
      params({
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Görev' }, image] },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Bakıyorum' },
              { type: 'tool_use', id: 't1', name: 'tikla', input: { ref: 'e1' } },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 't1',
                content: [{ type: 'text', text: 'Tıklandı' }, image],
              },
            ],
          },
        ],
      } as never),
    )
    const history = (content[0] as { text: string }).text
    expect(history).toContain('### Kullanıcı\nGörev\n[görüntü]')
    expect(history).toContain('[asistan] Bakıyorum')
    expect(history).toContain('[asistan aracı çağırdı] tikla {"ref":"e1"}')
    expect(content.slice(1)).toEqual([{ type: 'text', text: '[araç sonucu] Tıklandı\n[görüntü]' }, image])
  })

  it('araç çağrısı yapılandırılmış çıktıdan tool_use bloklarına; kullanım modele göre toplanır', () => {
    expect(callSchema(params({ tools: [tool] } as never))).toMatchObject({
      properties: { cagrilar: { items: { properties: { arac: { enum: ['tikla'] } } } } },
    })
    const message = messageOf(
      params({ tools: [tool] } as never),
      success({ structured_output: { cagrilar: [{ arac: 'tikla', girdi: { ref: 'e7' } }] } }),
    )
    expect(message.stop_reason).toBe('tool_use')
    expect(message.content).toEqual([
      expect.objectContaining({ type: 'tool_use', name: 'tikla', input: { ref: 'e7' } }),
    ])
    expect(message.usage).toMatchObject({
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 20,
    })
    const json = messageOf(
      params({ output_config: { format: { type: 'json_schema', schema: {} } } } as never),
      success({ structured_output: { sonuc: 5 } }),
    )
    expect(json.content).toEqual([{ type: 'text', text: '{"sonuc":5}' }])
  })

  it('oturum yoksa kullanıcının yapacağı işi söyler; kullanım sınırı ayrı hata', () => {
    expect(subscriptionError('Failed to authenticate: OAuth session expired').code).toBe('SUBSCRIPTION_AUTH')
    expect(subscriptionError('Failed to authenticate: OAuth session expired').message).toContain('/login')
    expect(() => messageOf(params({}), success({ is_error: true, api_error_status: 429 }))).toThrow(
      'kullanım sınırı doldu',
    )
    expect(() => messageOf(params({}), success({ is_error: true, result: 'Beklenmeyen' }))).toThrow(
      'Claude hesabıyla çağrı başarısız: Beklenmeyen',
    )
  })
})

describe('kullanım sayacı', () => {
  it('API anahtarıyla dolar yazılır; Claude hesabıyla token sayılır, dolar 0 ve sağlayıcı abonelik', () => {
    const reply = {
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as never
    const api = new UsageMeter('api')
    api.add('claude-sonnet-5-5', reply, 'explorer')
    expect(api.usage).toMatchObject({ costUsd: 2, provider: 'api' })
    const plan = new UsageMeter('abonelik')
    plan.add('claude-sonnet-5-5', reply, 'explorer')
    expect(plan.usage).toMatchObject({ input: 1_000_000, costUsd: 0, provider: 'abonelik' })
    expect(plan.usage.roles?.explorer).toMatchObject({ requests: 1, costUsd: 0 })
  })
})

describe('önbellek işaretleri', () => {
  it("motorun cache_control işaretleri Claude Code'un 1 saatlik süresiyle aktarılır; işaretsiz blok işaretsiz kalır", () => {
    const content = transcriptOf(
      params({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Notlar', cache_control: { type: 'ephemeral' } },
              { type: 'text', text: 'Ekran' },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
            ],
          },
        ],
      } as never),
    )
    expect(content).toEqual([
      { type: 'text', text: 'Notlar', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'Ekran' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
    ])
  })
})

/** Sahte Claude Code: her kullanıcı mesajına bir tur sonucu döner; aldığı mesajları, model değişikliklerini, kapanışı tutar. */
function fakeClaude(reply: (turn: number) => unknown) {
  const sessions: Array<{ received: unknown[]; models: string[]; closed: boolean }> = []
  const run = ((args: {
    prompt: AsyncIterable<{ message: { content: unknown } }>
    options: { model: string }
  }) => {
    const session = { received: [] as unknown[], models: [args.options.model], closed: false }
    sessions.push(session)
    const events = (async function* () {
      let turn = 0
      for await (const message of args.prompt) {
        session.received.push(message.message.content)
        turn += 1
        yield {
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: '',
          // SDK sürekli oturumda kullanımı birikimli verir.
          modelUsage: {
            m: {
              inputTokens: 100 * turn,
              outputTokens: 10 * turn,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
          structured_output: reply(turn),
        }
      }
    })()
    return Object.assign(events, {
      setModel: async (model: string) => void session.models.push(model),
      close: () => {
        session.closed = true
      },
    })
  }) as never
  return { run, sessions }
}

describe('sürekli oturum', () => {
  const call = (arac: string) => ({ cagrilar: [{ arac, girdi: { ref: 'e1' } }] })
  const base = { model: 'claude-sonnet-5-5', max_tokens: 100, system: 'Talimat', tools: [tool] }

  it('araçlı konuşma tek oturumda sürer: devam turunda yalnız yeni mesaj gider, model oturum içinde değişir', async () => {
    const claude = fakeClaude((turn) => (turn < 3 ? call('tikla') : { cagrilar: [] }))
    const model = subscriptionModel(claude.run)
    const task = { role: 'user' as const, content: 'GÖREV: Ayrıntıya bak' }
    const first = await model({ ...base, messages: [task] } as never, 'explorer')
    const result = (m: Message, text: string) => [
      { role: 'assistant' as const, content: m.content },
      {
        role: 'user' as const,
        content: [{ type: 'tool_result', tool_use_id: (m.content[0] as { id: string }).id, content: text }],
      },
    ]
    const second = await model(
      { ...base, messages: [task, ...result(first, 'Tıklandı')] } as never,
      'explorer',
    )
    const conversation = [task, ...result(first, 'Tıklandı'), ...result(second, 'Pencere açıldı')]
    const third = await model(
      { ...base, model: 'claude-opus-5-5', messages: conversation } as never,
      'explorer',
    )
    expect(claude.sessions).toHaveLength(1)
    const [session] = claude.sessions
    expect(JSON.stringify(session!.received[0])).toContain('GÖREV: Ayrıntıya bak')
    expect(session!.received[1]).toEqual([{ type: 'text', text: '[araç sonucu] Tıklandı' }])
    expect(session!.received[2]).toEqual([{ type: 'text', text: '[araç sonucu] Pencere açıldı' }])
    expect(session!.models).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5'])
    // Birikimli kullanım tur farkına çevrilir: her tur yalnız kendi token'ını sayar.
    expect([first, second, third].map((m) => m.usage.input_tokens)).toEqual([100, 100, 100])
    // Araç çağrısız yanıt konuşmayı bitirir: oturum kapanır.
    expect(third.stop_reason).toBe('end_turn')
    expect(session!.closed).toBe(true)
  })

  it('tek seferlik çağrı oturum tutmaz; tanınmayan konuşma tam geçmişle yeni oturum açar', async () => {
    const claude = fakeClaude(() => ({ sonuc: 1 }))
    const model = subscriptionModel(claude.run)
    await model(
      {
        model: 'claude-opus-5-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'YARGIÇ GÖREVİ' }],
        output_config: { format: { type: 'json_schema', schema: {} } },
      } as never,
      'judge',
    )
    expect(claude.sessions[0]!.closed).toBe(true)
    const tools = fakeClaude(() => call('tikla'))
    const loop = subscriptionModel(tools.run)
    await loop(
      {
        ...base,
        messages: [
          { role: 'user', content: 'GÖREV' },
          { role: 'assistant', content: [{ type: 'tool_use', id: 'bilinmeyen', name: 'tikla', input: {} }] },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'bilinmeyen', content: 'Tıklandı' }],
          },
        ],
      } as never,
      'explorer',
    )
    expect(tools.sessions).toHaveLength(1)
    expect(JSON.stringify(tools.sessions[0]!.received[0])).toContain('ÖNCEKİ KONUŞMA')
  })
})
