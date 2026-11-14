import { describe, expect, it } from 'vitest'
import { fileKind, partitionFiles, sizeText } from './attachments'

describe('ek bileşeni', () => {
  it('dosya ailesi uzantıdan: etiket en çok 5 harf, aile rengi, görsel işareti', () => {
    expect(fileKind('Müşteri bulguları.XLSX')).toEqual({ label: 'XLSX', color: '#0F766E', image: false })
    expect(fileKind('gereksinim.pdf')).toEqual({ label: 'PDF', color: '#DC2626', image: false })
    expect(fileKind('ekran.png').image).toBe(true)
    expect(fileKind('not.markdown')).toEqual({ label: 'MARKD', color: '#6B7280', image: false })
    expect(fileKind('uzantisiz')).toEqual({ label: '', color: '#6B7280', image: false })
  })

  it('boyut metni KB ya da Türkçe ondalıklı MB', () => {
    expect(sizeText(10)).toBe('1 KB')
    expect(sizeText(20_480)).toBe('20 KB')
    expect(sizeText(1.45 * 1024 * 1024)).toBe('1,5 MB')
  })

  it('seçilen dosyalar tür, boyut ve kalan yere göre ayrılır', () => {
    const files = [
      { name: 'a.pdf', size: 10 },
      { name: 'b.exe', size: 10 },
      { name: 'c.csv', size: 999 },
      { name: 'd.png', size: 10 },
      { name: 'e.docx', size: 10 },
    ]
    const result = partitionFiles(files, { accept: ['pdf', 'csv', 'png', 'docx'], maxBytes: 100, room: 2 })
    expect(result.take.map((f) => f.name)).toEqual(['a.pdf', 'd.png'])
    expect(result.rejected).toEqual([
      { name: 'b.exe', reason: 'tur' },
      { name: 'c.csv', reason: 'boyut' },
      { name: 'e.docx', reason: 'sinir' },
    ])
  })
})
