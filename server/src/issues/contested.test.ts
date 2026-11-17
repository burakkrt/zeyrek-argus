import type { IssueHistoryEntry, IssueStatus } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { isContested } from './contested.ts'

const entry = (author: string, to: IssueStatus, at: string): IssueHistoryEntry => ({
  author,
  to,
  from: null,
  note: null,
  at,
})

describe('isContested', () => {
  it('iki kişinin zıt hükmü tartışmalıdır', () => {
    expect(isContested([entry('Ayşe', 'duzeltilecek', '1'), entry('Mehmet', 'bulgu-degil', '2')])).toBe(true)
  })

  it('aynı kişinin fikir değiştirmesi tartışma değildir', () => {
    expect(isContested([entry('Ayşe', 'duzeltilecek', '1'), entry('Ayşe', 'bulgu-degil', '2')])).toBe(false)
  })

  it('karşı tarafın onayı tartışmayı çözer', () => {
    const history = [
      entry('Ayşe', 'duzeltilecek', '1'),
      entry('Mehmet', 'bulgu-degil', '2'),
      entry('Ayşe', 'bulgu-degil', '3'),
    ]
    expect(isContested(history)).toBe(false)
  })

  it('kişinin kendi hükmünü yinelemesi tartışmayı çözmez', () => {
    const history = [
      entry('Ayşe', 'duzeltilecek', '1'),
      entry('Mehmet', 'bulgu-degil', '2'),
      entry('Mehmet', 'bulgu-degil', '3'),
    ]
    expect(isContested(history)).toBe(true)
  })

  it("Argus'un gözlemi ve düzeldi hükmü sayılmaz", () => {
    const history = [
      entry('Ayşe', 'bulgu-degil', '1'),
      entry('Argus', 'acik', '2'),
      entry('Mehmet', 'duzeldi', '3'),
    ]
    expect(isContested(history)).toBe(false)
  })
})
