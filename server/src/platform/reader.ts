import type { PlatformRead } from '@argus/shared'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
/** İzleme ekranına giden sonucun başı (olaya yazılır). */
export const PREVIEW_LIMIT = 4_000
const CACHED_RESULTS = 30
/**
 * Veri okuyan araçlar (sonucu yazmayla değişir): kayıt, sorgu önizlemesi, satır, çalıştırma geçmişi, örnek, sayım.
 * Ad kalıbıyla tanınır; tanımadığı yeni araç güvenli tarafta kalsın diye tanım değil veri sayılır (aşağıda).
 */
const DATA_TOOL = /^(row_|query_preview|.*_(preview|execute|histor(y|ies)|instance|instances|count|sample|rows?)$)/
/** Tanım okuyan araçlar (Argus'un yazması değiştirmez): `<tür>_get`, `_list`, şema ve özet okumaları. */
const DEFINITION_TOOL = /_(get|list|schema|scheme|outline|overview|describe|tree|guide)$/
/** Önbellek anahtarının (`<araç>:<girdi>`) aracı veri okuması mı; tanınmayan araç veri sayılır (güvenli taraf). */
const isDataRead = (key: string) => {
  const tool = key.slice(0, key.indexOf(':'))
  return DATA_TOOL.test(tool) || !DEFINITION_TOOL.test(tool)
}
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

type SchemaField = { type?: string; items?: { type?: string }; enum?: unknown[] } | undefined

/** Dizinde seçenekleri gösterilen alanın en çok seçenek sayısı (uzun listeler dizini şişirir; hata yine şemayı gösterir). */
const ENUM_HINT_LIMIT = 6

const enumOf = (field: SchemaField): string[] | null =>
  Array.isArray(field?.enum) && field.enum.every((v) => typeof v === 'string') ? (field.enum as string[]) : null

const propertiesOf = (schema: unknown) =>
  (schema as { properties?: Record<string, unknown> } | null)?.properties ?? {}

const hasProperty = (schema: unknown, name: string) => Boolean(propertiesOf(schema)[name])

/**
 * Aracın girdi alanları, bağlamın doldurduğu alanlar hariç; zorunlular `*` ile, kısa seçenek listesi parantezde:
 * `id*, view(full|outline|part), method*(GET|POST|PUT|DELETE)`. Seçenekler aracın şemasından çalışma anında okunur
 * (platform değişince dizin de değişir); model değeri tahmin etmez (KOS-2026-0061: hataların yarısı "post" gibi
 * tahminlerdi).
 */
function fieldsOf(schema: unknown): string {
  const required = new Set((schema as { required?: string[] } | null)?.required ?? [])
  return (Object.entries(propertiesOf(schema)) as Array<[string, SchemaField]>)
    .filter(([key]) => !CONTEXT_KEYS.includes(key))
    .map(([key, field]) => {
      const options = enumOf(field)
      const hint = options && options.length <= ENUM_HINT_LIMIT ? `(${options.join('|')})` : ''
      return `${required.has(key) ? `${key}*` : key}${hint}`
    })
    .join(', ')
}

/** Okumanın ya da yazmanın akış adımı: sonuç cümlesi ve izleme ekranına giden önizleme. */
export function readStep(read: PlatformRead): { outcome: string; platform: PlatformRead } {
  const failed = /^(Okunamadı|Yazılamadı|Girdi JSON)/.test(read.result) || !read.result
  const verb = read.write
    ? failed
      ? 'Platforma yazılamadı'
      : 'Platforma yazıldı'
    : failed
      ? 'Platformdan okunamadı'
      : 'Platformdan okundu'
  return {
    outcome: `${verb}: ${read.tool}`,
    platform: { ...read, result: read.result.slice(0, PREVIEW_LIMIT) },
  }
}

const listOf = (tools: Map<string, McpToolInfo>) =>
  [...tools.values()]
    .map((t) => `${t.name}(${fieldsOf(t.inputSchema)}) — ${firstSentence(t.description)}`)
    .join('\n')

export class PlatformReader {
  private readonly tools: Map<string, McpToolInfo>
  private readonly writes: Map<string, McpToolInfo>
  private readonly results = new Map<string, string>()
  /** Bu koşuda `row_create` ile oluşturulup henüz silinmemiş kayıtlar (varlık → kimlikler): koşu sonunda silinir. */
  private readonly created = new Map<string, Set<string>>()
  /** Bu koşuda başarılı yazma sayısı (koşu sonu temizliğine gerek var mı). */
  wrote = 0

