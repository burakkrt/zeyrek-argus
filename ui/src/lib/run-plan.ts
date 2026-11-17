import type { MonitorModel, Status } from './monitor'

/**
 * İzleme ekranının sağ panelindeki anlatının verisi: koşunun vakaları (sayfa başına görevler) sırasıyla, beklenen
 * sonuçları, durumları ve içlerinde çıkan bulgular.
 */

export interface PlanRow {
  key: string
  page: string
  index: number
  title: string
  /** Stratejideki kalemin beklenen sonucu ("Beklenen: …" kısmı); yoksa boş. */
  expected: string
  status: Status
  /** Vakanın başladığı an (atlamak için); başlamadıysa null. */
  at: number | null
  /** Vakada çıkan bulguların `model.findings` içindeki sırası. */
  findings: number[]
}

const expectedOf = (goal: string) => /\nBeklenen: ([\s\S]*?)(?:\nDayanak: |$)/.exec(goal)?.[1]?.trim() ?? ''

/**
 * Bulgu, kaydedildiği andan önceki son adımın vakasına aittir (paralel vakalarda zaman aralığı yanıltır; adım hangi
 * vakada olduğunu bilir). Önünde adım yoksa sayfanın ilk vakasına düşer.
 */
export function planRows(model: Pick<MonitorModel, 'pages' | 'steps' | 'findings' | 'strategy'>): PlanRow[] {
  const goals = new Map((model.strategy?.items ?? []).map((item) => [item.title, item.goal]))
  const rows: PlanRow[] = model.pages.flatMap((page) =>
    page.tasks.map((task) => ({
      key: `${page.page}#${task.index}`,
      page: page.page,
      index: task.index,
      title: task.title,
      expected: expectedOf(goals.get(task.title) ?? ''),
      status: task.status,
      at: task.at,
      findings: [],
    })),
  )
  model.findings.forEach((finding, i) => {
    const page = finding.event.page
    const step = model.steps.filter((s) => s.page === page && s.at <= finding.at && s.task !== null).at(-1)
    const row = rows.find((r) => r.page === page && r.index === (step?.task ?? 0))
    row?.findings.push(i)
  })
  return rows
}
