import { describe, expect, it } from 'vitest'
import { formatBytes, formatCost, formatDuration, formatMoney, formatSeconds } from './format.ts'

describe('biçim', () => {
  it('bayt okunur birimle, Türkçe ondalıkla yazılır', () => {
    expect(formatBytes(950)).toBe('950 B')
    expect(formatBytes(1.25 * 1024 * 1024)).toBe('1,3 MB')
    expect(formatBytes(12.4 * 1024 ** 3)).toBe('12 GB')
    expect(formatBytes(0)).toBe('0 B')
  })

  it('para Türkçe ondalık virgülle yazılır; bilinmeyen tutar tire olur, sıfır değil', () => {
    expect(formatMoney(1.476)).toBe('$1,48')
    expect(formatMoney(0)).toBe('$0,00')
    expect(formatMoney(null)).toBe('—')
    expect(formatCost({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, requests: 0, costUsd: 0.4 })).toBe(
      '$0,40',
    )
    expect(formatCost(null)).toBe('—')
    expect(
      formatCost({
        input: 9,
        cacheWrite: 0,
        cacheRead: 0,
        output: 1,
        requests: 1,
        costUsd: 0,
        provider: 'abonelik',
      }),
    ).toBe('Abonelik')
  })

  it('süre bir dakikanın altında saniye, üstünde dakika ve saniye olarak yazılır', () => {
    expect(formatSeconds(45.4)).toBe('45 sn')
    expect(formatSeconds(199)).toBe('3 dk 19 sn')
    expect(formatSeconds(null)).toBe('—')
    expect(formatDuration('2026-11-14T10:00:00Z', '2026-11-14T10:04:31Z')).toBe('4 dk 31 sn')
    expect(formatDuration(null, null)).toBe('—')
  })
})

describe('koşunun maliyeti', () => {
  const base = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, requests: 1 }
  const plan = (percent: number, weekAtStart: number | null) => ({
    ...base,
    costUsd: 0,
    provider: 'abonelik' as const,
    plan: { week: { percent, resetsAt: null }, fiveHour: null, at: '2026-11-20T12:00:00Z', weekAtStart },
  })
  it('API anahtarında dolar; abonelikte koşunun haftalık limitten tükettiği; veri yoksa Abonelik', () => {
    expect(formatCost({ ...base, costUsd: 1.5, provider: 'api' })).toBe(formatMoney(1.5))
    expect(formatCost(plan(87.4, 84))).toBe('Haftalık limitten %3')
    expect(formatCost(plan(87, null))).toBe('Abonelik')
    expect(formatCost({ ...base, costUsd: 0, provider: 'abonelik' })).toBe('Abonelik')
  })
})
