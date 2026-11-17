import { describe, expect, it } from 'vitest'
import { layoutMetro, METRO, railPath, STATION } from './flow-layout'

const card = (key: number, at: number) => ({ key, at })
const col = (x: number) => (x - METRO.x0 + STATION.w / 2) / METRO.step

describe('layoutMetro', () => {
  it('paralel vakalar sütun paylaşır: her hattın son durağı en öndeki sütunun yanında kalır, ekran dışına kaymaz', () => {
    const { nodes, laneSlot } = layoutMetro([
      { key: 'a', cards: [card(1, 0), card(4, 30)], done: false },
      { key: 'b', cards: [card(2, 10), card(5, 40)], done: false },
      { key: 'c', cards: [card(3, 20)], done: false },
    ])
    const at = (key: string) => nodes.find((n) => n.key === key)!
    expect(['1', '2', '3', '4', '5'].map((k) => col(at(k).x))).toEqual([0, 1, 1, 1, 2])
    expect(laneSlot).toEqual([0, 1, 2])
    const spots = nodes.filter((n) => n.kind === 'card').map((n) => `${n.x}:${n.y}`)
    expect(new Set(spots).size).toBe(spots.length)
  })

  it('biten vakanın yuvası sonraki vakaya geçer; sıralı vakalar ana hatta kalır, üst üste hat birikmez', () => {
    const sequential = layoutMetro([
      { key: 'a', cards: [card(1, 0), card(2, 10)], done: true },
      { key: 'b', cards: [card(3, 20), card(4, 30)], done: false },
    ])
    expect(sequential.laneSlot).toEqual([0, 0])
    expect(sequential.edges.map((e) => [e.key, e.kind])).toEqual([
      ['start>1', 'rail'],
      ['1>2', 'rail'],
      ['2>3', 'rail'],
      ['3>4', 'rail'],
    ])

    const reuse = layoutMetro([
      { key: 'a', cards: [card(1, 0), card(5, 50)], done: false },
      { key: 'b', cards: [card(2, 10), card(3, 20)], done: true },
      { key: 'c', cards: [card(4, 30)], done: false },
    ])
    const at = (key: string) => reuse.nodes.find((n) => n.key === key)!
    expect(reuse.laneSlot).toEqual([0, 1, 1])
    expect(at('4').y).toBe(at('3').y)
    expect(at('4').x).toBeGreaterThan(at('3').x)
    expect(reuse.slots).toHaveLength(2)
  })

  it('yan hat ana hattaki son duraktan çatallanır, bitince sonraki ana hat durağına bağlanır', () => {
    const lanes = [
      { key: 'a', cards: [card(1, 0), card(3, 20), card(4, 30)], done: false },
      { key: 'b', cards: [card(2, 10)], done: true },
    ]
    expect(layoutMetro(lanes).edges.map((e) => [e.key, e.kind])).toEqual([
      ['start>1', 'rail'],
      ['1>3', 'rail'],
      ['3>4', 'rail'],
      ['1>2', 'fork'],
      ['2>>4', 'merge'],
    ])
    expect(
      layoutMetro([lanes[0]!, { ...lanes[1]!, done: false }]).edges.some((e) => e.kind === 'merge'),
    ).toBe(false)
  })

  it('yuvanın yüksekliği içindeki en uzun durağa göre: alttaki hat üsttekinin durağına binmez', () => {
    const { slots } = layoutMetro(
      [
        { key: 'a', cards: [card(1, 0), card(3, 20)], done: false },
        { key: 'b', cards: [card(2, 10)], done: false },
      ],
      [],
      (c) => (c.key === 3 ? 300 : 120),
    )
    expect(slots[0]).toEqual({ y: 0, h: 300 })
    expect(slots[1]!.y).toBe(300 + METRO.gap + METRO.room)
  })

  it('aynı hatta düz çizgi, hat değişiminde yumuşak S; bulgu bulunduğu anki durağın üstüne asılır', () => {
    expect(railPath({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe('M 0 0 L 100 0')
    expect(railPath({ x: 0, y: 0 }, { x: 100, y: 50 })).toBe('M 0 0 C 50 0, 50 50, 100 50')
    const { nodes, edges } = layoutMetro(
      [{ key: 'a', cards: [card(1, 0), card(2, 10)], done: false }],
      [{ key: 'f', at: 12 }],
    )
    const finding = nodes.find((n) => n.kind === 'finding')!
    const host = nodes.find((n) => n.key === '2')!
    expect(finding.x).toBe(host.x)
    expect(finding.y).toBeLessThan(host.y)
    expect(edges.at(-1)).toMatchObject({ key: '2!f', kind: 'finding' })
  })
})
