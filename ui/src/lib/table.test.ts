import { describe, expect, it } from 'vitest'
import {
  columnRules,
  defaultPrefs,
  distinctValues,
  moveColumn,
  nextSort,
  orderedColumns,
  PAGE_GAP,
  pageSlots,
  pageState,
  parsePrefs,
  prefsChanged,
  queryRows,
  toggleColumn,
  visibleColumns,
  type TableColumn,
} from './table'

interface Row {
  name: string
  module: string
  issues: number | null
  last: string | null
}

const rows: Row[] = [
  { name: 'Eğitim listesi', module: 'egt', issues: 3, last: '2026-11-10T10:00:00Z' },
  { name: 'İş takvimi', module: 'iş', issues: null, last: null },
  { name: 'eğitim formu', module: 'egt', issues: 0, last: '2026-11-01T10:00:00Z' },
  { name: 'Anket 10', module: 'anket', issues: 12, last: '2026-11-12T10:00:00Z' },
  { name: 'Anket 2', module: 'anket', issues: 1, last: null },
]

const columns: TableColumn<Row>[] = [
  { key: 'name', label: 'Sayfa', value: (r) => r.name, required: true },
  { key: 'module', label: 'Modül', value: (r) => r.module, kind: 'enum' },
  { key: 'issues', label: 'Açık bulgu', value: (r) => r.issues, kind: 'number', align: 'end' },
  { key: 'last', label: 'Son koşu', value: (r) => r.last, kind: 'date', hidden: true },
]

const names = (list: Row[]) => list.map((r) => r.name)
const today = '2026-11-14'
const filter = (filters: Record<string, string>) =>
  names(queryRows(rows, columns, { rules: columnRules(columns, filters, today), sort: null }))

describe('ortak tablo', () => {
  it('kolon süzgeci: metin Türkçe harf duyarsız içerir, seçenek ve sayı eşittir; hepsi birlikte (VE)', () => {
    expect(filter({ name: 'EĞİTİM' })).toEqual(['Eğitim listesi', 'eğitim formu'])
    expect(filter({ name: 'iş' })).toEqual(['İş takvimi'])
    expect(filter({ module: 'anket', issues: '12' })).toEqual(['Anket 10'])
    // Boş sayı 0'a eşit sayılmaz.
    expect(filter({ issues: '0' })).toEqual(['eğitim formu'])
    expect(filter({ name: '  ' })).toHaveLength(rows.length)
  })

  it('tarih süzgeci göreli: son 7 / 30 gün, 30 günden eski, hiç yok', () => {
    expect(filter({ last: '7' })).toEqual(['Eğitim listesi', 'Anket 10'])
    expect(filter({ last: '30' })).toEqual(['Eğitim listesi', 'eğitim formu', 'Anket 10'])
    expect(filter({ last: 'eski' })).toEqual([])
    expect(filter({ last: 'yok' })).toEqual(['İş takvimi', 'Anket 2'])
  })

  it('hazır süzgeç kolon süzgeciyle birlikte uygulanır', () => {
    const preset = { id: 'bulgulu', label: 'Bulgusu olan', test: (r: Row) => (r.issues ?? 0) > 0 }
    const rules = columnRules(columns, { name: 'anket' }, today)
    expect(names(queryRows(rows, columns, { rules, sort: null, preset }))).toEqual(['Anket 10', 'Anket 2'])
  })

  it('sıralama doğal sayı sırasıyla, boşlar her yönde sonda, eşitlerde kaynak sırası korunur', () => {
    const sorted = (key: string, dir: 'asc' | 'desc') =>
      names(queryRows(rows, columns, { rules: [], sort: { key, dir } }))
    expect(sorted('issues', 'desc')).toEqual([
      'Anket 10',
      'Eğitim listesi',
      'Anket 2',
      'eğitim formu',
      'İş takvimi',
    ])
    expect(sorted('name', 'asc')).toEqual([
      'Anket 2',
      'Anket 10',
      'eğitim formu',
      'Eğitim listesi',
      'İş takvimi',
    ])
    expect(sorted('module', 'asc')).toEqual([
      'Anket 10',
      'Anket 2',
      'Eğitim listesi',
      'eğitim formu',
      'İş takvimi',
    ])
    expect(nextSort(null, 'a')).toEqual({ key: 'a', dir: 'asc' })
    expect(nextSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' })
    expect(nextSort({ key: 'a', dir: 'desc' }, 'a')).toBeNull()
    expect(nextSort({ key: 'a', dir: 'desc' }, 'b')).toEqual({ key: 'b', dir: 'asc' })
  })

  it('kolon tercihi: gizle, taşı, zorunlu kolon gizlenmez, sıfırlama gerekip gerekmediği bilinir', () => {
    const prefs = defaultPrefs(columns)
    expect(prefs.hidden).toEqual(['last'])
    expect(prefsChanged(columns, prefs)).toBe(false)
    expect(
      visibleColumns(columns, toggleColumn(toggleColumn(prefs, 'last'), 'module')).map((c) => c.key),
    ).toEqual(['name', 'issues', 'last'])
    expect(visibleColumns(columns, toggleColumn(prefs, 'name')).map((c) => c.key)).toEqual([
      'name',
      'module',
      'issues',
    ])
    const moved = moveColumn(columns, prefs, 2, 0)
    expect(orderedColumns(columns, moved).map((c) => c.key)).toEqual(['issues', 'name', 'module', 'last'])
    expect(prefsChanged(columns, moved)).toBe(true)
    expect(moveColumn(columns, prefs, 0, -1).order).toEqual(['name', 'module', 'issues', 'last'])
  })

  it('saklanan tercih: bozuksa varsayılan, kaldırılan kolon atılır, yeni kolon sona girer', () => {
    expect(parsePrefs('{bozuk', columns)).toEqual(defaultPrefs(columns))
    const prefs = parsePrefs(JSON.stringify({ order: ['issues', 'eski', 'name'], hidden: [] }), columns)
    expect(orderedColumns(columns, prefs).map((c) => c.key)).toEqual(['issues', 'name', 'module', 'last'])
  })

  it('seçenek kolonunun farklı değerleri Türkçe sırayla', () => {
    expect(distinctValues(rows, columns[1]!)).toEqual(['anket', 'egt', 'iş'])
  })

  it('sayfalama: sayfa sayısı en az 1, taşan sayfa son sayfaya çekilir, düğmeler 7 yerde sabit', () => {
    expect(pageState(0, 20, 3)).toEqual({ pages: 1, current: 0, start: 0, end: 0 })
    expect(pageState(45, 20, 9)).toEqual({ pages: 3, current: 2, start: 40, end: 45 })
    expect(pageSlots(0, 5)).toEqual([0, 1, 2, 3, 4])
    expect(pageSlots(2, 10)).toEqual([0, 1, 2, 3, 4, PAGE_GAP, 9])
    expect(pageSlots(5, 10)).toEqual([0, PAGE_GAP, 4, 5, 6, PAGE_GAP, 9])
    expect(pageSlots(8, 10)).toEqual([0, PAGE_GAP, 5, 6, 7, 8, 9])
  })

  it('arama: her sözcük metin ya da seçenek kolonlarından birinde geçmeli; sayı ve tarih kolonu aranmaz', () => {
    const search = (text: string) => names(queryRows(rows, columns, { search: text, rules: [], sort: null }))
    expect(search('EĞİTİM egt')).toEqual(['Eğitim listesi', 'eğitim formu'])
    expect(search('anket 2')).toEqual(['Anket 2'])
    expect(search('12')).toEqual([])
    expect(search('  ')).toHaveLength(rows.length)
  })
})
