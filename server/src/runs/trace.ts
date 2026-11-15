import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ModelRole } from '@argus/shared'
import type { CreateMessage, Message, MessageParams } from '../agent/model.ts'

/**
 * Koşunun tam yerel izi: her model çağrısı (rol, model, süre, kullanım, yeni girdi, yanıt) ve platform okuması
 * `data/runs/<id>/iz/iz.jsonl` dosyasına satır satır yazılır. Yalnız bu bilgisayarda durur, Git'e girmez; yerel
 * temizlik onu koşu kaydıyla birlikte siler. Amaç koşu sonrası inceleme: modelin ne gördüğü, neye karar verdiği.
 *
 * Boyut: konuşmanın tamamı her çağrıda yeniden yazılmaz, yalnız son (yeni) mesaj yazılır; sabit talimat ilk görülüşte
 * bir kez. Görsel ve belge verisi yer tutucuyla değiştirilir.
 */

const placeholder = (kind: string, data: unknown) =>
  `[${kind} ${typeof data === 'string' ? Math.round((data.length * 3) / 4 / 1024) : 0} KB]`

/** Görsel/belge base64'ünü yer tutucuya çevirir; diğer her şey olduğu gibi kalır. */
export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const source = record.source as Record<string, unknown> | undefined
  if ((record.type === 'image' || record.type === 'document') && source?.type === 'base64')
    return {
      type: record.type,
      data: placeholder(record.type === 'image' ? 'görüntü' : 'belge', source.data),
    }
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, scrub(v)]))
}

export class RunTrace {
  private readonly file: string
  private readonly systems = new Set<string>()

  constructor(runDir: string) {
    const dir = join(runDir, 'iz')
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'iz.jsonl')
  }

  private write(entry: Record<string, unknown>): void {
    appendFileSync(this.file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  }

  /** Model çağrısını izleyen sarmalayıcı: istek ve yanıt (ya da hata) yazılır, sonuç olduğu gibi döner. */
  wrap(model: CreateMessage): CreateMessage {
    return async (params: MessageParams, role?: ModelRole) => {
      const started = Date.now()
      const system = JSON.stringify(params.system ?? '')
      if (!this.systems.has(system)) {
        this.systems.add(system)
        this.write({ t: 'talimat', id: this.systems.size, system: params.system ?? null })
      }
      const base = {
        t: 'model',
        role: role ?? null,
        model: params.model,
        talimat: [...this.systems].indexOf(system) + 1,
        girdi: scrub(params.messages.at(-1)),
      }
      try {
        const message: Message = await model(params, role)
        this.write({
          ...base,
          ms: Date.now() - started,
          kullanim: message.usage,
          dur: message.stop_reason,
          yanit: message.content,
        })
        return message
      } catch (error) {
        this.write({
          ...base,
          ms: Date.now() - started,
          hata: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }
  }

  /** Platform (MCP) okuması: araç, parametreler, süre, sonuç (uzunsa başı) ya da hata. */
  mcp(tool: string, args: unknown, ms: number, result: string | null, error: string | null): void {
    this.write({ t: 'mcp', tool, args, ms, sonuc: result?.slice(0, 20_000) ?? null, hata: error })
  }
}
