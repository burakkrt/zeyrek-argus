/**
 * Planlayıcının senaryo cümlesi tek metindir: "<durum>: <ne olmalı>. Tutarsızlık: <bulgu sayılan>". Plan sayfası onu
 * Durum · Ne olmalı · Bulgu sayılır sütunlarına böler ve insan üç alanı ayrı doldurur; kaydederken aynı kalıpta tek
 * metne döner (planlayıcı ve koşu senaryoyu hep bu biçimde okur). Kalıba uymayan metin bölünmez: tamamı "Ne olmalı"ya
 * düşer.
 */
export interface ScenarioParts {
  name: string
  expected: string
  issue: string
}

const ISSUE_MARK = 'Tutarsızlık:'

export function scenarioParts(text: string): ScenarioParts {
  const at = text.indexOf(ISSUE_MARK)
  const head = (at < 0 ? text : text.slice(0, at)).trim()
  const issue = at < 0 ? '' : text.slice(at + ISSUE_MARK.length).trim()
  const colon = head.indexOf(':')
  if (colon < 0) return { name: '', expected: head, issue }
  return { name: head.slice(0, colon).trim(), expected: head.slice(colon + 1).trim(), issue }
}

export function scenarioText(parts: ScenarioParts): string {
  const name = parts.name.trim()
  const expected = parts.expected.trim()
  const issue = parts.issue.trim()
  const head = name ? `${name}: ${expected}` : expected
  if (!issue) return head
  return `${/[.!?]$/.test(head) ? head : `${head}.`} ${ISSUE_MARK} ${issue}`
}
