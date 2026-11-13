import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KIND_LABELS, STATUS_LABELS, type IssueDetail } from '@argus/shared'
import { strToU8, zipSync } from 'fflate'

/**
 * Çıktı biçimi: `memory/formats/<ad>.md` içindeki şablon. Alanlar `{{alan}}`, tekrar eden bölüm
 * `{{#gorunumler}} … {{/gorunumler}}`. Model biçimle uğraşmaz (token harcamaz); alanları doldurur, şablon basar.
 */
export const DEFAULT_FORMAT = `## {{baslik}}

**Tür:** {{tur}} · **Durum:** {{durum}} · **Sayfalar:** {{sayfalar}}

**Senaryo**
{{senaryo}}

**Beklenen:** {{beklenen}}

**Gözlenen:** {{gozlenen}}

{{#ekran}}![Ekran görüntüsü]({{ekran}}){{/ekran}}

{{#yorumlar}}> {{yazar}}: {{metin}}
{{/yorumlar}}
`

type Value = string | Array<Record<string, string>>

export function render(template: string, values: Record<string, Value>): string {
  const sections = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name: string, inner: string) => {
    const value = values[name]
    if (Array.isArray(value)) return value.map((item) => render(inner, item)).join('')
    return value ? render(inner, values) : ''
  })
  return sections.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = values[name]
    return typeof value === 'string' ? value : ''
  })
}

export function issueValues(issue: IssueDetail, shotPath: string | null): Record<string, Value> {
  const sample = issue.occurrences.find((o) => o.outcome !== 'dogrulanamadi' && o.outcome !== 'bastirildi') ?? issue.occurrences[0]
  return {
    baslik: issue.title,
    anahtar: issue.key,
    tur: KIND_LABELS[issue.kind],
    durum: STATUS_LABELS[issue.status],
    sayfalar: issue.pages.join(', '),
    senaryo: sample?.scenario ?? '',
    beklenen: sample?.expected ?? '',
    gozlenen: sample?.observed ?? '',
    ekran: shotPath ?? '',
    ilk: issue.firstSeen.slice(0, 10),
    son: issue.lastSeen.slice(0, 10),
    gorulme: String(issue.seenCount),
    yorumlar: issue.comments.map((c) => ({ yazar: c.author, metin: c.text, tarih: c.at.slice(0, 16).replace('T', ' ') })),
  }
}

/** Markdown rapor + kanıt görüntüleri, tek zip. */
export function markdownZip(issues: IssueDetail[], template: string, dataDir: string, title: string): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const parts = [`# ${title}\n`, `${issues.length} sorun · ${new Date().toLocaleString('tr-TR')}\n`]
  for (const issue of issues) {
    const shot = issue.occurrences.find((o) => o.shot && o.outcome !== 'bastirildi') ?? issue.occurrences.find((o) => o.shot)
    let shotPath: string | null = null
    if (shot?.shot) {
      const source = join(dataDir, 'runs', shot.runId, shot.shot)
      if (existsSync(source)) {
        shotPath = `kanit/${issue.id.slice(0, 8)}.${source.endsWith('.png') ? 'png' : 'jpg'}`
        files[shotPath] = readFileSync(source)
      }
    }
    parts.push(render(template, issueValues(issue, shotPath)))
  }
  files['rapor.md'] = strToU8(parts.join('\n'))
  return zipSync(files, { level: 6 })
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`

export function issuesCsv(issues: IssueDetail[]): string {
  const header = ['Anahtar', 'Başlık', 'Tür', 'Durum', 'Sayfalar', 'Senaryo', 'Beklenen', 'Gözlenen', 'İlk', 'Son', 'Görülme', 'Yorumlar']
  const rows = issues.map((issue) => {
    const v = issueValues(issue, null)
    const comments = issue.comments.map((c) => `${c.author}: ${c.text}`).join(' | ')
    return [v.anahtar, v.baslik, v.tur, v.durum, v.sayfalar, v.senaryo, v.beklenen, v.gozlenen, v.ilk, v.son, v.gorulme, comments]
      .map((x) => csvCell(String(x)))
      .join(';')
  })
  // Excel Türkçe ayarında ; ayırıcıyı ve BOM ile UTF-8'i doğru açar.
  return `\uFEFF${[header.map(csvCell).join(';'), ...rows].join('\r\n')}`
}
