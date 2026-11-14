import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import {
  attachmentName,
  loadAttachments,
  MAX_ATTACHMENTS,
  saveAttachment,
  TEXT_LIMIT,
  validAttachments,
} from './attachments.ts'

let dir: string
const fresh = () => (dir = mkdtempSync(join(tmpdir(), 'argus-ek-')))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const xlsx = zipSync({
  'xl/sharedStrings.xml': strToU8(
    '<sst><si><t>Modül</t></si><si><t>Bulgu</t></si><si><t>Toplam &amp; satır</t></si></sst>',
  ),
  'xl/worksheets/sheet1.xml': strToU8(
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2"><v>12</v></c><c r="B2" t="s"><v>2</v></c></row><row r="3"></row></sheetData></worksheet>',
  ),
})
const docx = zipSync({
  'word/document.xml': strToU8(
    '<w:document><w:body><w:p><w:r><w:t>Gereksinim</w:t></w:r><w:r><w:t xml:space="preserve"> 1</w:t></w:r></w:p>' +
      '<w:p></w:p><w:p><w:r><w:t>Tarih zorunlu</w:t></w:r></w:p></w:body></w:document>',
  ),
})

describe('koşu ekleri', () => {
  it('her tür kendi biçiminde yüklenir: görsel ve PDF base64, Excel / Word / CSV metin; ad kimlikte taşınır', () => {
    fresh()
    const ids = [
      saveAttachment(dir, new Uint8Array([137, 80, 78, 71]), 'Ekran görüntüsü (2).png', 'image/png'),
      saveAttachment(dir, strToU8('%PDF-1'), 'gereksinim.pdf'),
      saveAttachment(dir, xlsx, 'müşteri bulguları.xlsx', 'application/octet-stream'),
      saveAttachment(dir, docx, 'analiz.docx'),
      // Windows CSV'ye Excel MIME'ı verir; tür uzantıdan çıkar.
      saveAttachment(dir, strToU8('no;bulgu\n1;Liste boş'), 'liste.csv', 'application/vnd.ms-excel'),
      saveAttachment(dir, new Uint8Array([255, 216]), '', 'image/jpeg'),
    ]
    expect(attachmentName(ids[0]!)).toBe('Ekran-görüntüsü-2-.png')
    expect(loadAttachments(dir, ids)).toEqual([
      { name: 'Ekran-görüntüsü-2-.png', kind: 'image', mediaType: 'image/png', data: 'iVBORw==' },
      { name: 'gereksinim.pdf', kind: 'pdf', data: 'JVBERi0x' },
      {
        name: 'müşteri-bulguları.xlsx',
        kind: 'text',
        text: 'Modül | Bulgu\n12 | Toplam & satır',
        truncated: false,
      },
      { name: 'analiz.docx', kind: 'text', text: 'Gereksinim 1\nTarih zorunlu', truncated: false },
      { name: 'liste.csv', kind: 'text', text: 'no;bulgu\n1;Liste boş', truncated: false },
      { name: 'ek.jpg', kind: 'image', mediaType: 'image/jpeg', data: '/9g=' },
    ])
  })

  it('uzun metin sınırda kesilir, bozuk Excel koşuyu düşürmez', () => {
    fresh()
    const long = saveAttachment(dir, strToU8('a'.repeat(TEXT_LIMIT + 5)), 'uzun.txt')
    const broken = saveAttachment(dir, strToU8('zip değil'), 'bozuk.xlsx')
    const [text, failed] = loadAttachments(dir, [long, broken])
    expect(text).toMatchObject({ kind: 'text', truncated: true })
    expect(text?.kind === 'text' && text.text.length).toBe(TEXT_LIMIT)
    expect(failed).toEqual({ name: 'bozuk.xlsx', kind: 'text', text: '(dosya okunamadı)', truncated: false })
  })

  it('desteklenmeyen tür ya da çok büyük dosya reddedilir', () => {
    fresh()
    expect(() => saveAttachment(dir, new Uint8Array([1]), 'kurulum.exe')).toThrow(/eklenemez/)
    expect(() => saveAttachment(dir, new Uint8Array(10 * 1024 * 1024 + 1), 'a.pdf')).toThrow(/10 MB/)
  })

  it('koşuya yalnız var olan, biçimi doğru kimlikler yazılır; üst sınır aşılmaz', () => {
    fresh()
    const ids = Array.from({ length: MAX_ATTACHMENTS + 2 }, () =>
      saveAttachment(dir, new Uint8Array([1]), 'a.txt'),
    )
    const valid = validAttachments(dir, [...ids, '../gizli.png', 'yok.png', 42])
    expect(valid).toEqual(ids.slice(0, MAX_ATTACHMENTS))
    expect(validAttachments(dir, 'bozuk')).toEqual([])
  })
})
