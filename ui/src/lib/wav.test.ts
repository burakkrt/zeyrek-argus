import { describe, expect, it } from 'vitest'
import { downsample, encodeWav } from './wav'

describe('sesli yazım kaydı', () => {
  it('örnekleme hızı ortalamayla düşürülür; aynı hızda dokunulmaz', () => {
    expect([...downsample(new Float32Array([0, 1, 0.5, 0.5, 0.5, 0.5, 1, 1, 1]), 48_000, 16_000)]).toEqual([0.5, 0.5, 1])
    const same = new Float32Array([0.1, 0.2])
    expect(downsample(same, 16_000, 16_000)).toBe(same)
  })

  it('16 bit tek kanallı WAV: başlık ve kırpılmış örnekler', () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 16_000))
    const text = (at: number) => String.fromCharCode(...new Uint8Array(view.buffer, at, 4))
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(view.getUint32(4, true)).toBe(36 + 8)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767])
  })
})