  /**
   * `ledger`: oluşturulan kayıtların dosyası (`data/runs/<id>/test-kayitlari.json`). Her yazmada güncellenir; koşu
   * durdurulunca ya da sunucu kapanınca kayıtlar unutulmaz: devam ettirilen koşu aynı kayıtlarla sürer, koşu bitince ya
   * da kapatılınca silinir.
   */
  constructor(
    private readonly client: McpClient,
    readonly context: ReadContext,
    private readonly trace: RunTrace | null,
    private readonly ledger: string | null = null,
  ) {
    if (ledger && existsSync(ledger)) {
      try {
        const saved = JSON.parse(readFileSync(ledger, 'utf8')) as Record<string, string[]>
        for (const [entityId, ids] of Object.entries(saved)) if (ids.length) this.created.set(entityId, new Set(ids))
      } catch {
        // Bozuk dosya koşuyu düşürmez; kayıtlar koşu sonu temizlik vakasında aranır.
      }
    }
    this.tools = new Map(client.readTools().map((t) => [t.name, t]))
    // Yazma yalnız production dışında: production'a koşulmaz, burada da kapı kapalı kalır.
    this.writes = new Map(
      context.environment === 'production' ? [] : client.writeTools().map((t) => [t.name, t]),
    )
  }

  /** Araç dizini: ad(girdi alanları) — tek cümle (araç açıklamasına girer, önbellekte durur). */
  index(): string {
    return listOf(this.tools)
  }

  /** Yazma araçlarının dizini; yazma kapalıysa boş. */
  writeIndex(): string {
    return listOf(this.writes)
  }

  /** Bağlam satırı: modelin kimlik parametrelerini doğru doldurması için. */
  contextLine(): string {
    const c = this.context
    return `project=${c.project} (projectId=${c.projectId}), application=${c.application} (applicationId=${c.applicationId}), environment=${c.environment}`
  }

  describe(name: string): string {
    const tool = this.tools.get(name) ?? this.writes.get(name)
    if (!tool) return `'${name}' araçlar arasında yok. Dizindeki adlardan birini kullan.`
    return `${tool.name}: ${tool.description}\nGirdi şeması: ${JSON.stringify(tool.inputSchema)}`
  }

  /** Okur; `offset` > 0 ise aynı okumanın o konumdan devamını döner. */
  async read(name: string, input: string, offset = 0): Promise<string> {
    const tool = this.tools.get(name)
    if (!tool) return `'${name}' okuma araçları arasında yok. Dizindeki adlardan birini kullan.`
    const args = this.argsOf(tool, input)
    if (typeof args === 'string') return args
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
    return this.sliceOf(raw, offset)
  }

  /**
   * Yazar (test verisi ya da uygulamanın akışını çalıştırma); ortam koşununkine sabittir. Yazmadan sonra okuma
   * önbelleği boşaltılır (veri değişti). Sonuç önbelleğe alınmaz: aynı yazma iki kez istenirse iki kez yapılır.
   */
  async write(name: string, input: string): Promise<string> {
    const tool = this.writes.get(name)
    if (!tool) return `Yazılamadı: '${name}' yazma araçları arasında yok. Dizindeki adlardan birini kullan.`
    const args = this.argsOf(tool, input)
    if (typeof args === 'string') return args
    const started = Date.now()
    // Yazma yalnız veridir (Argus tanımı değiştirmez, AGENTS.md ilke 1): yalnız veri okumaları (kayıt, sorgu, çalıştırma
    // sonucu) eskir; tanım okumaları (akış, servis, sayfa, varlık şeması) önbellekte kalır. Aynı tanım her yazmadan sonra
    // yeniden okunuyordu (KOS-2026-0061: okumaların %12'si).
    for (const cached of [...this.results.keys()]) if (isDataRead(cached)) this.results.delete(cached)
    try {
      const result = await this.client.call(name, args)
      const raw = JSON.stringify(result)
      this.trace?.mcp(name, args, Date.now() - started, raw, null)
      this.track(name, args, result)
      this.wrote += 1
      return this.sliceOf(raw, 0)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.trace?.mcp(name, args, Date.now() - started, null, message)
      return `Yazılamadı: ${message.slice(0, 600)}\n${this.describe(name)}`
    }
  }

