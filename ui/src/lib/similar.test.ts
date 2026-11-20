import { describe, expect, it } from 'vitest'
import { similar } from './similar'

describe('metin benzerliği', () => {
  it('kısa olanın kelimelerinin çoğu ötekinde geçiyorsa benzer; noktalama ve Türkçe büyük harf yok sayılır', () => {
    expect(similar('Durum kolonu Statü diye geçiyor', 'Durum kolonu bir yerde "Statü" diye geçiyor.')).toBe(true)
    expect(similar('İLAN TARİHİ', 'ilan tarihi boş')).toBe(true)
    expect(similar('Olay tarihi zorunlu değil', 'Liste kolonları sıralanmıyor')).toBe(false)
    expect(similar('', 'x')).toBe(false)
  })
})
