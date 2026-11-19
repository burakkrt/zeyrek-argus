import type { FindingKind, PlatformRead, StrategyItem } from '@argus/shared'
import type { RoleBook } from '../memory/roles.ts'
import type { PlatformReader } from '../platform/reader.ts'
import type { CreateMessage, MessageParams, Tool, UsageMeter } from './model.ts'
import { toolLoop } from './tool-loop.ts'
import { platformTools } from './tools.ts'
import { REPORT_PROPERTIES } from '../issues/report.ts'
import { SEVERITY_GUIDE } from '../issues/severity.ts'

/**
 * Tanım kalemi: tarayıcı açılmaz; araştırmacı (varsayılan Sonnet; kapsamı gözetmen denetler) uygulamanın tanımlarını
 * okuyarak kalemin senaryosunu test eder. Tanımdaki hata, tutarsızlık ya da risk (ör. bir aşama kural gereği
 * atlanabiliyor ve kullanıcı uyarılmıyor) bulgudur: kaynağıyla (araç, kayıt, alan) `tanim_bulgusu` ile kaydedilir.
 * Kalemin özeti koşunun bilgisine girer: sonraki ekran kalemleri ve gözetmen onu görür.
 */
export const DEFINITION_MARKER = 'TANIM KALEMİ'
const DEFINITION_CEILING = 40
/** Koşu sonu temizliğinin adım tavanı: platform yavaşken temizlik koşuyu dakikalarca uzatıyordu (KOS-2026-0046). */
export const CLEANUP_CEILING = 12
/** Aynı anda yürüyen bağımsız tanım kalemi sayısı (abonelik hız sınırını zorlamadan). */
export const DEFINITION_PARALLEL = 3
const KINDS: FindingKind[] = ['kesin', 'tutarsizlik', 'not']
const text = (value: string) => ({ type: 'text' as const, text: value })

/** Tanımdan çıkan bulgu (araştırmacının ve gözetmenin kaçmış bulgu listesinin ortak biçimi). */
export interface DefinitionFinding {
  tur: FindingKind
  baslik: string
  senaryo: string
  beklenen: string
  gozlenen: string
  kaynak: string
  /** Aynı kök nedenli bilinen sorunun anahtarı; yeni sorunsa boş (aynı bulgu farklı başlıkla yeniden kayıtlanmasın). */
  anahtar: string
  /**
   * calistirildi: çalıştırıldı, yanıt ya da geri okunan kayıt kanıtlıyor; tanimdan: yalnız tanımdan çıkarım. Tanımdan
   * çıkarım bulgu sayılmaz, şüphe olarak (not) kaydedilir: kanıtsız yapay zekâ bulgusunun çoğu yanlış çıkıyordu.
   */
  dogrulama?: string
  /** Önem S1-S4 (`SEVERITIES`). */
  onem?: string
}

const FINDING_TOOL: Tool = {
  name: 'tanim_bulgusu',
  description:
    'Tanımda bulunan hatayı, tutarsızlığı ya da riski bulgu olarak kaydeder (ekran görüntüsü yok; kanıt tanımdır).',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      tur: {
        type: 'string',
        enum: KINDS,
        description: 'kesin: açık hata; tutarsizlik: neyle çeliştiği yazılı; not: risk ya da zayıf kanıt.',
      },
      baslik: { type: 'string' },
      senaryo: { type: 'string', description: 'Hangi durumda ortaya çıkıyor.' },
      beklenen: { type: 'string' },
      gozlenen: { type: 'string', description: 'Tanıma göre gerçekte ne oluyor.' },
      kaynak: {
        type: 'string',
        description:
          'Kanıt: çalıştırdığın çağrı ve girdisi, dönen yanıt ya da geri okunan kayıt; yoksa tanımdaki yer.',
      },
      onem: {
        type: 'string',
        enum: ['S1', 'S2', 'S3', 'S4'],
        description: SEVERITY_GUIDE,
      },
      dogrulama: {
        type: 'string',
        enum: ['calistirildi', 'tanimdan'],
        description:
          'calistirildi: çalıştırdın ve yanıt ya da geri okunan kayıt kanıtlıyor; tanimdan: yalnız tanımı okuyarak çıkardın (şüphe olarak kaydedilir).',
      },
      anahtar: {
        type: 'string',
        description:
          'Bilinen ya da bu koşuda kaydedilmiş bir sorunla aynı kök nedense onun anahtarı (listeden, ör. yz:...); yeni sorunsa boş.',
      },
      ...REPORT_PROPERTIES,
    },
    required: ['tur', 'onem', 'baslik', 'senaryo', 'beklenen', 'gozlenen', 'kaynak', 'dogrulama', 'anahtar'],
    additionalProperties: false,
  },
}

