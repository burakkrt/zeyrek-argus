import { describe, expect, it } from 'vitest'
import { cleanTranscript, nextPace } from './whisper.ts'

describe('sesli yazım', () => {
  it('satırlar birleşir; sessizlik ve ses etiketleri atılır; boşluklar sadeleşir', () => {
    expect(
      cleanTranscript(' Dönem oluşturma akışını test et.\n [BLANK_AUDIO]\n  Yönetici   atama kurallarına (müzik) dikkat et. \n'),
    ).toBe('Dönem oluşturma akışını test et. Yönetici atama kurallarına dikkat et.')
    expect(cleanTranscript('[BLANK_AUDIO]\n')).toBe('')
    expect(cleanTranscript('*gürültü* Merhaba')).toBe('Merhaba')
    // Whisper'ın sessizlik ve gürültüde uydurduğu bilinen kapanış cümleleri atılır (konuşmanın parçası değildir).
    expect(cleanTranscript(' İzlediğiniz için teşekkür ederim.')).toBe('')
    expect(cleanTranscript('Dönemi kapat. Altyazı M.K.')).toBe('Dönemi kapat.')
    expect(cleanTranscript('Abone olmayı unutmayın!')).toBe('')
  })
})

describe('sesli yazım hızı', () => {
  it('ilk ölçüm doğrudan; sonrakiler son ölçüme ağırlık veren ortalama; geçici çeviri 0,15 üstünde küçük modelle yapılır', () => {
    const first = nextPace(null, 3_000, 4_000)
    expect(first).toBe(0.75)
    expect(nextPace(first, 400, 4_000)).toBeCloseTo(0.49, 5)
  })
})
