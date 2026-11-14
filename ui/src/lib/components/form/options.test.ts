import { describe, expect, it } from 'vitest'
import { summarizeSelection, turkishFilter } from './options.ts'

describe('seçim süzgeci', () => {
  it('Türkçe büyük/küçük harfi doğru eşler: İ/i ve I/ı ayrı harflerdir', () => {
    expect(turkishFilter('İSTANBUL ŞUBESİ', 'istanbul')).toBe(1)
    expect(turkishFilter('Işık ölçümü', 'ışık')).toBe(1)
    expect(turkishFilter('Işık ölçümü', 'isik')).toBe(0)
    expect(turkishFilter('Performans dönemleri', 'DÖNEM')).toBe(1)
  })

  it('aranan her sözcük geçmeli; sıra önemsiz, anahtar sözcükler de aranır', () => {
    expect(turkishFilter('performans karne', 'karne perf')).toBe(1)
    expect(turkishFilter('performans karne', 'karne dönem')).toBe(0)
    expect(turkishFilter('Karne', 'performans-karne', ['performans-karne'])).toBe(1)
    expect(turkishFilter('Karne', '  ')).toBe(1)
  })

  it('çoklu seçimin özeti: boşta yer tutucu, ikiye kadar adlar, fazlasında sayı', () => {
    const options = [
      { value: 'a', label: 'Dönemler' },
      { value: 'b', label: 'Karne' },
      { value: 'c', label: 'Çalışma alanım' },
    ]
    expect(summarizeSelection(options, [], 'Sayfa seçin')).toBe('Sayfa seçin')
    expect(summarizeSelection(options, ['a', 'b'], '')).toBe('Dönemler, Karne')
    expect(summarizeSelection(options, ['a', 'b', 'c'], '')).toBe('3 seçili')
    expect(summarizeSelection(options, ['z'], '')).toBe('z')
  })
})
