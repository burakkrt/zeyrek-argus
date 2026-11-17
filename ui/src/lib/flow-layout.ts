/**
 * Platform iş akışının metro yerleşimi. Vakalar zaman sırasıyla yuvalara (yatay şeritlere) yerleşir: ilk vaka ana yuvada
 * (0) yürür; sıralı gelen vakalar da ana yuvada kalır, tek bir hat olarak akar. Aynı anda koşan (paralel) vaka ilk boş
 * yuvayı alır, ana hattaki son duraktan çatallanır, bitince ana hattın sonraki durağına bağlanır; bittiğinde yuvası
 * sonraki vakaya geçer. Böylece paralel vaka sayısı kadar yuva olur, tek karede görünür; vaka sayısı kadar hat birikmez.
 *
 * Yatay konum sütundur: yeni durak en öndeki sütundan geride kalmaz (zaman sırası korunur, kamera yalnız ileri kayar) ama
 * başka yuvadaki durakla aynı sütunu paylaşabilir. Her hattın son durağı bu yüzden önde, kadrajın içinde kalır.
 * Yuvanın yüksekliği içindeki en uzun durağa göredir (`size`), üstünde bulgu payı (`room`) bırakılır. Bulgu, bulunduğu
 * anki durağın üstüne elmas olarak asılır. Saf hesap: bileşen yalnız çizer.
 */

/** Durak kutusunun genişliği ve yuvarlağı; `h` boyutu bilinmeyen durak için üst sınır (10 satırlık okunanlar listesi). */
export const STATION = { w: 212, h: 420, orb: 48 }
/** Sütun aralığı, ilk sütun, yuvalar arası boşluk ve durağın üstündeki bulgu payı. */
export const METRO = { step: 240, x0: 260, gap: 36, room: 64 }

export interface MetroLane<T> {
  key: string
  cards: T[]
  /** Vaka bitti mi (bittiyse ana hatta geri bağlanır, yuvası boşalır). */
  done: boolean
}

export interface MetroFinding {
  key: string
  at: number
}

export type MetroNode<T, F> =
  | { kind: 'start'; key: string; x: number; y: number; lane: 0 }
  | { kind: 'card'; key: string; x: number; y: number; lane: number; card: T }
  | { kind: 'finding'; key: string; x: number; y: number; lane: number; finding: F }

export interface MetroEdge {
  key: string
  path: string
  lane: number
  /** Hedef kartın anahtarı (etkin karta giden hat vurgulanır). */
  to: string
  kind: 'rail' | 'fork' | 'merge' | 'finding'
}

export interface MetroLayout<T, F> {
  nodes: MetroNode<T, F>[]
  edges: MetroEdge[]
  /** Yuvaların üst kenarı ve yüksekliği (yukarıdan aşağı). */
  slots: Array<{ y: number; h: number }>
  /** Vakanın (hattın) yuvası; durağı olmayan vaka -1. */
  laneSlot: number[]
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

/** Durağın yuvarlağının merkezi (kutunun üst ortası). */
export const orbCenter = (node: { x: number; y: number }) => ({
  x: node.x + STATION.w / 2,
  y: node.y + STATION.orb / 2,
})

/** İki durak arası hat: aynı hatta düz çizgi, hat değişiminde yatay teğetli yumuşak S. */
export function railPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  if (Math.abs(a.y - b.y) < 1) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  const mid = (a.x + b.x) / 2
  return `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`
}

type Placed<T> = { col: number; slot: number; lane: number; card: T }

