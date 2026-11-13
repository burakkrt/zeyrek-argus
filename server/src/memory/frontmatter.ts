/**
 * Hafıza dosyalarının ön bilgisi: `---` arasında `anahtar: değer` satırları. Değerler metin ya da `[a, b]` listesi.
 * Bilinçli olarak küçük bir YAML alt kümesi: insan elle düzenlediğinde şaşırtmasın, Git farkı okunur olsun.
 */

export type FrontValue = string | string[]

export interface Document {
  data: Record<string, FrontValue>
  body: string
}

function unquote(value: string): string {
  const v = value.trim()
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try {
      return JSON.parse(v) as string
    } catch {
      return v.slice(1, -1)
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'")
  return v
}

function splitList(inner: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]!
    if (quote) {
      current += ch
      if (ch === '\\' && quote === '"') {
        current += inner[i + 1] ?? ''
        i += 1
      } else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
    } else if (ch === ',') {
      out.push(current)
      current = ''
    } else current += ch
  }
  if (current.trim()) out.push(current)
  return out.map(unquote).filter((v) => v !== '')
}

export function parseDocument(text: string): Document {
  const normalized = text.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized)
  if (!match) return { data: {}, body: normalized.trim() }
  const data: Record<string, FrontValue> = {}
  let listKey: string | null = null
  for (const line of match[1]!.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && listKey) {
      const list = data[listKey]
      data[listKey] = [...(Array.isArray(list) ? list : []), unquote(item[1]!)]
      continue
    }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!pair) throw new Error(`Ön bilgi satırı okunamadı: "${line}"`)
    const [, key, raw] = pair as unknown as [string, string, string]
    const value = raw.trim()
    if (value === '') {
      data[key] = []
      listKey = key
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = splitList(value.slice(1, -1))
      listKey = null
    } else {
      data[key] = unquote(value)
      listKey = null
    }
  }
  return { data, body: match[2]!.trim() }
}

const needsQuote = (value: string) => value === '' || /^[\s"'[{>|*&!%@`-]|[:#,\]]|\s$/.test(value)
const scalar = (value: string) => (needsQuote(value) ? JSON.stringify(value) : value)

export function serializeDocument(doc: Document): string {
  const lines = Object.entries(doc.data)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => (Array.isArray(value) ? `${key}: [${value.map(scalar).join(', ')}]` : `${key}: ${scalar(value)}`))
  return `---\n${lines.join('\n')}\n---\n${doc.body.trim()}\n`
}

export const asString = (value: FrontValue | undefined, fallback = ''): string =>
  value === undefined ? fallback : Array.isArray(value) ? value.join(', ') : value

export const asList = (value: FrontValue | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : value ? [value] : []
