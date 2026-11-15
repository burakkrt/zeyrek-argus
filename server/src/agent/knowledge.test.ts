import { describe, expect, it } from 'vitest'
import { clampKnowledge, KNOWLEDGE_LIMITS, renderKnowledge } from './knowledge.ts'

describe('sayfa bilgisi', () => {
  it('cevap sabit bütçeye oturur: fazla madde ve uzun metin kesilir, bilinmeyen güven düşük olur', () => {
    const k = clampKnowledge({
      amac: '  Eğitimlerin   listesi. ',
      ekranlar: Array.from({ length: 20 }, (_, i) => `Ekran ${i}`),
      beklentiler: [
        { metin: 'Toplam satırla tutmalı', guven: 'yuksek' },
        { metin: 'x'.repeat(500), guven: 'belki' },
        { metin: '', guven: 'orta' },
      ],
      kapsanan: 'bozuk',
      kapsanmayan: ['Arama', 42, ''],
    })
    expect(k.amac).toBe('Eğitimlerin listesi.')
    expect(k.ekranlar).toHaveLength(KNOWLEDGE_LIMITS.ekranlar)
    expect(k.beklentiler).toEqual([
      { metin: 'Toplam satırla tutmalı', guven: 'yuksek' },
      { metin: 'x'.repeat(KNOWLEDGE_LIMITS.madde), guven: 'dusuk' },
    ])
    expect(k.kapsanan).toEqual([])
    expect(k.kapsanmayan).toEqual(['Arama'])
    expect(k.tuhafliklar).toEqual([])
    expect(clampKnowledge(null).amac).toBe('')
  })

  it('dosya ön bilgi ve bölümlerle yazılır; boş bölüm "(yok)" der', () => {
    const md = renderKnowledge(
      clampKnowledge({ amac: 'Liste', beklentiler: [{ metin: 'Toplam tutmalı', guven: 'orta' }] }),
      {
        page: 'egt-liste',
        author: 'burak',
        run: 'KOS-2026-0001',
        at: '2026-11-14T10:00:00.000Z',
        print: { ui: 'u1', api: 'a1', studio: null },
      },
    )
    expect(md).toContain(
      '---\nsayfa: egt-liste\nyazar: burak\nguncelleme: 2026-11-14T10:00:00.000Z\nkosu: KOS-2026-0001\niz_arayuz: u1\niz_veri: a1\niz_studio: \n---',
    )
    expect(md).toContain('## Beklentiler\n- Toplam tutmalı (güven: orta)')
    expect(md).toContain('## Tuhaflıklar\n- (yok)')
  })
})
