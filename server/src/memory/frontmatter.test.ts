import { describe, expect, it } from 'vitest'
import { parseDocument, serializeDocument } from './frontmatter.ts'

describe('ön bilgi', () => {
  it('gidiş-dönüş: metin, liste, özel karakterli değer ve gövde korunur', () => {
    const doc = {
      data: {
        id: 'sapkali-harf',
        kapsam: 'modul:pf',
        desen: '[âîûÂÎÛ]',
        kaynak: ['musteri:Kitap1.xlsx#1', 'karar:yz:x, y'],
        metin: 'Şikayet: "düz" yazılır',
      },
      body: 'Arayüzde şapkalı harf kullanılmaz.\n\nİkinci paragraf.',
    }
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('elle yazılmış blok listeyi ve tırnaksız değerleri okur', () => {
    const text = '---\nid: a\nkaynak:\n  - bir\n  - "iki, üç"\ndurum: onayli\n---\nGövde'
    expect(parseDocument(text)).toEqual({ data: { id: 'a', kaynak: ['bir', 'iki, üç'], durum: 'onayli' }, body: 'Gövde' })
  })

  it('ön bilgisiz dosyada gövdeyi döner, bozuk satırda nedenini söyler', () => {
    expect(parseDocument('sadece metin')).toEqual({ data: {}, body: 'sadece metin' })
    expect(() => parseDocument('---\nbu satır bozuk\n---\n')).toThrow(/okunamadı/)
  })
})
