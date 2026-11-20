import {
  DEFINITION_PAGE,
  type NetworkEntry,
  type PlatformRead,
  type RunCoverage,
  type RunEvent,
  type RunInfo,
  type RunStrategy,
  type StepTarget,
} from '@argus/shared'
import type { IconName } from './icons'
import { plainCall } from './platform-steps'

/**
 * Monitörün modeli ve oynatma hesabı. Koşu olaylarından plan (sayfa › görev), adımlar, bulgular ve okunur akış
 * türetilir; kayıt kareleri ile adımların işlem anı aynı duvar saatindedir (epoch ms), oynatıcı bu saatte ilerler.
 * Saf hesap; ekran yalnız gösterir. Yeni veri istemez: anlatı modelin zaten verdiği "neden"dir, kare ve hedef kutusu
 * sunucunun modelsiz ölçümüdür.
 */

export type FindingEvent = Extract<RunEvent, { type: 'bulgu' }>
/** `yarida`: koşu durdurulunca ya da hatayla kesilince bitmeden kalan vaka (devam ettirilince yeniden "sürüyor" olur). */
export type Status = 'bekliyor' | 'suruyor' | 'bitti' | 'yarida'

export interface MonitorStep {
  seq: number
  /** İşlemin anı (epoch ms); eski koşularda olayın anı. */
  at: number
  page: string | null
  task: number | null
  tool: string
  reason: string | null
  outcome: string
  shot: string | null
  target: StepTarget | null
  dialog: string | null
  /** Platform okumasıysa araç, girdi ve sonucun başı (sahnede gösterilir). */
  platform: PlatformRead | null
}

export interface MonitorTask {
  index: number
  title: string
  status: Status
  /** Görevin başladığı an (zaman çizelgesinde bant ve atlama için); devamda yeniden başladıysa son başlangıç. */
  at: number | null
  /** Görevin bittiği an (oynatırken o andaki durumu bulmak için); bitmediyse null. */
  doneAt: number | null
}

export interface MonitorPage {
  page: string
  status: Status
  tasks: MonitorTask[]
}

export interface MonitorFinding {
  event: FindingEvent
  at: number
  /** Yargıcın gerekçesi (bulgudan hemen önceki "Yargıç:" notu); yoksa null. */
  judge: string | null
}

type NoteTone = 'bilgi' | 'hata' | 'plan' | 'ozet' | 'yonlendirme'

/** Okunur akışın bir satırı; `at` oynatıcının oraya atlayacağı an. */
export type FlowRow =
  | { kind: 'sayfa'; key: string; at: number; page: string; status: Status }
  | { kind: 'gorev'; key: string; at: number; page: string; index: number; title: string; status: Status }
  | { kind: 'adim'; key: string; at: number; step: number }
  | { kind: 'bulgu'; key: string; at: number; finding: number }
  | { kind: 'ag'; key: string; at: number; requests: NetworkEntry[] }
  | { kind: 'not'; key: string; at: number; tone: NoteTone; text: string }

export interface MonitorModel {
  pages: MonitorPage[]
  steps: MonitorStep[]
  findings: MonitorFinding[]
  flow: FlowRow[]
  /** Girdili koşunun test planı (anla adımı) ve kapsam raporu (gözetmen); girdisiz koşuda null. */
  strategy: RunStrategy | null
  coverage: RunCoverage | null
  /** İlk ve son olayın anı (oynatma aralığı; kareler bunu genişletebilir). */
  start: number | null
  end: number | null
  /** Koşunun durduğu anlar (durdurma, hata, bitiş) ve yeniden başladığı anlar (devam): oynatırken o an koşu duruyor mu. */
  halts: Array<{ at: number; status: RunInfo['status'] }>
  starts: number[]
}