const FINISH_TOOL: Tool = {
  name: 'kalemi_bitir',
  description: 'Kalemi bitirir: ne test edildi, kaynakları ve test edilemeyen kısım.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      ozet: { type: 'string', description: 'Ne test edildi, ne bulundu; 1-3 cümle.' },
      kanitlar: {
        type: 'array',
        items: { type: 'string' },
        description: 'Her biri: tespit — kaynak (araç, kayıt kimliği/adı, alan).',
      },
      eksik: { type: 'string', description: 'Tanımdan test edilemeyen kısım ve nedeni; yoksa boş.' },
    },
    required: ['ozet', 'kanitlar', 'eksik'],
    additionalProperties: false,
  },
}

export async function investigate(input: {
  createMessage: CreateMessage
  meter: UsageMeter
  model: string
  system: MessageParams['system']
  /** Rol talimatları (`memory/brain/roles/arastirmaci.md`). */
  roles: RoleBook
  reader: PlatformReader
  item: StrategyItem
  brief: string | null
  notes: string[]
  /** Bu koşuda kaydedilmiş ve modülde bilinen sorunlar (anahtar — başlık); kalem başında okunur. */
  known: () => string[]
  /** Her platform okuması (akışa adım olarak yazılır). */
  onRead: (reason: string, read: PlatformRead) => void
  /** Tanım bulgusunu kaydeder; modele dönecek sonucu verir. */
  record: (finding: DefinitionFinding) => string
  /** Adım tavanı; yoksa DEFINITION_CEILING. */
  ceiling?: number
}): Promise<string> {
  const tools = [...platformTools(input.reader), FINDING_TOOL, FINISH_TOOL]
  const known = input.known()
  const result = await toolLoop<{ ozet: string; kanitlar: string[]; eksik: string }>({
    finishTool: FINISH_TOOL.name,
    ceiling: input.ceiling ?? DEFINITION_CEILING,
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
          'investigator',
        )
        .then((message) => {
          input.meter.add(input.model, message, 'investigator')
          return message
        }),
    first: [
      text(
        `${DEFINITION_MARKER}: ${input.item.title}\n${input.item.goal}\n\n` +
          (input.brief ? `Kullanıcının test isteği: ${input.brief}\n\n` : '') +
          (input.notes.length
            ? `Bu koşuda bilinenler:\n${input.notes.map((n) => `- ${n}`).join('\n')}\n\n`
            : '') +
          (known.length
            ? `${input.roles.part('arastirmaci', 'kayitli-sorunlar')}\n${known.map((k) => `- ${k}`).join('\n')}\n\n`
            : '') +
          input.roles.text('arastirmaci'),
      ),
    ],
    handle: async (name, args) => {
      const field = (key: string) => String((args as Record<string, unknown>)[key] ?? '')
      if (name === FINISH_TOOL.name)
        return { done: args as { ozet: string; kanitlar: string[]; eksik: string } }
      if (name === FINDING_TOOL.name) {
        const finding = args as DefinitionFinding
        if (!KINDS.includes(finding.tur) || !finding.kaynak?.trim())
          return 'Kaydedilmedi: tur kesin/tutarsizlik/not olmalı ve kaynak (araç, kayıt, alan) yazılmalı.'
        return input.record(finding)
      }
      if (name === 'platform_arac') return input.reader.describe(field('arac'))
      if (name === 'platform_oku') {
        const read = await input.reader.read(
          field('arac'),
          field('girdi'),
          Number((args as Record<string, unknown>).devam) || 0,
        )
        input.onRead(field('neden'), {
          tool: field('arac'),
          input: field('girdi'),
          result: read,
          label: field('adim'),
        })
        return read
      }
      if (name === 'platform_yaz') {
        const written = await input.reader.write(field('arac'), field('girdi'))
        input.onRead(field('neden'), {
          tool: field('arac'),
          input: field('girdi'),
          result: written,
          write: true,
          label: field('adim'),
        })
        return written
      }
      return `Bilinmeyen araç: ${name}`
    },
  })
  if (!result) return 'Kalem tamamlanamadı: ilerleme durdu (aynı yerde dönüyor).'
  return [
    result.ozet,
    result.kanitlar.length ? `Kanıtlar: ${result.kanitlar.join(' · ')}` : '',
    result.eksik ? `Eksik kalan: ${result.eksik}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}
