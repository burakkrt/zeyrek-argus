import { strFromU8, unzipSync } from 'fflate'
import { ArgusError } from '../errors.ts'
import type { CustomerRow } from './store.ts'

type Column = 'no' | 'module' | 'area' | 'text' | 'status' | 'note'

/** Başlık adları (küçük harf, aksansız) → alan. Müşteri Excel'lerindeki adlar ve yakın biçimleri. */
const HEADERS: Record<string, Column> = {
  no: 'no',
  sira: 'no',
  modul: 'module',
  menu: 'area',
  ekran: 'area',
  'test edilen fonksiyon': 'text',
  bulgu: 'text',
  aciklama: 'text',
  durum: 'status',
  'gelistirici notlari': 'note',
  'gelistirici notu': 'note',
}

const normalize = (value: string) =>
  value
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim()

const decode = (value: string) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')

const textOf = (xml: string) => decode([...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  return [...letters].reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

function readRows(files: Record<string, Uint8Array>): string[][] {
  const sheetName = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0]
  if (!sheetName) throw new ArgusError('XLSX', 'Dosyada çalışma sayfası yok; .xlsx biçiminde bir Excel dosyası yükleyin.')
  const shared = files['xl/sharedStrings.xml']
  const strings = shared ? [...strFromU8(shared).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? '')) : []
  const sheet = strFromU8(files[sheetName]!)
  return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: string[] = []
    for (const cell of (row[1] ?? '').matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref = 'A1', attrs = '', inner = ''] = cell
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
      const value = /t="s"/.test(attrs) ? (strings[Number(raw)] ?? '') : /t="inlineStr"/.test(attrs) ? textOf(inner) : decode(raw ?? '')
      cells[columnIndex(ref)] = value.trim()
    }
    return cells
  })
}

/** Müşteri bulgu Excel'ini okur. Başlık satırı adından tanınır; metni olmayan satırlar atlanır. */
export function parseCustomerXlsx(file: Uint8Array, fileName: string): CustomerRow[] {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(file)
  } catch {
    throw new ArgusError('XLSX', 'Dosya açılamadı; .xlsx biçiminde bir Excel dosyası yükleyin.')
  }
  const rows = readRows(files)
  const headerAt = rows.findIndex((cells) => cells.filter((c) => c && HEADERS[normalize(c)]).length >= 2)
  if (headerAt < 0) throw new ArgusError('XLSX', 'Başlık satırı bulunamadı; en az "Modül" ve "Test Edilen Fonksiyon" sütunları olmalı.')
  const columns = new Map<Column, number>()
  rows[headerAt]!.forEach((cell, index) => {
    const column = cell ? HEADERS[normalize(cell)] : undefined
    if (column && !columns.has(column)) columns.set(column, index)
  })
  if (!columns.has('text')) throw new ArgusError('XLSX', '"Test Edilen Fonksiyon" (bulgu metni) sütunu bulunamadı.')
  const get = (cells: string[], column: Column) => {
    const index = columns.get(column)
    const value = index === undefined ? '' : (cells[index] ?? '')
    return value === '' ? null : value
  }
  const seen = new Set<string>()
  return rows.slice(headerAt + 1).flatMap((cells, offset) => {
    const text = get(cells, 'text')
    if (!text || seen.has(text)) return []
    seen.add(text)
    return [
      {
        ref: `${fileName}#${headerAt + offset + 2}`,
        module: get(cells, 'module'),
        area: get(cells, 'area'),
        text,
        status: get(cells, 'status'),
        note: get(cells, 'note'),
      },
    ]
  })
}