/** Adım araçlarının ekrandaki adı. */
export const TOOL_LABEL: Record<string, string> = {
  tikla: 'Tıklama',
  uzerine_gel: 'Üzerine gelme',
  yaz: 'Yazma',
  tus: 'Tuş',
  kaydir: 'Kaydırma',
  ekrana_bak: 'Ekrana bakış',
  bastan_ac: 'Baştan açma',
  platform_oku: 'Platform okuması',
  platform_arac: 'Platform aracı',
}

/** Girdili koşunun kapsam durumu: rozet adı ve tonu. */
export const COVERAGE_STATUS: Record<
  RunCoverage['status'],
  { label: string; tone: 'success' | 'warning' | 'error' }
> = {
  tam: { label: 'Tam', tone: 'success' },
  kismen: { label: 'Kısmen', tone: 'warning' },
  eksik: { label: 'Eksik', tone: 'error' },
}

/** JSON metni okunur biçimde (girintili); JSON değilse ya da kesikse olduğu gibi. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** Akışta sayfanın adı: tanım kalemlerinin satırı "Platform tanımları"dır. */
export const pageLabel = (page: string) => (page === DEFINITION_PAGE ? 'Platform tanımları' : page)

const JUDGE_PREFIX = 'Yargıç: '

export function buildMonitor(events: RunEvent[]): MonitorModel {
  const pages = new Map<string, MonitorPage>()
  const currentTask = new Map<string, number>()
  const steps: MonitorStep[] = []
  const findings: MonitorFinding[] = []
  const flow: FlowRow[] = []
  let judge: string | null = null
  let strategy: RunStrategy | null = null
  let coverage: RunCoverage | null = null
  const halts: MonitorModel['halts'] = []
  const starts: number[] = []
  const pageOf = (name: string) => {
    let page = pages.get(name)
    if (!page) pages.set(name, (page = { page: name, status: 'bekliyor', tasks: [] }))
    return page
  }
  const times = events.map((e) => Date.parse(e.at)).filter(Number.isFinite)

  for (const event of events) {
    const at = Date.parse(event.at)
    const key = String(event.seq)
    const note = (tone: NoteTone, text: string) => flow.push({ kind: 'not', key, at, tone, text })
    if (event.type === 'kosu-basladi') {
      event.pages.forEach(pageOf)
      starts.push(at)
    }
    if (event.type === 'kosu-bitti') {
      halts.push({ at, status: event.status })
      // Durdurulan ya da yarıda kalan koşuda bitmemiş vakalar "yarıda" kalır; devamda yeniden başlar.
      if (event.status !== 'bitti')
        for (const page of pages.values())
          for (const task of page.tasks) if (task.status === 'suruyor') task.status = 'yarida'
      continue
    }
    if (event.type === 'strateji') {
      // Test yöntemlerinden önceki koşuların stratejisinde yöntem listesi yoktur (2026-11-16).
      // Kapsamdan önceki koşuların stratejisinde kapsam yoktur; tam test sayılır (2026-11-16).
      strategy = {
        ...event.strategy,
        guides: event.strategy.guides ?? [],
        scope: event.strategy.scope ?? 'tam',
      }
      note('plan', `Test planı · ${event.strategy.understood}`)
      continue
    }
    if (event.type === 'kapsam') {
      coverage = event.coverage
      continue
    }
    if (event.type === 'bilgi') {
      // Yargıç notu ayrı satır olmaz, ardından gelen bulgunun ayrıntısına girer.
      if (event.message.startsWith(JUDGE_PREFIX)) judge = event.message.slice(JUDGE_PREFIX.length)
      else note('bilgi', event.message)
      continue
    }
    if (event.type === 'hata') {
      note('hata', event.message)
      continue
    }
    if (event.type === 'yonlendirme') {
      note('yonlendirme', event.message)
      continue
    }
    if (!event.page) continue
    const page = pageOf(event.page)
    switch (event.type) {
      case 'sayfa-basladi':
        page.status = 'suruyor'
        flow.push({ kind: 'sayfa', key, at, page: event.page, status: 'suruyor' })
        break
      case 'sayfa-bitti': {
        const outcome = event.interrupted ? 'yarida' : 'bitti'
        page.status = outcome
        for (const task of page.tasks)
          if (task.status === 'suruyor') {
            task.status = outcome
            if (outcome === 'bitti') task.doneAt = at
          }
        break
      }
      case 'plan':
        // Plan yeniden gönderilebilir (sonradan eklenen kalem, koşu sonu temizliği, devam): aynı sıradaki aynı görevin
        // durumu korunur; sırası aynı ama başlığı farklıysa (devamda başka ek kalem) yeni görevdir.
        page.tasks = event.tasks.map((t, index) => {
          const old = page.tasks[index]
          return old && old.title === t.title ? old : { index, title: t.title, status: 'bekliyor', at: null, doneAt: null }
        })
        note('plan', event.summary)
        break
      case 'gorev-basladi': {
        const task = page.tasks[event.index]
        if (task) {
          task.status = 'suruyor'
          task.at = at
          task.doneAt = null
        }
        currentTask.set(event.page, event.index)
        flow.push({
          kind: 'gorev',
          key,
          at,
          page: event.page,
          index: event.index,
          title: event.title,
          status: 'suruyor',
        })
        break
      }
      case 'gorev-bitti': {
        const task = page.tasks[event.index]
        if (task) {
          task.status = event.interrupted ? 'yarida' : 'bitti'
          task.doneAt = event.interrupted ? null : at
        }
        note('ozet', event.summary)
        break
      }
      case 'adim': {
        const index = event.task ?? currentTask.get(event.page) ?? null
        const actAt = event.actAt ?? at
        flow.push({ kind: 'adim', key, at: actAt, step: steps.length })
        steps.push({
          seq: event.seq,
          at: actAt,
          page: event.page,
          task: index,
          tool: event.tool,
          reason: event.reason,
          outcome: event.outcome,
          shot: event.shot,
          target: event.target ?? null,
          dialog: event.dialog ?? null,
          platform: event.platform ?? null,
        })
        break
      }
      case 'ag':
        flow.push({ kind: 'ag', key, at, requests: event.requests })
        break
      case 'bulgu':
        if (event.outcome !== 'bastirildi') {
          flow.push({ kind: 'bulgu', key, at, finding: findings.length })
          findings.push({ event, at, judge })
        }
        judge = null
        break
      case 'sorun-durumu':
        note('bilgi', event.note)
        break
    }
  }
  // Satır durumları akış sonunda güncel plandan okunur (satır eklendiği an "sürüyor"du).
  for (const row of flow) {
    if (row.kind === 'sayfa') row.status = pages.get(row.page)?.status ?? row.status
    if (row.kind === 'gorev') row.status = pages.get(row.page)?.tasks[row.index]?.status ?? row.status
  }
  return {
    pages: [...pages.values()],
    steps,
    findings,
    flow,
    strategy,
    coverage,
    start: times.length ? Math.min(...times) : null,
    end: times.length ? Math.max(...times) : null,
    halts,
    starts,
  }
}

