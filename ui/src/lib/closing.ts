import type { FindingReport } from '@argus/shared'

/**
 * Kapanışın düzeltme istemi: düzeltilecek bulgular, insanın düzenlediği çözümleriyle, bir kodlama yapay zekâsına (ör.
 * Claude Code) doğrudan verilecek tek metin. Her bulgu: başlık, nerede, ne oluyor, önerilen düzeltme (düzenlendiyse
 * insanınki) ve kabul ölçütleri. Argus kodu bilmez; istem nereye bakılacağını ve neyin doğrulanacağını söyler.
 */
export interface FixItem {
  title: string
  pages: string[]
  fix: string | null
  fixEdited: boolean
  report: Pick<FindingReport, 'summary' | 'location' | 'acceptance'> | null
}

export function fixPrompt(app: { project: string; application: string }, items: FixItem[]): string {
  const blocks = items.map((item, i) => {
    const lines = [`## ${i + 1}. ${item.title}`, `Nerede: ${item.report?.location || item.pages.join(', ') || '—'}`]
    if (item.report?.summary) lines.push(`Ne oluyor: ${item.report.summary}`)
    lines.push(
      `Düzeltme${item.fixEdited ? ' (ekibin belirlediği)' : ' (önerilen)'}: ${item.fix || 'Belirtilmedi; kök nedeni bul ve düzelt.'}`,
    )
    if (item.report?.acceptance?.length) lines.push('Kabul ölçütleri:', ...item.report.acceptance.map((a) => `- ${a}`))
    return lines.join('\n')
  })
  return [
    `Zeyrek platformundaki ${app.project}/${app.application} uygulamasında, kalite kontrolünde onaylanan ${items.length} sorunu düzelt.`,
    'Her biri için önce sorunu yerinde doğrula, sonra düzelt ve kabul ölçütleriyle sına. Düzeltme ekibin belirlediğiyse ona uy; önerilense daha doğru bir yol görürsen gerekçesiyle söyle.',
    '',
    ...blocks.flatMap((b) => [b, '']),
  ]
    .join('\n')
    .trim()
}
