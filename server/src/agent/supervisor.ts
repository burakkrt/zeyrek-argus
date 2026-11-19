import type { CoverageStatus, FindingKind, RunCoverage, RunStrategy } from '@argus/shared'
import type { RoleBook } from '../memory/roles.ts'
import type { DefinitionFinding } from './investigator.ts'
import { jsonOf, type CreateMessage, type MessageParams, type UsageMeter } from './model.ts'
import { REPORT_PROPERTIES } from '../issues/report.ts'
import { SEVERITY_GUIDE } from '../issues/severity.ts'

/**
 * Gözetmen (kapsam denetçisi): girdili koşuda kalemler bitince güçlü model test planını yapılanla karşılaştırır.
 * Argus bulgu uygulamasıdır; gözetmenin çıktısı bir cevap değil:
 * - kapsam raporu: hangi senaryolar test edildi, hangileri edilemedi ve neden (ör. "aşama ilerletmek veri yazar"),
 * - kaçmış bulgular: kalem sonuçlarında geçip bulgu olarak kaydedilmemiş hata, tutarsızlık ya da risk (kaynağıyla),
 * - kapsam boşluğu kaldıysa ve test edilebilir bir yol varsa ek kalemler (koşu yürütüp yeniden sorar; en çok
 *   `SUPERVISE_ROUNDS` tur). Bu koşuda test edilemeyen iş için ek kalem önermez.
 */
export const SUPERVISE_MARKER = 'GÖZETMEN GÖREVİ'
export const SUPERVISE_ROUNDS = 2

const STATUSES: CoverageStatus[] = ['tam', 'kismen', 'eksik']
const KINDS: FindingKind[] = ['kesin', 'tutarsizlik', 'not']
const strings = { type: 'array', items: { type: 'string' } } as const

const SUPERVISE_SCHEMA = {
  type: 'object',
  properties: {
    durum: { type: 'string', enum: STATUSES },
    ozet: { type: 'string', description: 'Kapsamın ne kadarı test edildi, 1-3 cümle.' },
    test_edilen: { ...strings, description: 'Test edilen senaryolar.' },
    test_edilemeyen: { ...strings, description: 'Test edilemeyen senaryolar, her biri nedeniyle.' },
    bakilmayan: {
      ...strings,
      description:
        'İsteğin kapsamı dışında kaldığı için bakılmayan alanlar (ör. modülün geri kalanı, komşu akış); tam testte boş olabilir.',
    },
    kacmis_bulgular: {
      type: 'array',
      description:
        'Kalem sonuçlarında geçen ama BU KOŞUNUN BULGULARI listesinde olmayan hata/tutarsızlık/risk.',
      items: {
        type: 'object',
        properties: {
          tur: { type: 'string', enum: KINDS },
          baslik: { type: 'string' },
          senaryo: { type: 'string' },
          beklenen: { type: 'string' },
          gozlenen: { type: 'string' },
          kaynak: { type: 'string', description: 'Kanıt: araç, kayıt, alan (ya da ekran gözlemi).' },
          onem: {
            type: 'string',
            enum: ['S1', 'S2', 'S3', 'S4'],
            description: SEVERITY_GUIDE,
          },
          anahtar: {
            type: 'string',
            description:
              'Bilinen ya da bu koşuda kaydedilmiş bir sorunla aynı kök nedense onun anahtarı (listeden, ör. yz:...); yeni sorunsa boş.',
          },
          ...REPORT_PROPERTIES,
        },
        required: ['tur', 'baslik', 'senaryo', 'beklenen', 'gozlenen', 'kaynak', 'onem', 'anahtar'],
        additionalProperties: false,
      },
    },
    ek_kalemler: {
      type: 'array',
      description: 'Kapsam boşluğunu kapatmak için yürütülecek kalemler; gerekmiyorsa boş.',
      items: {
        type: 'object',
        properties: {
          baslik: { type: 'string' },
          amac: { type: 'string' },
          kaynak: { type: 'string', enum: ['tanim', 'ekran', 'ikisi'] },
          sayfa: { type: 'string' },
          tam_tarama: { type: 'boolean' },
        },
        required: ['baslik', 'amac', 'kaynak', 'sayfa', 'tam_tarama'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'durum',
    'ozet',
    'test_edilen',
    'test_edilemeyen',
    'bakilmayan',
    'kacmis_bulgular',
    'ek_kalemler',
  ],
  additionalProperties: false,
} as const

export interface Verdict {
  coverage: RunCoverage
  missed: DefinitionFinding[]
  extra: Array<{ baslik: string; amac: string; kaynak: string; sayfa: string; tam_tarama: boolean }>
}

export async function supervise(input: {
  createMessage: CreateMessage
  meter: UsageMeter
  model: string
  system: MessageParams['system']
  /** Rol talimatları (`memory/brain/roles/gozetmen.md`). */
  roles: RoleBook
  brief: string | null
  strategy: RunStrategy
  results: string[]
  findings: string[]
  pages: string[]
  lastRound: boolean
}): Promise<Verdict> {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '(yok)')
  const s = input.strategy
  const message = await input.createMessage(
    {
      model: input.model,
      max_tokens: 16_000,
      system: input.system,
      messages: [
        {
          role: 'user',
          content:
            `${SUPERVISE_MARKER}: ${input.roles.text('gozetmen', {
              tur: input.lastRound
                ? input.roles.part('gozetmen', 'son-tur')
                : [
                    input.roles.part('gozetmen', 'ek-kalem'),
                    ...(s.scope === 'tam' ? [] : [input.roles.part('gozetmen', 'dar-kapsam')]),
                  ].join(' '),
            })}` +
            `\n\nTEST İSTEĞİ: ${input.brief ?? '(yalnız dosya eklendi)'}\nKAPSAM: ${s.understood}\nSENARYOLAR:\n${list(s.scenarios)}\n` +
            `KAPSAM TAMAM SAYILIR: ${s.doneWhen}\nBU KOŞUDA TEST EDİLEMEYEN:\n${list(s.infeasible)}\n\n` +
            `KALEM SONUÇLARI (tanım ve ekran):\n${list(input.results)}\n\nBU KOŞUNUN BULGULARI:\n${list(input.findings)}\n\n` +
            `TEST EDİLEN SAYFALAR: ${input.pages.join(', ') || '(yok)'}`,
        },
      ],
      output_config: {
        format: { type: 'json_schema', schema: SUPERVISE_SCHEMA as unknown as Record<string, unknown> },
      },
    },
    'planner',
  )
  input.meter.add(input.model, message, 'planner')
  const raw = jsonOf<{
    durum: string
    ozet: string
    test_edilen: string[]
    test_edilemeyen: string[]
    bakilmayan?: string[]
    kacmis_bulgular: DefinitionFinding[]
    ek_kalemler: Verdict['extra']
  }>(message)
  if (!raw)
    return {
      coverage: { status: 'eksik', summary: 'Gözetmen sonucu okuyamadı.', tested: [], untested: [] },
      missed: [],
      extra: [],
    }
  return {
    coverage: {
      status: STATUSES.includes(raw.durum as CoverageStatus) ? (raw.durum as CoverageStatus) : 'kismen',
      summary: raw.ozet,
      tested: raw.test_edilen,
      untested: raw.test_edilemeyen,
      outOfScope: raw.bakilmayan ?? [],
    },
    missed: raw.kacmis_bulgular.filter((f) => KINDS.includes(f.tur) && f.kaynak.trim()),
    extra: input.lastRound ? [] : raw.ek_kalemler,
  }
}
