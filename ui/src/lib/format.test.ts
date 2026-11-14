import { describe, expect, it } from 'vitest'
import { formatCost, formatDuration, formatMoney, formatSeconds } from './format.ts'

describe('biçim', () => {
  it('para Türkçe ondalık virgülle yazılır; bilinmeyen tutar tire olur, sıfır değil', () => {
    expect(formatMoney(1.476)).toBe('$1,48')
    expect(formatMoney(0)).toBe('$0,00')
    expect(formatMoney(null)).toBe('—')
    expect(formatCost({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, requests: 0, costUsd: 0.4 })).toBe(
      '$0,40',
    )
    expect(formatCost(null)).toBe('—')
  })

  it('süre bir dakikanın altında saniye, üstünde dakika ve saniye olarak yazılır', () => {
    expect(formatSeconds(45.4)).toBe('45 sn')
    expect(formatSeconds(199)).toBe('3 dk 19 sn')
    expect(formatSeconds(null)).toBe('—')
    expect(formatDuration('2026-11-14T10:00:00Z', '2026-11-14T10:04:31Z')).toBe('4 dk 31 sn')
    expect(formatDuration(null, null)).toBe('—')
  })
})
