import { describe, expect, it } from 'vitest'
import { errorOf, groupErrors, validateFields } from './validation'

describe('form doğrulaması', () => {
  it('zorunlu, en az ve en çok kuralları sırayla; alan başına ilk hata; boşluk boş sayılır', () => {
    const errors = validateFields([
      { id: 'girdi', label: 'Girdi', value: '   ', required: true },
      { id: 'ad', label: 'Ad', value: 'ab', min: 3 },
      { id: 'not', label: 'Not', value: 'x'.repeat(11), max: 10 },
      { id: 'tamam', label: 'Tamam', value: 'dolu', required: true, max: 10 },
    ])
    expect(errors).toEqual([
      { id: 'girdi', label: 'Girdi', message: 'Bu alan zorunludur.' },
      { id: 'ad', label: 'Ad', message: 'En az 3 karakter olmalı.' },
      { id: 'not', label: 'Not', message: 'En çok 10 karakter olabilir.' },
    ])
  })

  it('özel ileti ve özel denetim; özel denetim yalnız diğer kurallar geçince çalışır', () => {
    const errors = validateFields([
      { id: 'girdi', label: 'Girdi', value: '', required: 'Ne test edileceğini yaz ya da dosya ekle.' },
      { id: 'ekler', label: 'Ekler', value: '', check: () => 'Dosyalar yükleniyor; bitince yeniden başlat.' },
      { id: 'kod', label: 'Kod', value: '', required: true, check: () => 'görünmemeli' },
      { id: 'temiz', label: 'Temiz', value: 'a', check: () => null },
    ])
    expect(errors.map((e) => e.message)).toEqual([
      'Ne test edileceğini yaz ya da dosya ekle.',
      'Dosyalar yükleniyor; bitince yeniden başlat.',
      'Bu alan zorunludur.',
    ])
    expect(errorOf(errors, 'ekler')).toBe('Dosyalar yükleniyor; bitince yeniden başlat.')
    expect(errorOf(errors, 'temiz')).toBeNull()
  })

  it('aynı alanın hataları alan adı altında toplanır; alansız hatalar hiç toplanmaz', () => {
    expect(
      groupErrors([
        { id: 'a', label: 'A', message: '1' },
        { id: '', label: '', message: 'genel 1' },
        { id: 'a', label: 'A', message: '2' },
        { id: '', label: '', message: 'genel 2' },
      ]),
    ).toEqual([
      { id: 'a', label: 'A', message: '1', more: [{ id: 'a', label: 'A', message: '2' }] },
      { id: '', label: '', message: 'genel 1', more: [] },
      { id: '', label: '', message: 'genel 2', more: [] },
    ])
  })
})
