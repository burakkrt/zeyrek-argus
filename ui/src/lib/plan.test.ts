import { describe, expect, it } from 'vitest'
import { scenarioParts, scenarioText } from './plan'

describe('senaryo sütunları', () => {
  it('durum, ne olmalı ve bulgu sayılan ayrılır', () => {
    expect(
      scenarioParts(
        'Plan onayı: plan doğrulanıp onaya gider, onaylanınca aktifleşir. Tutarsızlık: hatalı planın gönderilebilmesi.',
      ),
    ).toEqual({
      name: 'Plan onayı',
      expected: 'plan doğrulanıp onaya gider, onaylanınca aktifleşir.',
      issue: 'hatalı planın gönderilebilmesi.',
    })
  })

  it('durumdaki iki nokta yalnız ilk yerden böler; bulgu kısmındaki iki nokta bozmaz', () => {
    expect(scenarioParts('Saat: 10:30 girilir. Tutarsızlık: saat: yanlış')).toEqual({
      name: 'Saat',
      expected: '10:30 girilir.',
      issue: 'saat: yanlış',
    })
  })

  it('kalıba uymayan metin bölünmez, tamamı ne olmalıya düşer', () => {
    expect(scenarioParts('Liste toplamı satırlarla tutmalı')).toEqual({
      name: '',
      expected: 'Liste toplamı satırlarla tutmalı',
      issue: '',
    })
    expect(scenarioParts('Liste toplamı tutmalı. Tutarsızlık: toplam farklı')).toEqual({
      name: '',
      expected: 'Liste toplamı tutmalı.',
      issue: 'toplam farklı',
    })
  })
})

describe('senaryo metni', () => {
  it('üç alan planlayıcının kalıbında tek metne döner ve yeniden aynı alanlara bölünür', () => {
    const parts = { name: ' Kalibrasyon ', expected: 'gerekçe eksikken oturum kapanmaz', issue: ' gerekçesiz kapanabilmesi ' }
    const text = scenarioText(parts)
    expect(text).toBe('Kalibrasyon: gerekçe eksikken oturum kapanmaz. Tutarsızlık: gerekçesiz kapanabilmesi')
    expect(scenarioParts(text)).toEqual({
      name: 'Kalibrasyon',
      expected: 'gerekçe eksikken oturum kapanmaz.',
      issue: 'gerekçesiz kapanabilmesi',
    })
  })

  it('noktayla biten beklenene ikinci nokta eklenmez; boş alanlar kalıptan düşer', () => {
    expect(scenarioText({ name: 'A', expected: 'olur.', issue: 'olmaz' })).toBe('A: olur. Tutarsızlık: olmaz')
    expect(scenarioText({ name: '', expected: 'Toplam tutmalı', issue: '' })).toBe('Toplam tutmalı')
    expect(scenarioText({ name: 'A', expected: 'olur', issue: '' })).toBe('A: olur')
  })
})