export function layoutMetro<T extends { key: number | string; at: number }, F extends MetroFinding>(
  lanes: MetroLane<T>[],
  findings: F[] = [],
  size: (card: T) => number = () => STATION.h,
): MetroLayout<T, F> {
  const ordered = lanes
    .flatMap((lane, index) => lane.cards.map((card) => ({ card, lane: index })))
    .sort((a, b) => a.card.at - b.card.at)

  // Yuva ve sütun: tek geçişte, zaman sırasıyla.
  const laneSlot = lanes.map(() => -1)
  const left = lanes.map((lane) => lane.cards.length)
  const lastCol = lanes.map(() => -1)
  const owner: number[] = []
  const slotLast: number[] = []
  const placed: Placed<T>[] = []
  let head = 0
  const trunkBefore = (col: number) => placed.findLast((p) => p.slot === 0 && p.col < col) ?? null
  for (const { card, lane } of ordered) {
    if (laneSlot[lane] === -1) {
      const free = owner.findIndex((o) => left[o] === 0 && lanes[o]!.done)
      const slot = free === -1 ? owner.length : free
      owner[slot] = lane
      laneSlot[lane] = slot
    }
    const slot = laneSlot[lane]!
    const fork = slot > 0 && lastCol[lane] === -1 ? trunkBefore(Infinity) : null
    const col = Math.max(
      placed.length ? head : 0,
      lastCol[lane]! + 1,
      (slotLast[slot] ?? -1) + 1,
      fork ? fork.col + 1 : 0,
    )
    placed.push({ col, slot, lane, card })
    lastCol[lane] = col
    slotLast[slot] = col
    left[lane]! -= 1
    head = Math.max(head, col)
  }

  const slots: Array<{ y: number; h: number }> = []
  for (let s = 0; s < owner.length; s += 1) {
    const h = Math.max(0, ...placed.filter((p) => p.slot === s).map((p) => size(p.card)))
    const prev = slots[s - 1]
    slots.push({ y: prev ? prev.y + prev.h + METRO.gap + METRO.room : 0, h })
  }

  const xOf = (col: number) => METRO.x0 + col * METRO.step - STATION.w / 2
  const at = new Map<string, Placed<T> & { x: number; y: number }>()
  const start = { kind: 'start' as const, key: 'start', x: -STATION.w / 2, y: 0, lane: 0 as const }
  const nodes: MetroNode<T, F>[] = [start]
  for (const p of placed) {
    const node = { ...p, x: xOf(p.col), y: slots[p.slot]!.y }
    at.set(String(p.card.key), node)
    nodes.push({ kind: 'card', key: String(p.card.key), x: node.x, y: node.y, lane: p.lane, card: p.card })
  }

  const edges: MetroEdge[] = []
  const keyOf = (card: T) => String(card.key)
  const trunk = [...at.values()].filter((n) => n.slot === 0)
  lanes.forEach((lane, index) => {
    const stops = lane.cards.map((card) => at.get(keyOf(card))!)
    if (!stops.length) return
    const first = stops[0]!
    const main = first.slot === 0
    const from = trunk.findLast((n) => n.col < first.col && (main || n.lane !== index)) ?? null
    edges.push({
      key: `${from ? keyOf(from.card) : 'start'}>${keyOf(first.card)}`,
      path: railPath(orbCenter(from ?? start), orbCenter(first)),
      lane: index,
      to: keyOf(first.card),
      kind: main ? 'rail' : 'fork',
    })
    for (let i = 1; i < stops.length; i += 1)
      edges.push({
        key: `${keyOf(stops[i - 1]!.card)}>${keyOf(stops[i]!.card)}`,
        path: railPath(orbCenter(stops[i - 1]!), orbCenter(stops[i]!)),
        lane: index,
        to: keyOf(stops[i]!.card),
        kind: 'rail',
      })
    const last = stops.at(-1)!
    const join = !main && lane.done ? trunk.find((n) => n.col > last.col) : undefined
    if (join)
      edges.push({
        key: `${keyOf(last.card)}>>${keyOf(join.card)}`,
        path: railPath(orbCenter(last), orbCenter(join)),
        lane: index,
        to: keyOf(join.card),
        kind: 'merge',
      })
  })

  for (const finding of findings) {
    const host = ordered.filter((o) => o.card.at <= finding.at).at(-1)
    if (!host) continue
    const stop = at.get(keyOf(host.card))!
    // Bulgu durağın üstündeki payda durur: yuvalar arası boşluk ona ayrılmıştır, alttaki ya da üstteki hatta binmez.
    const node = {
      kind: 'finding' as const,
      key: finding.key,
      x: stop.x,
      y: stop.y - METRO.room,
      lane: stop.lane,
      finding,
    }
    nodes.push(node)
    const a = orbCenter(stop)
    edges.push({
      key: `${keyOf(stop.card)}!${finding.key}`,
      path: `M ${a.x} ${node.y + 32} L ${a.x} ${a.y - STATION.orb / 2 - 4}`,
      lane: stop.lane,
      to: finding.key,
      kind: 'finding',
    })
  }

  const xs = nodes.map((n) => n.x)
  const bottom = slots.at(-1)
  return {
    nodes,
    edges,
    slots,
    laneSlot,
    bounds: {
      x0: Math.min(...xs),
      y0: -METRO.room,
      x1: Math.max(...xs) + STATION.w,
      y1: bottom ? bottom.y + Math.max(bottom.h, STATION.orb) : STATION.orb,
    },
  }
}
