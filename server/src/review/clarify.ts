import type { IssueDetail } from '@argus/shared'
import { jsonOf, type CreateMessage } from '../agent/model.ts'
import type { IssueRevision, IssueService } from '../issues/issues.ts'
import { findingReport } from '../issues/report.ts'
import type { RoleBook } from '../memory/roles.ts'

/**
 * Netleştirme (değerlendirmenin ikinci turu): insanın "belirsiz" dediği bulgular, sorusuyla birlikte güçlü modele
 * gider; model bulguyu yeni kanıt uydurmadan daha anlaşılır yazar ve soruyu yanıtlar (`memory/brain/roles/netlestirici.md`).
 * Bulgu yeniden "İnceleme bekliyor"a döner; insan yine onaylar, reddeder ya da yine belirsiz der. Belirsiz kalmazsa bu tur
 * hiç açılmaz.
 */
export const CLARIFY_MARKER = 'NETLEŞTİRME GÖREVİ'
/** Aynı anda netleştirilen bulgu sayısı. */
const PARALLEL = 3

const SCHEMA = {
  type: 'object',
  properties: {
    baslik: { type: 'string' },
    aciklama: { type: 'string' },
    sonuc: { type: 'string' },
    nerede: { type: 'string' },
    senaryo: { type: 'string' },
    beklenen: { type: 'string' },
    gozlenen: { type: 'string' },
    kok_neden: { type: 'string' },
    duzeltme: { type: 'string' },
    kabul: { type: 'array', items: { type: 'string' } },
    yanit: { type: 'string' },
  },
  required: ['baslik', 'aciklama', 'sonuc', 'nerede', 'senaryo', 'beklenen', 'gozlenen', 'kok_neden', 'duzeltme', 'kabul', 'yanit'],
  additionalProperties: false,
} as const

/** Modelin gördüğü bulgu: son görünüm, raporu ve insanın yorumları (soru en sondadır). */
export function clarifyPrompt(detail: IssueDetail): string {
  const last = detail.occurrences[0]
  const report = last?.report
  return [
    `BULGU: ${detail.title}`,
    `Tür ve önem: ${detail.kind}, ${detail.severity}. Sayfalar: ${detail.pages.join(', ') || '(yok)'}`,
    `Senaryo: ${last?.scenario ?? ''}`,
    `Beklenen: ${last?.expected ?? ''}`,
    `Gözlenen: ${last?.observed ?? ''}`,
    ...(last?.quote ? [`Ekrandaki metin: "${last.quote}"`] : []),
    ...(report
      ? [
          `Açıklama: ${report.summary}`,
          `Sonucu: ${report.impact}`,
          `Nerede: ${report.location}`,
          `Kanıt: ${report.proof}`,
          `Kök neden: ${report.rootCause}`,
          `Önerilen düzeltme: ${report.fix}`,
          `Kabul ölçütleri: ${report.acceptance.join(' | ')}`,
        ]
      : []),
    '',
    'İNSANIN YORUMLARI (sonuncusu sorusu):',
    ...detail.comments.map((c) => `- ${c.author}: ${c.text}`),
  ].join('\n')
}

export async function clarifyIssues(input: {
  ids: string[]
  issues: IssueService
  roles: RoleBook
  createMessage: CreateMessage
  model: string
}): Promise<{ revised: number; failed: number }> {
  let revised = 0
  let failed = 0
  const queue = [...input.ids]
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const detail = input.issues.detail(id)
      const message = await input
        .createMessage(
          {
            model: input.model,
            max_tokens: 4_000,
            system: input.roles.text('temel'),
            messages: [
              { role: 'user', content: `${CLARIFY_MARKER}: ${input.roles.text('netlestirici')}\n\n${clarifyPrompt(detail)}` },
            ],
            output_config: { format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
          },
          'planner',
        )
        .catch(() => null)
      const raw = message ? jsonOf<Record<string, unknown>>(message) : null
      const text = (key: string) => (typeof raw?.[key] === 'string' ? (raw[key] as string).trim() : '')
      if (!raw || !text('baslik') || !text('yanit')) {
        failed += 1
        continue
      }
      const previous = detail.occurrences[0]?.report
      const revision: IssueRevision = {
        title: text('baslik'),
        scenario: text('senaryo') || detail.occurrences[0]?.scenario || '',
        expected: text('beklenen') || detail.occurrences[0]?.expected || '',
        observed: text('gozlenen') || detail.occurrences[0]?.observed || '',
        report: findingReport(raw, previous?.proof ?? '') ?? {
          summary: '',
          impact: '',
          location: '',
          proof: previous?.proof ?? '',
          rootCause: '',
          fix: '',
          acceptance: [],
        },
        answer: text('yanit'),
      }
      input.issues.revise(id, revision)
      revised += 1
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker))
  return { revised, failed }
}
