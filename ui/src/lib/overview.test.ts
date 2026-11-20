import type { Issue, RunInfo } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { overview } from './overview.ts'

const now = new Date('2026-11-14T12:00:00')
const ago = (days: number, hours = 0) =>
  new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000).toISOString()

const run = (over: Partial<RunInfo>): RunInfo => ({
  id: 'r',
  code: 'KOS-2026-0001',
  project: 'qm',
  application: 'web',
  environment: 'development',
  pages: ['a'],
  options: { maxTasks: 5, maxSteps: 10 },
  status: 'bitti',
  error: null,
  usage: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, requests: 1, costUsd: 1 },
  createdAt: ago(1),
  startedAt: ago(1),
  finishedAt: ago(1, -1 / 12),
  counts: { new: 0, repeated: 0, suppressed: 0 },
  coverage: null,
  review: { pending: 0, accepted: 0, kept: 0, rejected: 0, unclear: 0 },
  closedAt: null,
  closedBy: null,
  planState: null,
  planRequest: null,
  continuations: [],
  ...over,
})

const issue = (over: Partial<Issue>): Issue => ({
  id: 'i',
  project: 'qm',
  application: 'web',
  key: 'yz:x',
  title: 'x',
  kind: 'tutarsizlik',
  severity: 'S3',
  contested: false,
  status: 'acik',
  source: 'yz',
  firstSeen: ago(1),
  lastSeen: ago(1),
  seenCount: 1,
  pages: ['a'],
  lastShot: null,
  unclear: false,
  fix: null,
  fixEdited: false,
  reason: null,
  ...over,
})

describe('genel bakış özeti', () => {
  it('açık bulguyu, karar bekleyeni ve bu haftanın yenisini ayrı sayar; kapananı saymaz', () => {
    const result = overview(
      [],
      [
        issue({ status: 'acik', kind: 'kesin', firstSeen: ago(2) }),
        issue({ status: 'duzeltilecek', kind: 'not', firstSeen: ago(10) }),
        issue({ status: 'bulgu-degil', firstSeen: ago(1) }),
        issue({ status: 'duzeldi', firstSeen: ago(1) }),
      ],
      now,
    )
    expect(result).toMatchObject({ openIssues: 2, awaitingDecision: 1, newThisWeek: 1 })
    expect(result.byKind).toEqual({ kesin: 1, tutarsizlik: 0, not: 1 })
  })

  it('sayfa başı maliyet ve süre biten koşulardan, sayfa sayısına bölünerek hesaplanır; pencere dışı koşu sayılmaz', () => {
    const result = overview(
      [
        run({
          pages: ['a', 'b'],
          usage: { ...run({}).usage, costUsd: 3 },
          startedAt: ago(1),
          finishedAt: ago(1, -0.1),
        }),
        run({ status: 'calisiyor', pages: ['c'], usage: { ...run({}).usage, costUsd: 9 } }),
        run({ pages: ['d'], usage: { ...run({}).usage, costUsd: null }, status: 'hata' }),
        run({ createdAt: ago(30), usage: { ...run({}).usage, costUsd: 50 } }),
      ],
      [],
      now,
    )
    expect(result.runs).toBe(3)
    expect(result.pages).toBe(3)
    expect(result.costPerPage).toBe(1.5)
    expect(result.secondsPerPage).toBeCloseTo(180, 0)
    expect(result.totalCost).toBe(3)
  })

  it('günlük seri son 14 günü bugünle bitirir; bulgu ilk görüldüğü güne, maliyet koşunun açıldığı güne yazılır', () => {
    const result = overview(
      [run({ createdAt: ago(0), usage: { ...run({}).usage, costUsd: 1.25 } })],
      [
        issue({ firstSeen: ago(0) }),
        issue({ firstSeen: ago(0) }),
        issue({ firstSeen: ago(13) }),
        issue({ firstSeen: ago(20) }),
      ],
      now,
    )
    expect(result.daily).toHaveLength(14)
    expect(result.daily.at(-1)).toMatchObject({ newIssues: 2, cost: 1.25 })
    expect(result.daily[0]).toMatchObject({ newIssues: 1 })
    expect(result.daily.reduce((n, d) => n + d.newIssues, 0)).toBe(3)
  })

  it('veri yoksa maliyet ve süre bilinmiyor döner, sıfır değil', () => {
    expect(overview([], [], now)).toMatchObject({
      costPerPage: null,
      secondsPerPage: null,
      runs: 0,
      openIssues: 0,
    })
  })
})
