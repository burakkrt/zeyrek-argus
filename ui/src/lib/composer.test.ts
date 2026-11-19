import { describe, expect, it } from 'vitest'
import { segments } from './composer'
import { VOICE_NOTE } from './dictation'

describe('girdi alanının görünümü', () => {
  it('bağlantılar ayrı parça; sondaki noktalama bağlantıya katılmaz', () => {
    expect(segments('Şu sayfaya bak: https://app.zeyrek.test/qm/web/performans-donemler. Sonra raporla.', '')).toEqual([
      { text: 'Şu sayfaya bak: ', kind: 'metin' },
      { text: 'https://app.zeyrek.test/qm/web/performans-donemler', kind: 'baglanti' },
      { text: '. Sonra raporla.', kind: 'metin' },
    ])
  })

  it('konuşmanın geçici kısmı (notun hemen önünde) ayrı parça; not da ayrı', () => {
    const text = `Dönem akışını test et. Yönetici atamasına\n\n${VOICE_NOTE}`
    expect(segments(text, 'Yönetici atamasına')).toEqual([
      { text: 'Dönem akışını test et. ', kind: 'metin' },
      { text: 'Yönetici atamasına', kind: 'gecici' },
      { text: '\n\n', kind: 'metin' },
      { text: VOICE_NOTE, kind: 'not' },
    ])
  })

  it('geçici kısım metnin sonunda değilse (kullanıcı değiştirdiyse) işaretlenmez; boş metin boş', () => {
    expect(segments('Başka bir metin', 'Yönetici')).toEqual([{ text: 'Başka bir metin', kind: 'metin' }])
    expect(segments('', '')).toEqual([])
  })
})
