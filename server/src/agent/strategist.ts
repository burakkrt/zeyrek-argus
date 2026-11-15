import type { CatalogPage, ItemSource, RunStrategy, StrategyItem, StrategyKind } from '@argus/shared'
import type { PlatformReader } from '../platform/reader.ts'
import type { Attachment } from '../runs/attachments.ts'
import type { CreateMessage, MessageParams, Tool, UsageMeter } from './model.ts'
import { toolLoop } from './tool-loop.ts'
import { platformTools } from './tools.ts'

/**
 * Anla adımı: koşu başında güçlü model isteği çözümler, gerekirse platform tanımlarını okuyarak (MCP) koşunun
 * stratejisini yazar — isteğin türü, cevaplanacak sorular, başarı ölçütü, tanımdan bilinenler, salt okumada
 * yapılamayanlar ve iş kalemleri (kaynak: tanım | ekran | ikisi). Yalnız girdi verilen koşuda sayfalar da burada
 * seçilir. Girdisiz koşu (yalnız sayfa seçildi) bu adımı atlar: seçilen sayfalar baştan sona taranır (`scanStrategy`).
 */
export const STRATEGY_MARKER = 'KOŞU STRATEJİSİ GÖREVİ'
const STRATEGY_CEILING = 30

const KINDS: StrategyKind[] = ['arayuz', 'kural', 'akis', 'karisik']
const SOURCES: ItemSource[] = ['tanim', 'ekran', 'ikisi']
const text = (value: string) => ({ type: 'text' as const, text: value })
const strings = { type: 'array', items: { type: 'string' } } as const

const PLAN_TOOL: Tool = {
  name: 'plani_yaz',
  description: 'Koşunun stratejisini yazar ve anla adımını bitirir.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      tur: { type: 'string', enum: KINDS },
      anlasilan: { type: 'string', description: 'Kullanıcının ne istediği, kendi cümlenle.' },
      sorular: { ...strings, description: 'Koşunun cevaplaması gereken sorular.' },
      basari: { type: 'string', description: 'Koşu ne olunca başarılı sayılır.' },
      bilinenler: {
        ...strings,
        description: 'Tanımdan öğrendiklerin, her biri kaynağıyla (araç, kayıt, alan).',
      },
      yapilamayan: {
        ...strings,
        description: 'Salt okumada yapılamayanlar ve nedeni (ör. aşama ilerletmek yazma ister).',
      },
      kalemler: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            baslik: { type: 'string' },
            amac: { type: 'string', description: 'Ne yapılacak, adım adım ve somut.' },
            kaynak: { type: 'string', enum: SOURCES },
            sayfa: {
              type: 'string',
              description: 'Ekran/ikisi kaleminde sayfa slug’ı; tanım kaleminde boş.',
            },
            tam_tarama: { type: 'boolean', description: 'Sayfanın tamamı taransın mı (arayüz taraması).' },
          },
          required: ['baslik', 'amac', 'kaynak', 'sayfa', 'tam_tarama'],
          additionalProperties: false,
        },
      },
    },
    required: ['tur', 'anlasilan', 'sorular', 'basari', 'bilinenler', 'yapilamayan', 'kalemler'],
    additionalProperties: false,
  },
}

interface RawPlan {
  tur: string
  anlasilan: string
  sorular: string[]
  basari: string
  bilinenler: string[]
  yapilamayan: string[]
  kalemler: Array<{ baslik: string; amac: string; kaynak: string; sayfa: string; tam_tarama: boolean }>
}

/** Girdisiz koşu: seçilen her sayfa baştan sona taranır. */
export function scanStrategy(pages: string[]): RunStrategy {
  return {
    kind: 'arayuz',
    understood: 'Seçilen sayfaların arayüz taraması.',
    questions: [],
    success: 'Sayfalardaki bütün sorunlar kanıtıyla bulunur.',
    known: [],
    infeasible: [],
    items: pages.map((page) => ({
      title: 'Sayfanın tamamı',
      goal: '',
      source: 'ekran',
      page,
      fullScan: true,
    })),
  }
}

/**
 * Modelin kalemlerini doğrular (strateji ve gözetmenin ek kalemleri): katalog dışı sayfa düşer, sayfası kalmayan
 * ekran kalemi tanım kalemine döner.
 */
export function normalizeItems(kalemler: RawPlan['kalemler'], catalog: CatalogPage[]): StrategyItem[] {
  const known = new Set(catalog.map((p) => p.slug))
  return kalemler.map((k) => {
    const source = SOURCES.includes(k.kaynak as ItemSource) ? (k.kaynak as ItemSource) : 'ikisi'
    const page = source !== 'tanim' && known.has(k.sayfa) ? k.sayfa : null
    return {
      title: k.baslik,
      goal: k.amac,
      source: page ? source : 'tanim',
      page,
      fullScan: page !== null && k.tam_tarama,
    }
  })
}

/**
 * Modelin planını doğrular (`normalizeItems`); kullanıcının seçtiği ama planda olmayan sayfa baştan sona taranır
 * (seçim kullanıcının açık isteğidir).
 */
export function normalizeStrategy(raw: RawPlan, catalog: CatalogPage[], selected: string[]): RunStrategy {
  const items = normalizeItems(raw.kalemler, catalog)
  for (const page of selected)
    if (!items.some((i) => i.page === page))
      items.push({ title: 'Sayfanın tamamı', goal: '', source: 'ekran', page, fullScan: true })
  return {
    kind: KINDS.includes(raw.tur as StrategyKind) ? (raw.tur as StrategyKind) : 'karisik',
    understood: raw.anlasilan,
    questions: raw.sorular,
    success: raw.basari,
    known: raw.bilinenler,
    infeasible: raw.yapilamayan,
    items,
  }
}

