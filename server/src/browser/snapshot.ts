/**
 * Sayfa ağacını (Playwright aria anlık görüntüsü, "ai" kipi) modele gitmeden önce küçültür. Token'ın çoğu
 * tekrar eden satırlarda ve içi boş sarmalayıcılarda gider. Aynı roldeki uzun kardeş dizileri ilk üçü ve sonuncusu
 * kalacak biçimde özetlenir; tek çocuklu, adsız sarmalayıcılar (generic) atlanır; uzun metinler kırpılır; toplam bir
 * üst sınırda kesilir. Etkileşimden sonra ağacın tamamı yerine yalnız değişen kısım gönderilir (`diffSnapshot`).
 */

interface Node {
  line: string
  children: Node[]
}

const KEEP_HEAD = 3
const MAX_TEXT = 120

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

/** İçeriği olmayan sarmalayıcı: adı, metni ve tıklanabilirliği yok (`- generic [ref=e5]:`). */
const isBareWrapper = (node: Node) =>
  node.children.length === 1 &&
  /^-\s+generic(\s+\[[^\]]*\])*:$/.test(node.line) &&
  !node.line.includes('cursor=pointer')

function shortenText(line: string): string {
  return line.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner: string) =>
    inner.length > MAX_TEXT ? `"${inner.slice(0, MAX_TEXT)}…"` : match,
  )
}

function compressChildren(children: Node[]): Node[] {
  const flat = children.map((node) => {
    let current = node
    while (isBareWrapper(current)) current = current.children[0]!
    return current
  })
  const out: Node[] = []
  let i = 0
  while (i < flat.length) {
    const role = roleOf(flat[i]!.line)
    let j = i
    while (j < flat.length && roleOf(flat[j]!.line) === role) j += 1
    const run = flat.slice(i, j)
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

export function compressSnapshot(snapshot: string, limit = 9_000): string {
  const lines: string[] = []
  render(parse(snapshot), 0, lines)
  const text = lines.join('\n')
  return text.length > limit
    ? `${text.slice(0, limit)}\n… (ağaç kırpıldı; ekranın tamamı için kaydırın)`
    : text
}

const indentOf = (line: string) => line.length - line.trimStart().length

/** Ref'ler atılmış ağaç: aynı ekranın yeniden çizilmesi ref'leri değiştirse de aynı sayılsın. */
export const stripRefs = (tree: string) => tree.replace(/\s*\[ref=[^\]]*\]/g, '')

/** İki ağaç arasında eklenen ya da kalkan satır sayısı. */
export function changeSize(previous: string, next: string): number {
  const before = new Map<string, number>()
  for (const line of previous.split('\n')) before.set(line, (before.get(line) ?? 0) + 1)
  let added = 0
  for (const line of next.split('\n')) {
    const left = before.get(line) ?? 0
    if (left > 0) before.set(line, left - 1)
    else added += 1
  }
  return added + [...before.values()].reduce((sum, n) => sum + n, 0)
}

/**
 * İki (sıkıştırılmış) ağacın farkı: yeni ya da değişen satırlar, üst satırlarıyla birlikte (nerede olduğu belli
 * olsun). Değişiklik ağacın büyük kısmıysa (sayfa değişti) ağacın tamamı döner.
 */
export function diffSnapshot(
  previous: string,
  next: string,
): { mode: 'tam' | 'fark' | 'ayni'; text: string } {
  const before = new Map<string, number>()
  for (const line of previous.split('\n')) before.set(line, (before.get(line) ?? 0) + 1)
  const lines = next.split('\n')
  const changed = new Set<number>()
  lines.forEach((line, i) => {
    const left = before.get(line) ?? 0
    if (left > 0) before.set(line, left - 1)
    else changed.add(i)
  })
  const removed = [...before.values()].reduce((sum, n) => sum + n, 0)
  if (!changed.size && !removed) return { mode: 'ayni', text: 'Ekranın ağacı değişmedi.' }
  if (changed.size > lines.length * 0.6) return { mode: 'tam', text: next }
  const keep = new Set<number>()
  for (const i of changed) {
    keep.add(i)
    let depth = indentOf(lines[i]!)
    for (let j = i - 1; j >= 0 && depth > 0; j -= 1) {
      const d = indentOf(lines[j]!)
      if (d < depth) {
        keep.add(j)
        depth = d
      }
    }
  }
  const out = [...keep].sort((a, b) => a - b).map((i) => (changed.has(i) ? `${lines[i]}  ⟵ yeni` : lines[i]!))
  return {
    mode: 'fark',
    text: `Yalnız değişen kısım (${changed.size} yeni/değişen satır${removed ? `, ${removed} satır kalktı` : ''}; geri kalan ağaç aynı):\n${out.join('\n')}`,
  }
}
