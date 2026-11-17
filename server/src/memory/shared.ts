import { FINDING_KINDS, type FindingKind, type PlatformCall } from '@argus/shared'
import { parseDocument, serializeDocument } from './frontmatter.ts'

/**
 * Takımla paylaşılan, tek yazarlı kayıtlar. Paylaşılan her dosyanın tek yazarı vardır (makinenin yazar kimliğiyle,
 * `author.ts`): iki kişi aynı dosyayı hiç değiştirmez, bu yüzden Git birleştirmesinde çakışma çıkmaz. Okuyan
 * herkesinkini birleştirir.
 */

/**
 * Bir kişinin açık bulgusu ve son görünümü (`findings/<kimlik>.md`). Ham koşu kaydı (görüntü, video) paylaşılmaz;
 * alıntı paylaşılır, böylece başkasının makinesi bulguyu modelsiz doğrulayabilir.
 */
export interface SharedFinding {
  key: string
  title: string
  kind: FindingKind
  pages: string[]
  firstSeen: string
  lastSeen: string
  seenCount: number
  page: string
  scenario: string
  expected: string
  observed: string
  quote: string | null
  /** Kayıtlı vaka: bulguyu kanıtlayan platform çağrıları (takım arkadaşının makinesi de yeniden doğrulayabilsin). */
  steps: PlatformCall[]
}

const FIELDS: Array<[keyof SharedFinding, string]> = [
  ['title', 'baslik'],
  ['kind', 'tur'],
  ['pages', 'sayfalar'],
  ['firstSeen', 'ilk'],
  ['lastSeen', 'son'],
  ['seenCount', 'gorulme'],
  ['page', 'sayfa'],
  ['scenario', 'senaryo'],
  ['expected', 'beklenen'],
  ['observed', 'gozlenen'],
  ['quote', 'alinti'],
  ['steps', 'adimlar'],
]

const oneLine = (value: string) => value.replace(/\s*\r?\n\s*/g, ' ').trim()

/** Anahtara göre sıralı yazılır: aynı içerik aynı dosyayı verir, Git farkı yalnız değişen satırlardır. */
export function serializeFindings(author: string, updatedAt: string, findings: SharedFinding[]): string {
  const body = [...findings]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) =>
      [
        `## ${oneLine(f.key)}`,
        ...FIELDS.map(([field, label]) => {
          const value = f[field]
          const text =
            field === 'steps'
              ? (value as PlatformCall[]).length
                ? JSON.stringify(value)
                : ''
              : Array.isArray(value)
                ? value.join(', ')
                : value === null
                  ? ''
                  : String(value)
          return `- ${label}: ${oneLine(text)}`
        }),
      ].join('\n'),
    )
    .join('\n\n')
  return serializeDocument({ data: { yazar: author, guncelleme: updatedAt }, body })
}

/** Bozuk adım listesi boş sayılır: vaka yeniden doğrulanamaz ama bulgu kaybolmaz. */
function parseSteps(text: string): PlatformCall[] {
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed)
      ? parsed.filter(
          (s): s is PlatformCall =>
            typeof s?.tool === 'string' && typeof s?.input === 'string' && typeof s?.write === 'boolean',
        )
      : []
  } catch {
    return []
  }
}

/** Bozuk ya da eksik bölüm atlanır (tek bölüm bütün dosyayı düşürmez). */
export function parseFindings(text: string): { author: string; updatedAt: string; findings: SharedFinding[] } {
  const { data, body } = parseDocument(text)
  const findings: SharedFinding[] = []
  for (const section of body.split(/^## /m).slice(1)) {
    const [head = '', ...lines] = section.split('\n')
    const key = head.trim()
    const values = new Map<string, string>()
    for (const line of lines) {
      const match = /^- ([a-z]+): ?(.*)$/.exec(line)
      if (match) values.set(match[1]!, match[2]!.trim())
    }
    const kind = values.get('tur') as FindingKind
    const title = values.get('baslik') ?? ''
    if (!key || !title || !FINDING_KINDS.includes(kind)) continue
    findings.push({
      key,
      title,
      kind,
      pages: (values.get('sayfalar') ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean),
      firstSeen: values.get('ilk') ?? '',
      lastSeen: values.get('son') ?? '',
      seenCount: Number(values.get('gorulme')) || 1,
      page: values.get('sayfa') ?? '',
      scenario: values.get('senaryo') ?? '',
      expected: values.get('beklenen') ?? '',
      observed: values.get('gozlenen') ?? '',
      quote: values.get('alinti') || null,
      steps: parseSteps(values.get('adimlar') ?? ''),
    })
  }
  return {
    author: typeof data.yazar === 'string' ? data.yazar : '',
    updatedAt: typeof data.guncelleme === 'string' ? data.guncelleme : '',
    findings,
  }
}