/**
 * Oynatılan anda koşu duruyor mu: o andan önceki son duruş, ondan sonra yeniden başlamadıysa geçerlidir. Sunucu
 * kapanınca duruş olayı yazılmaz; koşu bitmiş ama olayı yoksa (`finalStatus`) son olaydan sonrası duruş sayılır.
 */
export function haltAt(
  model: Pick<MonitorModel, 'halts' | 'starts' | 'end'>,
  at: number,
  finalStatus: RunInfo['status'] | null,
): RunInfo['status'] | null {
  const halt = model.halts.findLast((h) => h.at <= at)
  if (halt && !model.starts.some((s) => s > halt.at && s <= at)) return halt.status
  const lastStart = model.starts.at(-1) ?? null
  const halted = finalStatus === 'durduruldu' || finalStatus === 'hata' || finalStatus === 'bitti'
  if (halted && model.end !== null && at >= model.end && !model.halts.some((h) => lastStart === null || h.at >= lastStart))
    return finalStatus
  return null
}

/**
 * Oynatma saati: duvar saatindeki uzun boşluklar (model düşünürken ekran durgun) `gap` ms'ye sıkıştırılır; kayıt
 * akıcı ilerler, hiçbir an atlanmaz. `toPlay` ve `toWall` birbirinin tersidir.
 */
