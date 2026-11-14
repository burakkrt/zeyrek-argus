/**
 * Ortak veri tablosunun (`components/table/DataTable.svelte`) saf mantığı: kolon altı süzgeç, hazır süzgeç, sıralama
 * ve kolon tercihleri (gizle, sırala). Zeyrek'in platform tablosunun davranışını istemci tarafında izler; bileşen
 * yalnız bunları çağırır, alan bilgisi taşımaz.
 */

export type ColumnKind = 'text' | 'number' | 'date' | 'enum'
export type CellValue = string | number | null | undefined

export interface TableColumn<T> {
  key: string
  label: string
  /** Hücrenin ham değeri: süzgeç ve sıralama bununla yapılır. Tarih ISO metindir. */
  value: (row: T) => CellValue
  kind?: ColumnKind
  align?: 'start' | 'center' | 'end'
  /** Varsayılan açık. */
  sortable?: boolean
  /** Varsayılan açık; kapalıysa kolon altında süzgeç kutusu çizilmez. */
  filterable?: boolean
  /** İlk açılışta gizli (kullanıcı kolon ayarlarından açar). */
  hidden?: boolean
  /** Kolon ayarlarında gizlenemez (ör. ad kolonu). */
  required?: boolean
  /** Tailwind genişlik sınıfı (ör. `w-32`). */
  width?: string
}

export type SortState = { key: string; dir: 'asc' | 'desc' } | null

export interface TablePreset<T> {
  id: string
  label: string
  test: (row: T) => boolean
}

/** Kolon süzgecinin kuralı: metin içerir, sayı / seçenek eşittir, tarih önce / sonra / boş. */
export interface ColumnRule {
  field: string
  op: 'contains' | 'eq' | 'before' | 'after' | 'empty'
  value: string
}

const lower = (value: CellValue) => String(value ?? '').toLocaleLowerCase('tr')
const blank = (value: CellValue) => value === null || value === undefined || value === ''

export function matchesRule<T>(row: T, column: TableColumn<T>, rule: ColumnRule): boolean {
  const value = column.value(row)
  switch (rule.op) {
    case 'empty':
      return blank(value)
    case 'contains':
      return lower(value).includes(lower(rule.value))
    case 'eq':
      return column.kind === 'number'
        ? !blank(value) && Number(value) === Number(rule.value)
        : lower(value) === lower(rule.value)
    case 'before':
      return !blank(value) && String(value).slice(0, 10) < rule.value
    case 'after':
      return !blank(value) && String(value).slice(0, 10) > rule.value
  }
}

/** Tarih kolonunun alt süzgeci: göreli aralıklar (platformdaki "Tarih seçin" açılır kutusu). */
export const DATE_FILTERS = [
  { value: '7', label: 'Son 7 gün' },
  { value: '30', label: 'Son 30 gün' },
  { value: 'eski', label: '30 günden eski' },
  { value: 'yok', label: 'Hiç yok' },
]

