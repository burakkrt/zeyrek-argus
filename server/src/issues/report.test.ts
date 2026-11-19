import { describe, expect, it } from 'vitest'
import { findingReport } from './report.ts'

describe('bulgu raporu', () => {
  it('modelin doldurduğu alanlar rapora girer; kabul ölçütlerinin boşları atılır, metinler kırpılır', () => {
    expect(
      findingReport(
        {
          aciklama: ' İki kişi birbirinin yöneticisi oluyor. ',
          sonuc: 'Onaylar güvenilmez olur.',
          nerede: 'Dönem detayı › Katılımcılar › "Yönetici ata"',
          kok_neden: 'Atama adımı zinciri denetlemiyor.',
          duzeltme: 'Zinciri özyinelemeli sorguyla denetle.',
          kabul: ['Döngü reddedilir.', '  ', 'Döngüsüz atama çalışır.'],
        },
        'Çalıştırılarak doğrulandı',
      ),
    ).toEqual({
      summary: 'İki kişi birbirinin yöneticisi oluyor.',
      impact: 'Onaylar güvenilmez olur.',
      location: 'Dönem detayı › Katılımcılar › "Yönetici ata"',
      proof: 'Çalıştırılarak doğrulandı',
      rootCause: 'Atama adımı zinciri denetlemiyor.',
      fix: 'Zinciri özyinelemeli sorguyla denetle.',
      acceptance: ['Döngü reddedilir.', 'Döngüsüz atama çalışır.'],
    })
  })

  it('hiçbir alan dolu değilse rapor yoktur (eski biçimde bildiren model, eksik girdi)', () => {
    expect(findingReport({ baslik: 'x', kabul: 'tek metin' }, '')).toBeNull()
    expect(findingReport(null, 'Ekranda görüldü')).toEqual({
      summary: '',
      impact: '',
      location: '',
      proof: 'Ekranda görüldü',
      rootCause: '',
      fix: '',
      acceptance: [],
    })
  })
})
