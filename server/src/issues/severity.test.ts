import { describe, expect, it } from 'vitest'
import { severityOf } from './severity.ts'

describe('önem', () => {
  it('S1-S4 olduğu gibi kalır; boş ya da tanınmayan değer orta (S3) olur', () => {
    expect(severityOf('S1')).toBe('S1')
    expect(severityOf('S4')).toBe('S4')
    expect(severityOf('')).toBe('S3')
    expect(severityOf('kritik')).toBe('S3')
    expect(severityOf(undefined)).toBe('S3')
  })
})