export interface Clock {
  start: number
  end: number
  duration: number
  toPlay(wall: number): number
  toWall(play: number): number
  /** Kısaltılan beklemelerin oynatma saatindeki yeri (zaman çizelgesinde işaretlenir). */
  gaps: number[]
}

/** Sıralı dizide değeri aşmayan son konum (ilkinden küçükse 0). */
function floorIndex(values: number[], value: number): number {
  let lo = 0
  let hi = values.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (values[mid]! <= value) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function buildClock(anchors: number[], gap = 1_500): Clock {
  const wall = [...new Set(anchors.filter(Number.isFinite))].sort((a, b) => a - b)
  if (!wall.length) wall.push(0)
  const play = [0]
  const gaps: number[] = []
  for (let i = 1; i < wall.length; i += 1) {
    const span = wall[i]! - wall[i - 1]!
    if (span > gap) gaps.push(play[i - 1]! + gap / 2)
    play.push(play[i - 1]! + Math.min(span, gap))
  }
  const last = wall.length - 1
  return {
    gaps,
    start: wall[0]!,
    end: wall[last]!,
    duration: play[last]!,
    toPlay(value) {
      if (value <= wall[0]!) return 0
      if (value >= wall[last]!) return play[last]!
      const i = floorIndex(wall, value)
      return play[i]! + ((value - wall[i]!) / (wall[i + 1]! - wall[i]!)) * (play[i + 1]! - play[i]!)
    },
    toWall(value) {
      if (value <= 0) return wall[0]!
      if (value >= play[last]!) return wall[last]!
      const i = floorIndex(play, value)
      const span = play[i + 1]! - play[i]!
      return wall[i]! + (span ? ((value - play[i]!) / span) * (wall[i + 1]! - wall[i]!) : 0)
    },
  }
}

/** `wall` anında ekranda olan kare: o andan önceki son kare (ilk kareden önce ilk kare); kare yoksa -1. */
export const frameIndexAt = (frames: number[], wall: number): number =>
  frames.length ? floorIndex(frames, wall) : -1

/** İmlecin hedefe gidiş süresi ve işlemden sonra hedefin vurgulu kaldığı süre (ms). */
export const TRAVEL_MS = 650
export const HOLD_MS = 1_100
const CLICK_MS = 700
const IDLE_MS = 3_500

/** Sıralı anlar içinde `wall`'a (öne kaydırılmış) denk gelen son konum; ilkinden önce -1. */
function lastAt(items: Array<{ at: number }>, wall: number, lead = 0): number {
  let index = -1
  for (let i = 0; i < items.length && items[i]!.at - lead <= wall; i += 1) index = i
  return index
}

/** `wall` anında anlatılan adım: imlecin o adımın hedefine yola çıktığı andan itibaren; ilk adımdan önce -1. */
export const stepIndexAt = (steps: Array<{ at: number }>, wall: number) => lastAt(steps, wall, TRAVEL_MS)

export interface PointerMove {
  at: number
  tool: string
  target: StepTarget
}

export interface PointerState {
  /** İmlecin ucu, görünüm alanına oranla. */
  x: number
  y: number
  opacity: number
  /** Tıklama halkasının ilerleyişi (0–1); halka yoksa null. */
  ripple: number | null
  /** Vurgulanan hedef (görünüm alanına kırpılmış); sayfa kapsayıcısı gibi büyük hedeflerde null. */
  box: StepTarget | null
  boxOpacity: number
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Hedefin görünür kısmı; görünür değilse null. */
export function visibleBox(target: StepTarget): StepTarget | null {
  const x = clamp01(target.x)
  const y = clamp01(target.y)
  const width = clamp01(target.x + target.width) - x
  const height = clamp01(target.y + target.height) - y
  return width > 0 && height > 0 ? { x, y, width, height } : null
}

/** Sayfanın büyük kısmını kaplayan hedef (form kapsayıcısı) çerçevelenmez: çerçeve bir şey anlatmaz. */
const isContainer = (box: StepTarget) => box.width * box.height > 0.3

/**
 * `wall` anında imleç: bir önceki hedeften sıradakine yumuşak hızlanıp yavaşlayarak gider, işlem anında varır;
 * tıklamada halka çıkar, hedef kısa süre vurgulu kalır. Uzun süre işlem olmazsa imleç solar.
 */
export function pointerAt(moves: PointerMove[], wall: number): PointerState | null {
  const k = lastAt(moves, wall, TRAVEL_MS)
  if (k < 0) return null
  const move = moves[k]!
  const box = visibleBox(move.target)
  if (!box) return null
  const centerOf = (b: StepTarget) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  const to = centerOf(box)
  const prevBox = k > 0 ? visibleBox(moves[k - 1]!.target) : null
  const from = prevBox ? centerOf(prevBox) : to
  const travel = clamp01((wall - (move.at - TRAVEL_MS)) / TRAVEL_MS)
  const t = ease(travel)
  const since = wall - move.at
  const boxOpacity = isContainer(box)
    ? 0
    : since < 0
      ? clamp01(1 + since / TRAVEL_MS)
      : clamp01(1 - (since - HOLD_MS) / 400)
  const appear = prevBox ? 1 : clamp01(travel * 2.5)
  const idle = since > IDLE_MS ? clamp01(1 - (since - IDLE_MS) / 500) : 1
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    opacity: Math.min(appear, idle),
    ripple: move.tool === 'tikla' && since >= 0 && since <= CLICK_MS ? since / CLICK_MS : null,
    box: boxOpacity > 0 ? box : null,
    boxOpacity,
  }
}

/** Bulgunun senaryosu adımlara bölünür ("1. … 2. …" ya da satırlar); bölünemiyorsa tek adım. */
export function scenarioSteps(scenario: string): string[] {
  const numbered = scenario
    .split(/(?:^|\s)\d+[.)]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (numbered.length > 1) return numbered
  return scenario
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Süre "1:05" biçiminde. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1_000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const ZOOM = 1.6
const ZOOM_IN_MS = 450
const ZOOM_OUT_MS = 550
/** İki işlem arası bundan kısaysa yakınlık bozulmaz, sahne yalnız kayar (gidip gelme baş döndürür). */
const ZOOM_JOIN_MS = 1_800

export interface ZoomState {
  scale: number
  /** Yakınlaşmanın merkezi (görünüm alanına oranla); dönüşümün kökü olduğu için görüntü kenardan taşmaz. */
  x: number
  y: number
}

/**
 * Otomatik yakınlaştırma: işlemden hemen önce sahne imlecin olduğu yere yumuşakça yaklaşır, işlem bitince geri
 * açılır; art arda işlemlerde yakın kalır ve imleçle birlikte kayar. Sayfayı kaplayan hedefte yakınlaşılmaz.
 */
export function zoomAt(moves: PointerMove[], wall: number, pointer: PointerState | null): ZoomState {
  const none = { scale: 1, x: 0.5, y: 0.5 }
  if (!pointer) return none
  const windows: Array<[number, number]> = []
  for (const move of moves) {
    const box = visibleBox(move.target)
    if (!box || isContainer(box)) continue
    const from = move.at - TRAVEL_MS - 200
    const to = move.at + HOLD_MS + 600
    const last = windows[windows.length - 1]
    if (last && from - last[1] < ZOOM_JOIN_MS) last[1] = to
    else windows.push([from, to])
  }
  const active = windows.find(([from, to]) => wall >= from && wall <= to + ZOOM_OUT_MS)
  if (!active) return none
  const [from, to] = active
  const level =
    wall < from + ZOOM_IN_MS
      ? ease((wall - from) / ZOOM_IN_MS)
      : wall > to
        ? 1 - ease((wall - to) / ZOOM_OUT_MS)
        : 1
  return { scale: 1 + (ZOOM - 1) * level, x: pointer.x, y: pointer.y }
}

/** Eylemin türü: ekrana bakış ikiye ayrılır (yalnız sayfa ağacını okudu / ekran görüntüsüyle inceledi). */
export type ActionKind =
  | 'tikla'
  | 'uzerine_gel'
  | 'yaz'
  | 'tus'
  | 'kaydir'
  | 'okudu'
  | 'goruntu'
  | 'bastan_ac'
  | 'platform'
  | 'diger'

export interface Action {
  kind: ActionKind
  /** Geçmiş zaman fiili: "Tıkladı". */
  verb: string
  /** Neye: "“Vazgeç”"; yoksa boş. */
  object: string
}

const quoted = (text: string) => /"([\s\S]*)"/.exec(text)?.[1] ?? null
const label = (value: string) => `“${value}”`

/**
 * Adımın insan diliyle eylemi: sunucunun sonuç metninden ("Tıklandı: \"Vazgeç\"") fiil ve nesne çıkarılır; tarayıcı
 * penceresi notu (" — Tarayıcı penceresi …") atılır, onu ekran ayrıca gösterir.
 */
export function actionOf(step: { tool: string; outcome: string }): Action {
  const outcome = step.outcome.split(' — ')[0]!
  const value = quoted(outcome)
  switch (step.tool) {
    case 'tikla':
      if (outcome.startsWith('Salt okuma'))
        return { kind: 'tikla', verb: 'Basmadı (yazma işi)', object: value ? label(value) : '' }
      return { kind: 'tikla', verb: 'Tıkladı', object: value ? label(value) : 'etiketsiz öğe' }
    case 'uzerine_gel':
      return {
        kind: 'uzerine_gel',
        verb: 'Üzerine geldi',
        object: outcome.startsWith('İpucu: ') ? `ipucu: ${outcome.slice(7)}` : 'ipucu açılmadı',
      }
    case 'yaz':
      return value
        ? { kind: 'yaz', verb: 'Yazdı', object: label(value) }
        : { kind: 'yaz', verb: 'Alanı boşalttı', object: '' }
    case 'tus':
      return { kind: 'tus', verb: 'Tuşa bastı', object: outcome.replace(/^Tuş:\s*/, '') }
    case 'kaydir':
      return { kind: 'kaydir', verb: 'Kaydırdı', object: outcome.startsWith('Yukarı') ? 'yukarı' : 'aşağı' }
    case 'ekrana_bak':
      return outcome.includes('görüntü')
        ? { kind: 'goruntu', verb: 'Görüntüyle inceledi', object: '' }
        : { kind: 'okudu', verb: 'Sayfayı okudu', object: '' }
    case 'bastan_ac':
      return { kind: 'bastan_ac', verb: 'Sayfayı baştan açtı', object: '' }
    // Platform adımı sade dille: teknik araç adı ön planda değil, ayrıntıdadır (`platform-steps.ts`).
    case 'platform_yaz':
    case 'platform_oku':
      return { kind: 'platform', verb: plainCall({ tool: step.tool, outcome }).title, object: '' }
    case 'platform_arac':
      return { kind: 'platform', verb: 'Platform aracını inceledi', object: '' }
    default:
      return { kind: 'diger', verb: TOOL_LABEL[step.tool] ?? step.tool, object: outcome }
  }
}

export interface Lanes {
  pages: Array<{ page: string; start: number; end: number; status: Status }>
  tasks: Array<{ page: string; index: number; title: string; start: number; end: number; status: Status }>
  steps: Array<{ index: number; pos: number; kind: ActionKind; dialog: boolean }>
  findings: Array<{ index: number; pos: number; kind: FindingEvent['kind']; title: string }>
}

/**
 * Zaman çizelgesinin şeritleri, oynatma saatinde (ms): sayfalar, görevler (sonraki göreve ya da sayfanın sonuna
 * kadar), adımlar ve bulgular. `end` kaydın sonu (canlıda "şimdi").
 */
export function buildLanes(model: MonitorModel, clock: Clock, end: number): Lanes {
  const starts = model.flow.flatMap((r) => (r.kind === 'sayfa' ? [{ page: r.page, at: r.at }] : []))
  const pages = starts.map((p, i) => ({
    page: p.page,
    start: clock.toPlay(p.at),
    end: clock.toPlay(starts[i + 1]?.at ?? end),
    status: model.pages.find((m) => m.page === p.page)?.status ?? 'bekliyor',
  }))
  const tasks = model.pages.flatMap((page) => {
    const pageEnd = pages.find((p) => p.page === page.page)?.end ?? clock.toPlay(end)
    const begun = page.tasks.filter((t) => t.at !== null)
    return begun.map((t, i) => ({
      page: page.page,
      index: t.index,
      title: t.title,
      start: clock.toPlay(t.at!),
      end: begun[i + 1] ? clock.toPlay(begun[i + 1]!.at!) : pageEnd,
      status: t.status,
    }))
  })
  return {
    pages,
    tasks,
    steps: model.steps.map((s, index) => ({
      index,
      pos: clock.toPlay(s.at),
      kind: actionOf(s).kind,
      dialog: s.dialog !== null,
    })),
    findings: model.findings.map((f, index) => ({
      index,
      pos: clock.toPlay(f.at),
      kind: f.event.kind,
      title: f.event.title,
    })),
  }
}

/** Bulgu gezgini: `wall` anına kadar görülen son bulgunun sırası (henüz yoksa -1). */
export const findingIndexAt = (findings: Array<{ at: number }>, wall: number) => lastAt(findings, wall)

/** Eylem türlerinin ikonu (çubuk, şerit ve sözlük aynı ikonu kullanır). */
export const ACTION_ICON: Record<ActionKind, IconName> = {
  tikla: 'click',
  uzerine_gel: 'cursor',
  yaz: 'type',
  tus: 'keyboard',
  kaydir: 'scroll',
  okudu: 'subject',
  goruntu: 'visibility',
  bastan_ac: 'refresh',
  platform: 'database',
  diger: 'cursor',
}

export interface LabelSlot {
  /** Satır (0 en üst), sol kenar ve genişlik (yüzde). */
  row: number
  left: number
  width: number
}

/**
 * Bulgu etiketlerinin yerleşimi: başlıklar tam okunsun diye kısaltılmaz, çakışan etiket bir alt satıra iner (en çok
 * `rows` satır). Sağ kenara taşan etiket sola kaydırılır. Satırlar dolarsa etiket en erken boşalan satıra, önündekinin
 * bittiği yerden başlayarak kısaltılmış yerleşir. Girdi yüzde ve konuma göre sıralı.
 */
export function stackLabels(items: Array<{ pos: number; width: number }>, rows = 3, gap = 0.6): LabelSlot[] {
  const ends: number[] = []
  return items.map(({ pos, width }) => {
    const w = Math.min(width, 100)
    const left = Math.max(0, Math.min(pos, 100 - w))
    let row = ends.findIndex((end) => end + gap <= left)
    if (row < 0 && ends.length < rows) row = ends.length
    if (row >= 0) {
      ends[row] = left + w
      return { row, left, width: w }
    }
    row = ends.indexOf(Math.min(...ends))
    const shifted = Math.min(ends[row]! + gap, 100 - 3)
    const right = left + w
    const fitted = Math.max(3, right - shifted)
    ends[row] = shifted + fitted
    return { row, left: shifted, width: fitted }
  })
}

const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].map((s) => s * 1000)

/**
 * Cetvel çentikleri (video düzenleyicilerdeki gibi): etiketli büyük çentik aralığı, etiketler arası en az `minGap` px
 * kalacak en küçük "yuvarlak" süredir (1, 2, 5, 10, 15, 30 sn, 1 dk…); aralarda küçük çentikler. Konumlar ms.
 */
export function rulerTicks(
  duration: number,
  width: number,
  minGap = 64,
): { major: number[]; minor: number[] } {
  if (duration <= 0 || width <= 0) return { major: [0], minor: [] }
  const perPx = duration / width
  const step = RULER_STEPS.find((s) => s / perPx >= minGap) ?? RULER_STEPS[RULER_STEPS.length - 1]!
  const minorStep = step >= 5_000 && step % 5_000 === 0 ? step / 5 : step / 2
  const major: number[] = []
  const minor: number[] = []
  for (let t = 0; t <= duration; t += minorStep) {
    if (Math.round(t) % step === 0) major.push(t)
    else minor.push(t)
  }
  return { major, minor }
}

/**
 * Bulgu türlerinin tek renk tablosu (şerit, akış, sahne, ayrıntı aynı rengi kullanır). Tonlar resmî ve sakindir:
 * doygunluğu düşük kırmızı (kesin), toprak sarısı (tutarsızlık), arduvaz mavisi (not); dolu, parlak zemin yoktur.
 * `chip` açık zeminli etiket, `strong` seçili hâl, `dot` işaret, `icon` akıştaki ikon dairesi, `row` akıştaki
 * satır zemini (yalnız kesin bulgu öne çıkar), `frame` + `tag` sahnedeki bulgu çerçevesi.
 */
export const FINDING_TONE: Record<
  FindingEvent['kind'],
  {
    label: string
    chip: string
    strong: string
    dot: string
    icon: string
    row: string
    frame: string
    tag: string
  }
> = {
  kesin: {
    label: 'Bulgu',
    chip: 'border-[#ecc8c5] bg-[#fbf2f1] text-[#962f2a]',
    strong: 'border-[#d6a39e] bg-[#f4dedb] text-[#842823]',
    dot: 'bg-[#b04a43]',
    icon: 'border-[#ecc8c5] bg-[#fbf2f1] text-[#962f2a]',
    row: 'bg-[#fbf2f1]',
    frame: 'border-[#b04a43] bg-[#b04a43]/[0.06]',
    tag: 'bg-[#962f2a]',
  },
  tutarsizlik: {
    label: 'Tutarsızlık',
    chip: 'border-[#e8d6b2] bg-[#fbf6eb] text-[#855a17]',
    strong: 'border-[#d6ba84] bg-[#f3e7cd] text-[#744e13]',
    dot: 'bg-[#b08433]',
    icon: 'border-[#e8d6b2] bg-[#fbf6eb] text-[#855a17]',
    row: '',
    frame: 'border-[#b08433] bg-[#b08433]/[0.06]',
    tag: 'bg-[#855a17]',
  },
  not: {
    label: 'Şüphe',
    chip: 'border-[#cfdae6] bg-[#f3f6fa] text-[#36567a]',
    strong: 'border-[#abc0d6] bg-[#e2eaf3] text-[#2d4a6a]',
    dot: 'bg-[#5c7ea4]',
    icon: 'border-[#cfdae6] bg-[#f3f6fa] text-[#36567a]',
    row: '',
    frame: 'border-[#5c7ea4] bg-[#5c7ea4]/[0.06]',
    tag: 'bg-[#36567a]',
  },
}
