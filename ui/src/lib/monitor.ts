import type { RunEvent, StepTarget } from '@argus/shared'

/**
 * Monitörün modeli: koşu olaylarından plan ağacı (sayfa › görev), adım zaman çizelgesi ve bulgu işaretleri türetilir.
 * Saf hesap; ekran yalnız gösterir. Yeni veri istemez: adımın "neden"i modelin zaten verdiği açıklamadır, kare ve
 * hedef kutusu sunucunun modelsiz aldığı ölçümdür.
 */

export type FindingEvent = Extract<RunEvent, { type: 'bulgu' }>
export type Status = 'bekliyor' | 'suruyor' | 'bitti'

export interface MonitorStep {
  seq: number
  at: string
  page: string | null
  task: number | null
  tool: string
  reason: string | null
  outcome: string
  shot: string | null
  target: StepTarget | null
}

export interface MonitorTask {
  index: number
  title: string
  status: Status
  /** Görevin ilk adımının sırası (zaman çizelgesinde oraya atlamak için); adımı yoksa null. */
  firstStep: number | null
}

export interface MonitorPage {
  page: string
  status: Status
  tasks: MonitorTask[]
}

export interface MonitorFinding {
  event: FindingEvent
  /** Bulgudan hemen önceki adımın sırası; açılışta (adımsız) bulunduysa -1. */
  step: number
}

export interface MonitorModel {
  pages: MonitorPage[]
  steps: MonitorStep[]
  findings: MonitorFinding[]
}

/** Adım araçlarının ekrandaki adı ve ikonu. */
export const TOOL_LABEL: Record<string, string> = {
  tikla: 'Tıklama',
  uzerine_gel: 'Üzerine gelme',
  yaz: 'Yazma',
  tus: 'Tuş',
  kaydir: 'Kaydırma',
  ekrana_bak: 'Ekrana bakış',
  bastan_ac: 'Baştan açma',
}

export function buildMonitor(events: RunEvent[]): MonitorModel {
  const pages = new Map<string, MonitorPage>()
  const currentTask = new Map<string, number>()
  const steps: MonitorStep[] = []
  const findings: MonitorFinding[] = []
  const pageOf = (name: string) => {
    let page = pages.get(name)
    if (!page) pages.set(name, (page = { page: name, status: 'bekliyor', tasks: [] }))
    return page
  }

  for (const event of events) {
    if (event.type === 'kosu-basladi') event.pages.forEach(pageOf)
    if (!event.page) continue
    const page = pageOf(event.page)
    switch (event.type) {
      case 'sayfa-basladi':
        page.status = 'suruyor'
        break
      case 'sayfa-bitti':
        page.status = 'bitti'
        for (const task of page.tasks) if (task.status === 'suruyor') task.status = 'bitti'
        break
      case 'plan':
        page.tasks = event.tasks.map((t, index) => ({
          index,
          title: t.title,
          status: 'bekliyor',
          firstStep: null,
        }))
        break
      case 'gorev-basladi': {
        const task = page.tasks[event.index]
        if (task) task.status = 'suruyor'
        currentTask.set(event.page, event.index)
        break
      }
      case 'gorev-bitti': {
        const task = page.tasks[event.index]
        if (task) task.status = 'bitti'
        break
      }
      case 'adim': {
        const index = currentTask.get(event.page) ?? null
        const task = index === null ? undefined : page.tasks[index]
        if (task && task.firstStep === null) task.firstStep = steps.length
        steps.push({
          seq: event.seq,
          at: event.at,
          page: event.page,
          task: index,
          tool: event.tool,
          reason: event.reason,
          outcome: event.outcome,
          shot: event.shot,
          target: event.target ?? null,
        })
        break
      }
      case 'bulgu':
        if (event.outcome !== 'bastirildi') findings.push({ event, step: steps.length - 1 })
        break
    }
  }
  return { pages: [...pages.values()], steps, findings }
}

/**
 * Takip hızı: canlı akış hızlıyken her adım en az `minMs` ekranda kalır, gösterilen adım canlının gerisinden sırayla
 * ilerler (kaçırma olmaz). Kayıttan izlerken (takip kapalı) gösterilen adım değişmez.
 */
export function nextPlayhead(
  state: { shown: number; shownAt: number; following: boolean },
  latest: number,
  now: number,
  minMs: number,
): { shown: number; shownAt: number } {
  if (!state.following || state.shown >= latest) return { shown: state.shown, shownAt: state.shownAt }
  if (state.shown < 0 || now - state.shownAt >= minMs) return { shown: state.shown + 1, shownAt: now }
  return { shown: state.shown, shownAt: state.shownAt }
}

/** Zaman çizelgesinde bir adımın konumu (yüzde); tek adımda ortada. */
export const stepPercent = (step: number, total: number) =>
  total <= 1 ? 50 : (Math.max(0, step) / (total - 1)) * 100
