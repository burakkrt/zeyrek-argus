import { describe, expect, it } from 'vitest'
import { startErrors } from './start'

describe('yeni koşu', () => {
  it('girdi de ek de yoksa girdi alanında hata; yükleme sürerken ekler alanında; ikisi birden olabilir', () => {
    expect(startErrors({ brief: '  ', files: 0, uploading: true })).toEqual([
      { id: 'girdi', label: 'İstek', message: 'Ne test edileceğini yaz ya da dosya ekle.' },
      { id: 'ekler', label: 'Ekler', message: 'Dosyalar yükleniyor; bitince koşuyu başlat.' },
    ])
    expect(startErrors({ brief: 'Performans modülünü test et', files: 0, uploading: false })).toEqual([])
    // Ek varsa girdi zorunlu değildir.
    expect(startErrors({ brief: '', files: 1, uploading: false })).toEqual([])
    // Girdinin sınırı yoktur: uzun bir istem yapıştırılabilir.
    expect(startErrors({ brief: 'x'.repeat(50_000), files: 0, uploading: false })).toEqual([])
  })
})
