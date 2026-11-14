import type { RunEvent, RunEventBody } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { buildMonitor, nextPlayhead, stepPercent } from './monitor'

let seq = 0
const ev = (page: string | null, body: RunEventBody): RunEvent =>
  ({ ...body, runId: 'r', seq: ++seq, at: '2026-11-14T10:00:00Z', page }) as RunEvent

const step = (page: string, outcome: string, target = null) =>
  ev(page, { type: 'adim', tool: 'tikla', reason: 'Bakmak için', outcome, shot: `adim/${seq}.jpg`, target })

const finding = (page: string, key: string, outcome: 'yeni' | 'bastirildi' = 'yeni') =>
  ev(page, {
    type: 'bulgu',
    issueId: key,
    occurrenceId: key,
    key,
    title: key,
    kind: 'kesin',
    outcome,
    reason: null,
    shot: null,
  })

describe('monitör modeli', () => {
  it('plan ağacını kurar: sayfa ve görev durumları, görevin ilk adımı', () => {
    const model = buildMonitor([
      ev(null, { type: 'kosu-basladi', pages: ['liste', 'karne'] }),
      ev('liste', { type: 'sayfa-basladi', url: 'u' }),
      ev('liste', {
        type: 'plan',
        summary: 's',
        tasks: [
          { title: 'Açılış', goal: 'g' },
          { title: 'Filtreler', goal: 'g' },
        ],
      }),
      ev('liste', { type: 'gorev-basladi', index: 0, title: 'Açılış' }),
      step('liste', 'Tıklandı: "Ara"'),
      ev('liste', { type: 'gorev-bitti', index: 0, summary: 'ok' }),
      ev('liste', { type: 'gorev-basladi', index: 1, title: 'Filtreler' }),
      step('liste', 'Tıklandı: "Dönem"'),
      step('liste', 'Tıklandı: "Kaydet"'),
    ])
    expect(model.pages.map((p) => [p.page, p.status])).toEqual([
      ['liste', 'suruyor'],
      ['karne', 'bekliyor'],
    ])
    expect(model.pages[0]!.tasks.map((t) => [t.title, t.status, t.firstStep])).toEqual([
      ['Açılış', 'bitti', 0],
      ['Filtreler', 'suruyor', 1],
    ])
    expect(model.steps.map((s) => [s.outcome, s.task])).toEqual([
      ['Tıklandı: "Ara"', 0],
      ['Tıklandı: "Dönem"', 1],
      ['Tıklandı: "Kaydet"', 1],
    ])
  })

  it('bulguyu hemen önceki adıma bağlar; açılışta bulunan -1, bastırılan hiç görünmez', () => {
    const model = buildMonitor([
      ev('liste', { type: 'sayfa-basladi', url: 'u' }),
      finding('liste', 'acilista'),
      step('liste', 'Tıklandı: "A"'),
      step('liste', 'Tıklandı: "B"'),
      finding('liste', 'b-sonrasi'),
      finding('liste', 'bastirilan', 'bastirildi'),
    ])
    expect(model.findings.map((f) => [f.event.key, f.step])).toEqual([
      ['acilista', -1],
      ['b-sonrasi', 1],
    ])
  })

  it('sayfa bitince süren görev de biter', () => {
    const model = buildMonitor([
      ev('liste', { type: 'plan', summary: 's', tasks: [{ title: 'T', goal: 'g' }] }),
      ev('liste', { type: 'gorev-basladi', index: 0, title: 'T' }),
      ev('liste', { type: 'sayfa-bitti', summary: 'bitti' }),
    ])
    expect(model.pages[0]).toMatchObject({ status: 'bitti', tasks: [{ status: 'bitti' }] })
  })
})

describe('takip hızı', () => {
  const following = { shown: 2, shownAt: 1_000, following: true }

  it('canlının gerisindeyken her adım en az süre kadar kalır, sonra bir sonrakine geçer', () => {
    expect(nextPlayhead(following, 5, 1_500, 1_200)).toEqual({ shown: 2, shownAt: 1_000 })
    expect(nextPlayhead(following, 5, 2_300, 1_200)).toEqual({ shown: 3, shownAt: 2_300 })
  })

  it('canlıya yetişince ya da kayıttan izlerken ilerlemez; ilk adım beklemeden görünür', () => {
    expect(nextPlayhead({ ...following, shown: 5 }, 5, 9_000, 1_200).shown).toBe(5)
    expect(nextPlayhead({ ...following, following: false }, 5, 9_000, 1_200).shown).toBe(2)
    expect(nextPlayhead({ shown: -1, shownAt: 0, following: true }, 3, 10, 1_200).shown).toBe(0)
  })

  it('zaman çizelgesi konumu yüzde; tek adım ortada', () => {
    expect(stepPercent(0, 5)).toBe(0)
    expect(stepPercent(4, 5)).toBe(100)
    expect(stepPercent(-1, 5)).toBe(0)
    expect(stepPercent(0, 1)).toBe(50)
  })
})
