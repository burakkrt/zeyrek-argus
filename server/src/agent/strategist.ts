import type {
  CatalogPage,
  ItemSource,
  RunStrategy,
  StrategyItem,
  StrategyKind,
  PlatformRead,
} from '@argus/shared'
import type { PlatformReader } from '../platform/reader.ts'
import type { Attachment } from '../runs/attachments.ts'
import type { CreateMessage, MessageParams, Tool, UsageMeter } from './model.ts'
import { toolLoop } from './tool-loop.ts'
import { platformTools } from './tools.ts'

/**
 * Anla adımı (test planı): Argus bulgu uygulamasıdır — kullanıcı bir modülü, sayfayı, konuyu ya da işleyişi test
 * ettirir; koşunun çıktısı bulgulardır (hata, tutarsızlık, risk). Koşu başında güçlü model isteği çözümler, gerekirse
 * platform tanımlarını okuyarak (MCP) test planını yazar — kapsam, test senaryoları (durum + beklenen davranış +
 * bakılacak tutarsızlık), kapsamın ne olunca tamam sayılacağı, tanımdan bilinenler, bu koşuda test edilemeyenler ve
 * iş kalemleri (kaynak: tanım | ekran | ikisi). Yalnız girdi verilen koşuda sayfalar da burada
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
  description: 'Koşunun test planını yazar ve anla adımını bitirir.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      tur: { type: 'string', enum: KINDS },
      anlasilan: {
        type: 'string',
        description: 'Test edilecek kapsam (modül, sayfa, konu, işleyiş), kendi cümlenle.',
      },
      senaryolar: {
        ...strings,
        description: 'Test senaryoları: her biri durum + beklenen davranış + bakılacak tutarsızlık.',
      },
      bitti_olcutu: { type: 'string', description: 'Kapsam ne olunca tamam sayılır.' },
      bilinenler: {
        ...strings,
        description: 'Tanımdan öğrendiklerin, her biri kaynağıyla (araç, kayıt, alan).',
      },
      yapilamayan: {
        ...strings,
        description: 'Bu koşuda yapılamayanlar ve nedeni (ör. canlı e-posta gönderimi, başka rolün yetkisi).',
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
    required: ['tur', 'anlasilan', 'senaryolar', 'bitti_olcutu', 'bilinenler', 'yapilamayan', 'kalemler'],
    additionalProperties: false,
  },
}

interface RawPlan {
  tur: string
  anlasilan: string
  senaryolar: string[]
  bitti_olcutu: string
  bilinenler: string[]
  yapilamayan: string[]
  kalemler: Array<{ baslik: string; amac: string; kaynak: string; sayfa: string; tam_tarama: boolean }>
}

/** Girdisiz koşu: seçilen her sayfa baştan sona taranır. */
export function scanStrategy(pages: string[]): RunStrategy {
  return {
    kind: 'arayuz',
    understood: 'Seçilen sayfaların arayüz taraması.',
    scenarios: [],
    doneWhen: 'Sayfaların bütün bölgeleri ve akışları denenir, sorunlar kanıtıyla bulunur.',
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
    scenarios: raw.senaryolar,
    doneWhen: raw.bitti_olcutu,
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
  /** Her platform okuması (akışa adım olarak yazılır). */
  onRead: (reason: string, read: PlatformRead) => void
}): Promise<RunStrategy | null> {
  const files = input.attachments
    .map((a) =>
      a.kind === 'text' ? `Ek: ${a.name}\n<<<EK\n${a.text.slice(0, 4000)}\nEK>>>` : `Ek: ${a.name}`,
    )
    .join('\n')
  // Planlayıcı yazmaz: test planını tanımı okuyarak yazar; yazma kalemi yürüten araştırmacının ve gezginin işidir.
  const tools = [...platformTools(input.reader, { write: false }), PLAN_TOOL]
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
        `${STRATEGY_MARKER}: Kullanıcı aşağıdaki kapsamı test ettiriyor; amaç bulgu bulmak (hata, tutarsızlık, risk), soru ` +
          'cevaplamak değil. Bu koşunun test planını yaz. Önce testin türüne karar ver: arayüz (ekranda ne görünüyor, ' +
          'tutarlı mı, çalışıyor mu), kural/akış (hangi durumda ne olmalı, kural ve geçişler doğru işliyor mu, kullanıcı ' +
          'uyarılıyor mu), ya da karışık. Her senaryo için beklenen davranışı ve neyin tutarsızlık sayılacağını yaz. Kural ' +
          've akışın nasıl çalıştığı uygulamanın tanımındadır: platform_oku ile ilgili tanımları (akış, süreç, mikroservis, ' +
          'sayfa şeması, varlık) oku ve öğrendiklerini kaynağıyla ' +
          '"bilinenler"e yaz. Burada yalnız hangi tanımlara bakılacağını belirlemeye yetecek kadar oku; ayrıntılı okumayı tanım kalemine bırak (aynı tanım iki kez okunmasın). Sonra iş kalemlerini çıkar; her kalemin kaynağı: tanim (yalnız platform okuması), ekran ' +
          '(tarayıcı, bir sayfada), ikisi (tanımı oku, sonucu ekranda teyit et). Veri değiştirmeyi gerektiren adım ' +
          '(kayıt oluşturmak, aşama ilerletmek, onaya göndermek, doğrulamayı denemek) yapılabilir: kalemi yürüten ' +
          'koşunun ortamında (development ya da dal) platform_yaz ile test verisi yazar ve uygulamanın akışını çalıştırır (tarayıcıda yazma ' +
          'düğmeleri engellidir). Böyle adımı kalem yap, amacında hangi test verisiyle neyin çalıştırılacağını yaz; ' +
          '"yapilamayan"a koyma (tanımdaki hata ve tutarsızlık da bulgudur). İstek bir sayfanın ' +
          'ya da modülün genel arayüz kalitesini test ettiriyorsa o sayfalar için tam_tarama=true kalem aç. Kalemler ' +
          'kapsamı eksiksiz örtsün ama kapsam dışı genel tarama ekleme.\n\n' +
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
        input.onRead(field('neden'), { tool: field('arac'), input: field('girdi'), result: result })
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
