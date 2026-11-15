import type { RunTrace } from '../runs/trace.ts'
import type { McpClient, McpToolInfo } from './mcp.ts'

/**
 * Modelin platforma okuma kapısı: uygulamanın tanımlarını (sayfa şeması, akış, süreç, mikroservis, varlık, kayıt…)
 * MCP'nin okuma araçlarıyla okur. Kapı `McpClient`'tadır (yalnız okuma işaretli, kara liste dışı); burada:
 * - dizin her aracın girdi alanlarını taşır (zorunlular `*`): model şemayı tahmin etmez (KOS-2026-0038: tahmin
 *   okumaların altıda biriydi),
 * - ortam her çağrıda koşunun ortamına sabitlenir (model başka ortam, özellikle production, okuyamaz); şemada olup
 *   verilmeyen proje/uygulama alanları koşunun bağlamından doldurulur,
 * - uzun sonuç dilimlenir: ilk `READ_LIMIT` karakter döner, devamı aynı okumayla `devam` konumundan istenir (sonuç
 *   bellekte tutulur, platforma yeniden gidilmez),
 * - her okuma koşu izine yazılır.
 * Hata modele metin olarak döner (araç yanlışsa şemayı görür, düzeltir); koşuyu düşürmez.
 */
export const READ_LIMIT = 12_000
const CACHED_RESULTS = 30
const CONTEXT_KEYS = ['environment', 'project', 'projectId', 'application', 'applicationId']

export interface ReadContext {
  project: string
  application: string
  environment: string
  projectId: string
  applicationId: string
}

const firstSentence = (text: string) =>
  (text.split(/(?<=[.!?])\s/)[0] ?? '').replace(/\s+/g, ' ').slice(0, 140)

const propertiesOf = (schema: unknown) =>
  (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {}

const hasProperty = (schema: unknown, name: string) => Boolean(propertiesOf(schema)[name])

/** Aracın girdi alanları, bağlamın doldurduğu alanlar hariç; zorunlular `*` ile: `id*, view, part`. */
function fieldsOf(schema: unknown): string {
  const required = new Set((schema as { required?: string[] } | null)?.required ?? [])
  return Object.keys(propertiesOf(schema))
    .filter((key) => !CONTEXT_KEYS.includes(key))
    .map((key) => (required.has(key) ? `${key}*` : key))
    .join(', ')
}

export class PlatformReader {
  private readonly tools: Map<string, McpToolInfo>
  private readonly results = new Map<string, string>()

  constructor(
    private readonly client: McpClient,
    readonly context: ReadContext,
    private readonly trace: RunTrace | null,
  ) {
    this.tools = new Map(client.readTools().map((t) => [t.name, t]))
  }

  /** Araç dizini: ad(girdi alanları) — tek cümle (araç açıklamasına girer, önbellekte durur). */
  index(): string {
    return [...this.tools.values()]
      .map((t) => `${t.name}(${fieldsOf(t.inputSchema)}) — ${firstSentence(t.description)}`)
      .join('\n')
  }

  /** Bağlam satırı: modelin kimlik parametrelerini doğru doldurması için. */
  contextLine(): string {
    const c = this.context
    return `project=${c.project} (projectId=${c.projectId}), application=${c.application} (applicationId=${c.applicationId}), environment=${c.environment}`
  }

  describe(name: string): string {
    const tool = this.tools.get(name)
    if (!tool) return `'${name}' okuma araçları arasında yok. Dizindeki adlardan birini kullan.`
    return `${tool.name}: ${tool.description}\nGirdi şeması: ${JSON.stringify(tool.inputSchema)}`
  }

  /** Okur; `offset` > 0 ise aynı okumanın o konumdan devamını döner. */
  async read(name: string, input: string, offset = 0): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) return `'${name}' okuma araçları arasında yok. Dizindeki adlardan birini kullan.`
    let args: Record<string, unknown>
    try {
      const parsed: unknown = input.trim() ? JSON.parse(input) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('nesne değil')
      args = parsed as Record<string, unknown>
    } catch {
      return `Girdi JSON nesnesi olmalı. ${this.describe(name)}`
    }
    if (hasProperty(tool.inputSchema, 'environment') || 'environment' in args)
      args = { ...args, environment: this.context.environment }
    // Bağlam alanları (proje, uygulama) şemada varsa ve model vermediyse koşunun bağlamından doldurulur: verilmeyen
    // proje listeyi sessizce boş döndürüyordu (KOS-2026-0037 izi).
    const c = this.context
    const fill: Record<string, string> = {
      project: c.project,
      projectId: c.projectId,
      application: c.application,
      applicationId: c.applicationId,
    }
    for (const [key, value] of Object.entries(fill))
      if (hasProperty(tool.inputSchema, key) && !(key in args)) args = { ...args, [key]: value }
    const key = `${name}:${JSON.stringify(args)}`
    let raw = this.results.get(key)
    if (raw === undefined) {
      const started = Date.now()
      try {
        raw = JSON.stringify(await this.client.call(name, args))
        this.trace?.mcp(name, args, Date.now() - started, raw, null)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.trace?.mcp(name, args, Date.now() - started, null, message)
        return `Okunamadı: ${message.slice(0, 600)}\n${this.describe(name)}`
      }
      this.results.set(key, raw)
      if (this.results.size > CACHED_RESULTS) this.results.delete(this.results.keys().next().value!)
    }
    const from = Math.max(0, Math.min(offset, raw.length))
    const slice = raw.slice(from, from + READ_LIMIT)
    return from + READ_LIMIT < raw.length
      ? `${slice}\n… (${raw.length} karakterin ${from}–${from + READ_LIMIT} arası; devamı için aynı okumayı devam=${from + READ_LIMIT} ile yap)`
      : slice
  }
}