const daysBefore = (today: string, days: number) => {
  const date = new Date(`${today}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

/**
 * Kolon altı süzgeç değerlerinden kurallar: metin "içerir" (≈), sayı ve seçenek "eşittir", tarih göreli aralık
 * (`today` YYYY-AA-GG). Boş değer kural üretmez.
 */
export function columnRules<T>(
  columns: TableColumn<T>[],
  filters: Record<string, string>,
  today: string,
): ColumnRule[] {
  return columns.flatMap((column): ColumnRule[] => {
    const value = (filters[column.key] ?? '').trim()
    if (!value) return []
    const rule = (op: ColumnRule['op'], v = value): ColumnRule[] => [{ field: column.key, op, value: v }]
    if (column.kind === 'date') {
      if (value === 'yok') return rule('empty', '')
      if (value === 'eski') return rule('before', daysBefore(today, 30))
      return rule('after', daysBefore(today, Number(value) + 1))
    }
    return rule(column.kind === 'number' || column.kind === 'enum' ? 'eq' : 'contains')
  })
}

export interface TableQuery<T> {
  /** Tablo araması: her sözcük metin ve seçenek kolonlarından birinde geçmeli (Türkçe harf duyarsız). */
  search?: string
  /** Kolon altı süzgeçlerin kuralları (`columnRules`): hep birlikte (VE) uygulanır. */
  rules: ColumnRule[]
  sort: SortState
  preset?: TablePreset<T> | null
}

const compare = (a: CellValue, b: CellValue, kind: ColumnKind | undefined) => {
  // Boş değer yönden bağımsız hep sonda.
  if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1
  if (kind === 'number') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), 'tr', { numeric: true, sensitivity: 'base' })
}

/** Görünen satırlar: hazır süzgeç → arama → kolon süzgeçleri (VE) → sıralama. Kaynak dizi değişmez. */
export function queryRows<T>(rows: T[], columns: TableColumn<T>[], query: TableQuery<T>): T[] {
  const rules = query.rules.flatMap((rule) => {
    const column = columns.find((c) => c.key === rule.field)
    return column ? [{ rule, column }] : []
  })
  const words = lower(query.search ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const searched = columns.filter((c) => !c.kind || c.kind === 'text' || c.kind === 'enum')
  const result = rows.filter(
    (row) =>
      (!query.preset || query.preset.test(row)) &&
      (!words.length ||
        words.every((word) => searched.some((column) => lower(column.value(row)).includes(word)))) &&
      rules.every(({ rule, column }) => matchesRule(row, column, rule)),
  )
  const sort = query.sort
  const column = sort && columns.find((c) => c.key === sort.key)
  if (!sort || !column) return result
  const sign = sort.dir === 'asc' ? 1 : -1
  return result
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const va = column.value(a.row)
      const vb = column.value(b.row)
      if (blank(va) || blank(vb)) return compare(va, vb, column.kind) || a.index - b.index
      return sign * compare(va, vb, column.kind) || a.index - b.index
    })
    .map((item) => item.row)
}

/** Başlığa tıklama: artan → azalan → sırasız. Başka kolona geçince artandan başlar. */
export function nextSort(sort: SortState, key: string): SortState {
  if (sort?.key !== key) return { key, dir: 'asc' }
  return sort.dir === 'asc' ? { key, dir: 'desc' } : null
}

/** Kolonun süzgeçte seçilebilecek değerleri (seçenek kolonu): satırlardaki farklı değerler, Türkçe sırayla. */
export function distinctValues<T>(rows: T[], column: TableColumn<T>): string[] {
  const values = new Set<string>()
  for (const row of rows) {
    const value = column.value(row)
    if (!blank(value)) values.add(String(value))
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'tr'))
}

export interface ColumnPrefs {
  order: string[]
  hidden: string[]
}

/** Tanımdan varsayılan tercih: tanım sırası, `hidden` olanlar gizli. */
export const defaultPrefs = <T>(columns: TableColumn<T>[]): ColumnPrefs => ({
  order: columns.map((c) => c.key),
  hidden: columns.filter((c) => c.hidden && !c.required).map((c) => c.key),
})

/**
 * Tercihe göre sıralanmış bütün kolonlar (gizliler dahil; kolon ayarları bunları listeler). Saklanan tercihte artık
 * olmayan kolon atılır, tanıma sonradan eklenen kolon sona girer.
 */
export function orderedColumns<T>(columns: TableColumn<T>[], prefs: ColumnPrefs): TableColumn<T>[] {
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const known = prefs.order.filter((key) => byKey.has(key))
  const rest = columns.filter((c) => !known.includes(c.key)).map((c) => c.key)
  return [...known, ...rest].map((key) => byKey.get(key)!)
}

/** Görünen kolonlar: gizlenmemiş ya da zorunlu olanlar, tercih sırasıyla. */
export const visibleColumns = <T>(columns: TableColumn<T>[], prefs: ColumnPrefs) =>
  orderedColumns(columns, prefs).filter((c) => c.required || !prefs.hidden.includes(c.key))

export function toggleColumn(prefs: ColumnPrefs, key: string): ColumnPrefs {
  return {
    ...prefs,
    hidden: prefs.hidden.includes(key) ? prefs.hidden.filter((k) => k !== key) : [...prefs.hidden, key],
  }
}

/** Kolonu kolon ayarlarında hedef sıraya taşır (sürükle-bırak ya da tutamaçta ↑/↓). */
export function moveColumn<T>(
  columns: TableColumn<T>[],
  prefs: ColumnPrefs,
  from: number,
  to: number,
): ColumnPrefs {
  const order = orderedColumns(columns, prefs).map((c) => c.key)
  if (to < 0 || to >= order.length || from === to) return { ...prefs, order }
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved!)
  return { ...prefs, order }
}

/** Tercih varsayılandan farklı mı (kolon ayarlarında "Sıfırla" görünür). */
export const prefsChanged = <T>(columns: TableColumn<T>[], prefs: ColumnPrefs) =>
  JSON.stringify(orderedColumns(columns, prefs).map((c) => c.key)) !==
    JSON.stringify(columns.map((c) => c.key)) ||
  JSON.stringify([...prefs.hidden].sort()) !== JSON.stringify(defaultPrefs(columns).hidden.sort())

/** Saklanan tercihi okur; bozuksa varsayılan. */
export function parsePrefs<T>(raw: string | null, columns: TableColumn<T>[]): ColumnPrefs {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<ColumnPrefs> | null
    if (value && Array.isArray(value.order) && Array.isArray(value.hidden))
      return {
        order: value.order.filter((k) => typeof k === 'string'),
        hidden: value.hidden.filter((k) => typeof k === 'string'),
      }
  } catch {
    /* bozuk tercih: varsayılan */
  }
  return defaultPrefs(columns)
}

/** Sayfa başına satır seçenekleri ve varsayılanı (platform tablosuyla aynı). */
export const PAGE_SIZES = [10, 20, 30, 40, 50]
export const DEFAULT_PAGE_SIZE = 20
export const PAGE_GAP = '…'

/** Sayfa sayısı (en az 1) ve geçerli aralığa çekilmiş sayfa (0 tabanlı). */
export function pageState(total: number, size: number, page: number) {
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(0, page), pages - 1)
  return { pages, current, start: current * size, end: Math.min(total, (current + 1) * size) }
}

/**
 * Sayfa düğmeleri (0 tabanlı; arada `…`): 7 ve daha az sayfada hepsi, fazlasında ilk, son, geçerli sayfa ve iki
 * komşusu. Düğme sayısı sabit kalır (7), sayfa değiştikçe çubuk zıplamaz.
 */
export function pageSlots(current: number, pages: number): Array<number | typeof PAGE_GAP> {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
  if (pages <= 7) return range(0, pages - 1)
  if (current <= 3) return [...range(0, 4), PAGE_GAP, pages - 1]
  if (current >= pages - 4) return [0, PAGE_GAP, ...range(pages - 5, pages - 1)]
  return [0, PAGE_GAP, current - 1, current, current + 1, PAGE_GAP, pages - 1]
}