  /**
   * Koşunun bıraktığı test kayıtlarını siler (modelin silmeyi unuttuğu ya da silemediği; KOŞU: kimlik sayı gönderildiği
   * için silme reddedildi, kayıt development'ta kaldı). Silinen kayıt sayısını döner; hata koşuyu düşürmez.
   */
  async cleanup(): Promise<number> {
    let removed = 0
    for (const [entityId, ids] of this.created) {
      if (!ids.size) continue
      const list = [...ids]
      const args = {
        entityId,
        ids: list,
        environment: this.context.environment,
        project: this.context.project,
      }
      const started = Date.now()
      try {
        const raw = JSON.stringify(await this.client.call('row_delete', args))
        this.trace?.mcp('row_delete', args, Date.now() - started, raw, null)
        removed += list.length
        ids.clear()
      } catch (error) {
        this.trace?.mcp('row_delete', args, Date.now() - started, null, String(error))
      }
    }
    this.save()
    return removed
  }

  /** Silinmeyi bekleyen test kaydı sayısı. */
  get pending(): number {
    return [...this.created.values()].reduce((sum, ids) => sum + ids.size, 0)
  }

  private save(): void {
    if (!this.ledger) return
    const data = Object.fromEntries([...this.created].filter(([, ids]) => ids.size).map(([e, ids]) => [e, [...ids]]))
    writeFileSync(this.ledger, JSON.stringify(data))
  }

  /** Oluşturulan kayıtların kimlikleri izlenir, silinenler izden düşer (koşu sonu temizliği için). */
  private track(name: string, args: Record<string, unknown>, result: unknown): void {
    const entityId = typeof args.entityId === 'string' ? args.entityId : null
    if (!entityId) return
    const ids = this.created.get(entityId) ?? new Set<string>()
    if (name === 'row_create') {
      const value = result as { ids?: Array<{ id?: unknown }>; data?: { id?: unknown } } | null
      for (const item of value?.ids ?? []) if (item.id !== undefined) ids.add(String(item.id))
      if (value?.data?.id !== undefined) ids.add(String(value.data.id))
      this.created.set(entityId, ids)
    }
    if (name === 'row_delete')
      for (const id of [args.id, ...(Array.isArray(args.ids) ? args.ids : [])])
        if (id !== undefined) ids.delete(String(id))
    this.save()
  }

  /** Girdi JSON'u; ortam koşununkine sabitlenir, şemadaki proje/uygulama alanları verilmediyse bağlamdan dolar. */
  private argsOf(tool: McpToolInfo, input: string): Record<string, unknown> | string {
    let args: Record<string, unknown>
    try {
      const parsed: unknown = input.trim() ? JSON.parse(input) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('nesne değil')
      args = parsed as Record<string, unknown>
    } catch {
      return `Girdi JSON nesnesi olmalı. ${this.describe(tool.name)}`
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
    // Şemada metin olan alana verilen sayı metne çevrilir (kimlikler): model `id: 43` yazınca araç reddediyordu.
    for (const [key, spec] of Object.entries(propertiesOf(tool.inputSchema)) as Array<
      [string, SchemaField]
    >) {
      const value = args[key]
      if (spec?.type === 'string' && typeof value === 'number') args = { ...args, [key]: String(value) }
      // Seçenekli alanda yalnız harf büyüklüğü farklı değer şemadaki yazımına çevrilir ("post" → "POST"); tek eşleşme
      // yoksa dokunulmaz, araç hatayı şemayla döner.
      const options = enumOf(spec)
      if (options && typeof value === 'string' && !options.includes(value)) {
        const matches = options.filter((o) => o.toLocaleLowerCase('en') === value.toLocaleLowerCase('en'))
        if (matches.length === 1) args = { ...args, [key]: matches[0] }
      }
      if (spec?.type === 'array' && spec.items?.type === 'string' && Array.isArray(value))
        args = { ...args, [key]: value.map((v) => (typeof v === 'number' ? String(v) : v)) }
    }
    return args
  }

  private sliceOf(raw: string, offset: number): string {
    const from = Math.max(0, Math.min(offset, raw.length))
    const slice = raw.slice(from, from + READ_LIMIT)
    return from + READ_LIMIT < raw.length
      ? `${slice}\n… (${raw.length} karakterin ${from}–${from + READ_LIMIT} arası; devamı için aynı okumayı devam=${from + READ_LIMIT} ile yap)`
      : slice
  }
}
