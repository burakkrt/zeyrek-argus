import { describe, expect, it } from 'vitest'
import { composeText, stripVoiceNote, Utterance, VOICE_NOTE, withVoiceNote } from './dictation'

const RATE = 16_000
const silence = (ms: number) => new Float32Array((RATE * ms) / 1000)
const speech = (ms: number) =>
  Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE))

describe('canlı yazım', () => {
  it('sessizlikte cümle başlamaz; konuşma başlatır; 700 ms sessizlik cümleyi bitirir', () => {
    const u = new Utterance(RATE)
    expect(u.push(silence(500))).toBe('bekliyor')
    expect(u.push(speech(600))).toBe('suruyor')
    expect(u.push(silence(300))).toBe('suruyor')
    expect(u.push(silence(450))).toBe('bitti')
    // Cümlenin sesi konuşma ve araya giren sessizliktir; baştaki uzun sessizlik girmez.
    expect(u.audio().length).toBeGreaterThanOrEqual((RATE * 600) / 1000)
    // 200 ms baş + 600 ms konuşma + 700 ms duraksama; baştaki 500 ms sessizlik girseydi 1800 ms olurdu.
    expect(u.audio().length).toBeLessThanOrEqual((RATE * 1530) / 1000)
    u.reset()
    expect(u.audio().length).toBe(0)
    expect(u.push(silence(200))).toBe('bekliyor')
  })

  it('durmadan konuşulsa da cümle en çok 10 sn sürer (çeviri kısa kalsın)', () => {
    const u = new Utterance(RATE)
    let state = u.push(speech(9_000))
    expect(state).toBe('suruyor')
    state = u.push(speech(1_200))
    expect(state).toBe('bitti')
  })

  it('metin: başlangıçtaki metin, kesinleşen cümleler ve geçici cümle tek boşlukla birleşir', () => {
    expect(composeText('Dönem akışını test et. ', ['Yönetici atamasına bak.'], 'Silme')).toBe(
      'Dönem akışını test et. Yönetici atamasına bak. Silme',
    )
    expect(composeText('', [], '')).toBe('')
    expect(composeText('', ['Merhaba.'], '')).toBe('Merhaba.')
  })
})

describe('sesle yazılan girdinin notu', () => {
  it('not metnin sonuna bir kez eklenir; yeniden yazımda yinelenmez; çıkarılınca asıl metin kalır', () => {
    const once = withVoiceNote('Dönem akışını test et.')
    expect(once).toBe(`Dönem akışını test et.\n\n${VOICE_NOTE}`)
    expect(withVoiceNote(`${once} Yönetici atamasına bak.`)).toBe(
      `Dönem akışını test et. Yönetici atamasına bak.\n\n${VOICE_NOTE}`,
    )
    expect(stripVoiceNote(once)).toBe('Dönem akışını test et.')
    expect(withVoiceNote('   ')).toBe('')
  })
})
