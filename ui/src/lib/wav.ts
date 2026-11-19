/**
 * Sesli yazım kaydının biçimi: tarayıcının kaydettiği ses (genelde 48 kHz) Whisper'ın beklediği 16 kHz tek kanallı
 * 16 bit WAV'a çevrilir; sunucu bunu doğrudan yerel modele verir (dönüştürücü gerekmez).
 */
export const SPEECH_RATE = 16_000

/** Örnekleme hızını düşürür: her hedef örnek, kaynakta karşılık gelen aralığın ortalamasıdır (basit kenar yumuşatma). */
export function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const output = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < output.length; i += 1) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j += 1) sum += input[j]!
    output[i] = sum / Math.max(1, end - start)
  }
  return output
}

/** 16 bit PCM, tek kanal WAV; örnekler [-1, 1] aralığına kırpılır. */
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string) => [...value].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, i) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + i * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true)
  })
  return view.buffer
}
