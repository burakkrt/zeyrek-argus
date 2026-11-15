import type { AnswerStatus, RunAnswer, RunStrategy } from '@argus/shared'
import { jsonOf, type CreateMessage, type MessageParams, type UsageMeter } from './model.ts'

/**
 * Gözetmen: girdili koşuda kalemler bitince güçlü model sonucu stratejinin başarı ölçütüyle karşılaştırır — soru
 * cevaplandı mı, cevap ve kanıtları, cevaplanamayan kısım. Cevap eksikse ve kanıt toplanabilecek bir yol kaldıysa ek
 * kalem önerir (koşu onları yürütüp yeniden sorar; en çok `SUPERVISE_ROUNDS` tur). Engellenen ya da salt okumada
 * yapılamayan iş için ek kalem önermez: "yapılamaz" demek de cevaptır.
 */
export const SUPERVISE_MARKER = 'GÖZETMEN GÖREVİ'
export const SUPERVISE_ROUNDS = 2

const STATUSES: AnswerStatus[] = ['cevaplandi', 'kismen', 'cevaplanamadi']

const SUPERVISE_SCHEMA = {
  type: 'object',
  properties: {
    durum: { type: 'string', enum: STATUSES },
    cevap: {
      type: 'string',
      description: 'İsteğin cevabı, kullanıcıya doğrudan; yapılamayan da açıkça söylenir.',
    },
    kanitlar: { type: 'array', items: { type: 'string' }, description: 'Her biri: iddia — kaynak.' },
    eksik: { type: 'string', description: 'Cevaplanamayan kısım ve nedeni; yoksa boş.' },
    ek_kalemler: {
      type: 'array',
      description: 'Cevabı tamamlamak için yürütülecek kalemler; gerekmiyorsa boş.',
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
  required: ['durum', 'cevap', 'kanitlar', 'eksik', 'ek_kalemler'],
  additionalProperties: false,
} as const

export interface Verdict {
  answer: RunAnswer
  extra: Array<{ baslik: string; amac: string; kaynak: string; sayfa: string; tam_tarama: boolean }>
}

export async function supervise(input: {
  createMessage: CreateMessage
  meter: UsageMeter
  model: string
  system: MessageParams['system']
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
            `${SUPERVISE_MARKER}: Koşu kalemleri bitti. Sonucu kullanıcının isteğiyle ve başarı ölçütüyle karşılaştır, ` +
            'isteğin cevabını yaz. Yalnız aşağıdaki sonuçlara ve kanıtlara dayan; kanıtı olmayan iddiada bulunma. ' +
            (input.lastRound
              ? 'Bu son tur: ek kalem önerme.'
              : 'Cevap eksikse ve kanıt toplanabilecek bir yol kaldıysa ek kalem öner; engellenen ya da salt okumada ' +
                'yapılamayan iş için önerme.') +
            `\n\nİSTEK: ${input.brief ?? '(yalnız dosya eklendi)'}\nANLAŞILAN: ${s.understood}\nSORULAR:\n${list(s.questions)}\n` +
            `BAŞARI ÖLÇÜTÜ: ${s.success}\nSALT OKUMADA YAPILAMAYAN:\n${list(s.infeasible)}\n\n` +
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
    cevap: string
    kanitlar: string[]
    eksik: string
    ek_kalemler: Verdict['extra']
  }>(message)
  if (!raw)
    return {
      answer: { status: 'cevaplanamadi', answer: 'Gözetmen sonucu okuyamadı.', evidence: [], missing: '' },
      extra: [],
    }
  return {
    answer: {
      status: STATUSES.includes(raw.durum as AnswerStatus) ? (raw.durum as AnswerStatus) : 'kismen',
      answer: raw.cevap,
      evidence: raw.kanitlar,
      missing: raw.eksik,
    },
    extra: input.lastRound ? [] : raw.ek_kalemler,
  }
}
