import type { FindingKind, Issue, RunInfo } from '@argus/shared'

/** Genel bakış ekranının özeti: göstergeler, türe göre açık bulgu, günlük seri. Saf hesap; ekran yalnız gösterir. */
export interface Overview {
  openIssues: number
  newThisWeek: number
  awaitingDecision: number
  runs: number
  pages: number
  costPerPage: number | null
  secondsPerPage: number | null
  totalCost: number
  byKind: Record<FindingKind, number>
  daily: Array<{ day: string; label: string; newIssues: number; cost: number }>
}

const DAY = 86_400_000
const OPEN = new Set(['acik', 'duzeltilecek'])
const FINISHED = new Set(['bitti', 'durduruldu', 'hata'])

/** Yerel takvim günü (YYYY-AA-GG): seri günlere bölünürken saat dilimi kaymasın. */
const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function overview(runs: RunInfo[], issues: Issue[], now = new Date(), days = 14): Overview {
  const since = now.getTime() - days * DAY
  const weekAgo = now.getTime() - 7 * DAY
  const open = issues.filter((i) => OPEN.has(i.status))
  const recent = runs.filter((r) => new Date(r.createdAt).getTime() >= since)
  const finished = recent.filter((r) => FINISHED.has(r.status))
  const pages = finished.reduce((n, r) => n + r.pages.length, 0)
  const priced = finished.filter((r) => r.usage.costUsd !== null)
  const pricedPages = priced.reduce((n, r) => n + r.pages.length, 0)
  const totalCost = priced.reduce((n, r) => n + (r.usage.costUsd ?? 0), 0)
  const timed = finished.filter((r) => r.status === 'bitti' && r.startedAt && r.finishedAt)
  const timedPages = timed.reduce((n, r) => n + r.pages.length, 0)
  const seconds = timed.reduce(
    (n, r) => n + (new Date(r.finishedAt!).getTime() - new Date(r.startedAt!).getTime()) / 1000,
    0,
  )

  const daily: Overview['daily'] = []
  const index = new Map<string, Overview['daily'][number]>()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now.getTime() - i * DAY)
    const point = {
      day: dayKey(date),
      label: date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
      newIssues: 0,
      cost: 0,
    }
    daily.push(point)
    index.set(point.day, point)
  }
  for (const issue of issues) {
    const point = index.get(dayKey(new Date(issue.firstSeen)))
    if (point) point.newIssues += 1
  }
  for (const run of recent) {
    const point = index.get(dayKey(new Date(run.createdAt)))
    if (point) point.cost = Math.round((point.cost + (run.usage.costUsd ?? 0)) * 100) / 100
  }

  const byKind: Record<FindingKind, number> = { kesin: 0, tutarsizlik: 0, not: 0 }
  for (const issue of open) byKind[issue.kind] += 1

  return {
    openIssues: open.length,
    newThisWeek: open.filter((i) => new Date(i.firstSeen).getTime() >= weekAgo).length,
    awaitingDecision: issues.filter((i) => i.status === 'acik').length,
    runs: recent.length,
    pages,
    costPerPage: pricedPages ? totalCost / pricedPages : null,
    secondsPerPage: timedPages ? seconds / timedPages : null,
    totalCost: Math.round(totalCost * 100) / 100,
    byKind,
    daily,
  }
}
