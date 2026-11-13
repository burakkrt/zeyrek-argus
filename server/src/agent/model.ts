import Anthropic from '@anthropic-ai/sdk'
import type { Usage } from '@argus/shared'
import { ArgusError } from '../errors.ts'

export type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
export type Message = Anthropic.Beta.Messages.BetaMessage
export type ContentBlock = Anthropic.Beta.BetaContentBlockParam
export type MessageParam = Anthropic.Beta.BetaMessageParam
export type Tool = Anthropic.Beta.BetaTool

/** Modele tek istek. Gerçekte Anthropic API'si; testte senaryolu sahte model. */
export type CreateMessage = (params: MessageParams) => Promise<Message>

/** Reddedilen istek, uygun modele sunucu tarafında devredilir (Opus 5.5 için önerilen varsayılan). */
export function anthropicModel(apiKey: string): CreateMessage {
  const client = new Anthropic({ apiKey })
  return (params) =>
    client.beta.messages.create({
      ...params,
      betas: [...(params.betas ?? []), 'server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
}

/** Milyon token başına dolar (2026-11 liste fiyatı). Listede olmayan modelin maliyeti gösterilmez. */
const PRICES: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  'claude-haiku-5-5': { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  'claude-fable-5-2': { input: 8, cacheWrite: 10, cacheRead: 0.2, output: 40 },
}

export const KNOWN_MODELS = Object.keys(PRICES)

export class UsageMeter {
  readonly usage: Usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, requests: 0, costUsd: 0 }

  add(model: string, message: Message): void {
    const u = message.usage
    const input = u.input_tokens
    const cacheWrite = u.cache_creation_input_tokens ?? 0
    const cacheRead = u.cache_read_input_tokens ?? 0
    const output = u.output_tokens
    this.usage.input += input
    this.usage.cacheWrite += cacheWrite
    this.usage.cacheRead += cacheRead
    this.usage.output += output
    this.usage.requests += 1
    const price = PRICES[model]
    if (!price || this.usage.costUsd === null) {
      this.usage.costUsd = null
      return
    }
    const cost =
      (input * price.input +
        cacheWrite * price.cacheWrite +
        cacheRead * price.cacheRead +
        output * price.output) /
      1_000_000
    this.usage.costUsd = Math.round((this.usage.costUsd + cost) * 10_000) / 10_000
  }
}

export function describeModelError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError)
    return 'Anthropic anahtarı geçersiz (ANTHROPIC_API_KEY).'
  if (error instanceof Anthropic.RateLimitError)
    return 'Anthropic hız sınırına takıldı; biraz sonra yeniden deneyin.'
  if (error instanceof Anthropic.APIError)
    return `Yapay zekâ isteği başarısız (HTTP ${error.status}): ${error.message}`
  if (error instanceof ArgusError) return error.message
  return error instanceof Error ? error.message : String(error)
}

/** Yanıttaki metin (yapılandırılmış çıktıda JSON). */
export const textOf = (message: Message) =>
  message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')

export function jsonOf<T>(message: Message): T | null {
  const text = textOf(message).trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return null
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
