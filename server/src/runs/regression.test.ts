import { describe, expect, it } from 'vitest'
import {
  caseSteps,
  CASE_LIMITS,
  closesItself,
  FIXED_MARK,
  gateBrief,
  gateVerdict,
  replayItems,
} from './regression.ts'

describe('kayıtlı vakalar', () => {
  it('adımlar son CASE_LIMITS.steps çağrıya ve girdi uzunluğuna kısaltılır', () => {
    const calls = Array.from({ length: 30 }, (_, i) => ({
      tool: `t${i}`,
      input: 'x'.repeat(2000),
      write: i % 2 === 0,
    }))
    const steps = caseSteps(calls)
    expect(steps).toHaveLength(CASE_LIMITS.steps)
    expect(steps[0]!.tool).toBe('t5')
    expect(steps[0]!.input).toHaveLength(CASE_LIMITS.input)
  })

  it('vaka bağımsız tanım kalemine döner; anahtarı ve düzeldi işareti talimattadır', () => {
    const [item] = replayItems([
      {
        key: 'yz:a',
        title: 'A',
        scenario: 's',
        expected: 'e',
        observed: 'o',
        steps: [{ tool: 'row_create', input: '{"x":1}', write: true }],
      },
    ])
    expect(item).toMatchObject({ source: 'tanim', page: null, independent: true, caseKey: 'yz:a' })
    expect(item!.goal).toContain('1. platform_yaz row_create {"x":1}')
    expect(item!.goal).toContain('anahtar="yz:a"')
    expect(item!.goal).toContain(`${FIXED_MARK}:`)
  })
})

describe('yayın kapısı', () => {
  it('istek ortam farkını ve ek isteği taşır', () => {
    const brief = gateBrief('development', 'page: dif-talep changed', 'onaya odaklan')
    expect(brief).toContain('development → production')
    expect(brief).toContain('page: dif-talep changed')
    expect(brief).toContain('onaya odaklan')
  })

  it('kanıtlı S1/S2 bulgu kapıyı kapatır; şüphe ve düşük önem kapatmaz', () => {
    expect(
      gateVerdict([
        { severity: 'S1', kind: 'not', title: 'şüphe' },
        { severity: 'S3', kind: 'kesin', title: 'b' },
      ]).open,
    ).toBe(true)
    const closed = gateVerdict([{ severity: 'S2', kind: 'kesin', title: 'Onay atlanıyor' }])
    expect(closed.open).toBe(false)
    expect(closed.message).toContain('Onay atlanıyor')
  })
})

describe('düzeldi kararı', () => {
  it('S1/S2 sorun yeniden doğrulamada görülmese de kendiliğinden kapanmaz', () => {
    expect(['S1', 'S2', 'S3', 'S4'].map(closesItself)).toEqual([false, false, true, true])
  })
})