export async function planRun(input: {
  createMessage: CreateMessage
  meter: UsageMeter
  model: string
  system: MessageParams['system']
  reader: PlatformReader
  brief: string | null
  attachments: Attachment[]
  catalog: CatalogPage[]
  selected: string[]
  onRead: (tool: string, reason: string, ok: boolean) => void
}): Promise<RunStrategy | null> {
  const files = input.attachments
    .map((a) =>
      a.kind === 'text' ? `Ek: ${a.name}\n<<<EK\n${a.text.slice(0, 4000)}\nEK>>>` : `Ek: ${a.name}`,
    )
    .join('\n')
  const tools = [...platformTools(input.reader), PLAN_TOOL]
  const raw = await toolLoop<RawPlan>({
    finishTool: PLAN_TOOL.name,
    ceiling: STRATEGY_CEILING,
    call: (messages) =>
      input
        .createMessage(
          {
            model: input.model,
            max_tokens: 16_000,
            system: input.system,
            cache_control: { type: 'ephemeral' },
            tools,
            messages,
          },
          'planner',
        )
        .then((message) => {
          input.meter.add(input.model, message, 'planner')
          return message
        }),
    first: [
      text(
        `${STRATEGY_MARKER}: Kullanıcının isteğini çözümle ve bu koşunun stratejisini yaz. Önce isteğin türüne karar ver: ` +
          'arayüz taraması (ekranda ne görünüyor, tutarlı mı, çalışıyor mu), kural/akış sorusu (hangi koşulda ne olur, ' +
          'izin verir mi, atlanabilir mi), ya da karışık. Kural ve akış sorularının cevabı uygulamanın tanımındadır: ' +
          'platform_oku ile ilgili tanımları (akış, süreç, mikroservis, sayfa şeması, varlık) oku ve öğrendiklerini kaynağıyla ' +
          '"bilinenler"e yaz. Sonra iş kalemlerini çıkar; her kalemin kaynağı: tanim (yalnız platform okuması), ekran ' +
          '(tarayıcı, bir sayfada), ikisi (tanımı oku, sonucu ekranda teyit et). Veri değiştirmeyi gerektiren adım ' +
          '(kayıt oluşturmak, aşama ilerletmek, onaya göndermek) salt okumada denenemez: "yapilamayan"a nedeniyle yaz, ' +
          'yerine tanımdan çıkarılabileni kalem yap. İstek bir sayfanın ya da modülün genel arayüz kalitesini soruyorsa o ' +
          'sayfalar için tam_tarama=true kalem aç. Kalemler eksiksiz olsun ama istekle ilgisiz genel tarama ekleme.\n\n' +
          `İSTEK:\n${input.brief ?? '(yalnız dosya eklendi)'}\n${files}\n\n` +
          (input.selected.length
            ? `KULLANICININ SEÇTİĞİ SAYFALAR (kapsam bunlar; gerekirse bağlantılı sayfa eklenebilir): ${input.selected.join(', ')}\n\n`
            : 'Kullanıcı sayfa seçmedi: ekran kalemlerinin sayfalarını aşağıdaki listeden sen seç.\n\n') +
          `UYGULAMANIN SAYFALARI (slug — ad):\n${input.catalog.map((p) => `${p.slug} — ${p.name}`).join('\n')}`,
      ),
    ],
    handle: async (name, args) => {
      const field = (key: string) => String((args as Record<string, unknown>)[key] ?? '')
      if (name === PLAN_TOOL.name) return { done: args as RawPlan }
      if (name === 'platform_arac') return input.reader.describe(field('arac'))
      if (name === 'platform_oku') {
        const result = await input.reader.read(
          field('arac'),
          field('girdi'),
          Number((args as Record<string, unknown>).devam) || 0,
        )
        input.onRead(
          field('arac'),
          field('neden'),
          !result.startsWith('Okunamadı') && !result.startsWith('Girdi JSON'),
        )
        return result
      }
      return `Bilinmeyen araç: ${name}`
    },
  })
  return raw ? normalizeStrategy(raw, input.catalog, input.selected) : null
}

/**
 * Bir sayfanın işi: stratejinin o sayfadaki kalemleri birer görevdir ("ikisi" kaleminde önce tanım okunur); sayfa için
 * tam tarama istendiyse planlayıcı sayfanın görevlerini ayrıca çıkarır, kalemler onların önüne konur.
 */
export function pageWork(
  items: StrategyItem[],
  page: string,
): { scan: boolean; tasks: Array<{ baslik: string; amac: string }> } {
  const own = items.filter((i) => i.page === page)
  return {
    scan: own.some((i) => i.fullScan),
    tasks: own
      .filter((i) => !i.fullScan)
      .map((i) => ({
        baslik: i.title,
        amac:
          i.source === 'ikisi'
            ? `${i.goal} Önce ilgili tanımı platform_oku ile oku, sonra ekranda teyit et.`
            : i.goal,
      })),
  }
}

/**
 * Maliyet politikası: pahalı göz (her yeni ekranın ayrı incelemesi) arayüz işinde açıktır — sayfa baştan sona
 * taranıyorsa ya da istek arayüz/karışık türündeyse. Kural ve akış sorusunda ekran yalnız teyit için açılır; gözün
 * genel bulguları soruya katkı vermez, maliyetin çoğunu yer (KOS-2026-0035: %66).
 */
export function inspectsScreens(kind: StrategyKind, scan: boolean): boolean {
  return scan || kind === 'arayuz' || kind === 'karisik'
}
