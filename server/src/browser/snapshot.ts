/**
 * Sayfa ağacını (Playwright aria anlık görüntüsü, "ai" kipi) modele gitmeden önce küçültür. Token'ın çoğu
 * tekrar eden satırlarda gider: 50 satırlık tablo, 40 seçenekli liste. Aynı roldeki uzun kardeş dizileri ilk
 * dördü ve sonuncusu kalacak biçimde özetlenir; uzun metinler kırpılır; toplam bir üst sınırda kesilir.
 */

interface Node {
  line: string
  children: Node[]
}

const KEEP_HEAD = 4
const MAX_TEXT = 160

function parse(text: string): Node[] {
  const root: Node = { line: '', children: [] }
  const stack: Array<{ indent: number; node: Node }> = [{ indent: -1, node: root }]
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue
    const indent = raw.length - raw.trimStart().length
    const node: Node = { line: raw.trim(), children: [] }
    while (stack.length > 1 && stack[stack.length - 1]!.indent >= indent) stack.pop()
    stack[stack.length - 1]!.node.children.push(node)
    stack.push({ indent, node })
  }
  return root.children
}

/** Satırın rolü (`- row …`, YAML tırnaklı `- 'cell "a: b"'` biçimi dahil). */
const roleOf = (line: string) => /^-\s+'?([\w/-]+)/.exec(line)?.[1] ?? ''

function shortenText(line: string): string {
  return line.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner: string) =>
    inner.length > MAX_TEXT ? `"${inner.slice(0, MAX_TEXT)}…"` : match,
  )
}

function compressChildren(children: Node[]): Node[] {
  const out: Node[] = []
  let i = 0
  while (i < children.length) {
    const role = roleOf(children[i]!.line)
    let j = i
    while (j < children.length && roleOf(children[j]!.line) === role) j += 1
    const run = children.slice(i, j)
    if (role && run.length > KEEP_HEAD + 2) {
      out.push(...run.slice(0, KEEP_HEAD))
      out.push({ line: `- … (+${run.length - KEEP_HEAD - 1} benzer ${role})`, children: [] })
      out.push(run[run.length - 1]!)
    } else {
      out.push(...run)
    }
    i = j
  }
  return out
}

function render(nodes: Node[], depth: number, lines: string[]): void {
  for (const node of compressChildren(nodes)) {
    lines.push(`${'  '.repeat(depth)}${shortenText(node.line)}`)
    render(node.children, depth + 1, lines)
  }
}

export function compressSnapshot(snapshot: string, limit = 12_000): string {
  const lines: string[] = []
  render(parse(snapshot), 0, lines)
  const text = lines.join('\n')
  return text.length > limit
    ? `${text.slice(0, limit)}\n… (ağaç kırpıldı; ekranın tamamı için kaydırın)`
    : text
}
