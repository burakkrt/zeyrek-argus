import type { RunInfo } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { doneCount, lifecycle, runSteps } from './run-steps'

const run = (over: Partial<RunInfo>) =>
  ({
    id: 'r1',
    status: 'bitti',
    review: { pending: 0, accepted: 0, rejected: 0, unclear: 0 },
    closedAt: null,
    options: { maxTasks: 20, maxSteps: 150 },
    ...over,
  }) as RunInfo
const view = (steps: ReturnType<typeof runSteps>) => steps.map((s) => `${s.id}:${s.state}:${s.sub}`)

describe('koşunun adımları', () => {
  it('yeni koşuda yalnız plan açık; koşu sürerken değerlendirme ve kapanış kilitli', () => {
    expect(view(runSteps(null, 'plan'))).toEqual([
      'plan:sel:İstek ve plan',
      'kosu:lock:Başlatılınca izlenir',
      'degerlendirme:lock:Koşu bitince açılır',
      'kapanis:lock:Kararlar bitince',
    ])
    const steps = runSteps(run({ status: 'calisiyor' }), 'kosu')
    expect(view(steps)).toEqual([
      'plan:done:İstek ve plan',
      'kosu:sel:Sürüyor',
      'degerlendirme:lock:Koşu bitince açılır',
      'kapanis:lock:Kararlar bitince',
    ])
    expect(steps.map((s) => s.href)).toEqual([null, '#/monitor/r1', null, null])
  })

  it('biten koşuda değerlendirme açılır ve bekleyen kararı söyler; kapanınca bütün adımlar tamam', () => {
    const open = runSteps(run({ review: { pending: 39, accepted: 0, rejected: 0, unclear: 0 } }), 'degerlendirme')
    expect(view(open).slice(1)).toEqual([
      'kosu:done:Bitti',
      'degerlendirme:sel:39 karar bekliyor',
      'kapanis:lock:Kararlar bitince',
    ])
    expect(open[2]!.href).toBe('#/onay/r1')
    // Koşu yarıda kalsa da değerlendirilir.
    expect(runSteps(run({ status: 'hata' }), 'kosu')[1]!.sub).toBe('Yarıda kaldı')

    const closed = runSteps(run({ closedAt: '2026-11-19T10:00:00.000Z' }), 'kapanis')
    expect(view(closed).slice(2)).toEqual(['degerlendirme:done:Tamamlandı', 'kapanis:sel:Kapatıldı'])
    expect(doneCount(closed)).toBe(4)
    expect(doneCount(open)).toBe(2)
  })

  it('plan onay beklerken koşu adımı kilitli; plan hazırlanırken ve taslakta plan sayfası açılır', () => {
    const drafting = runSteps(run({ status: 'calisiyor', planState: 'hazirlaniyor' }), 'plan')
    expect(view(drafting).slice(0, 2)).toEqual(['plan:sel:Hazırlanıyor', 'kosu:lock:Plan onaylanınca'])
    expect(drafting[0]!.href).toBe('#/plan/r1')
    const draft = runSteps(run({ status: 'sirada', planState: 'taslak' }), 'plan')
    expect(view(draft).slice(0, 2)).toEqual(['plan:sel:Onay bekliyor', 'kosu:lock:Plan onaylanınca'])
    const approved = runSteps(run({ status: 'calisiyor', planState: 'onaylandi' }), 'kosu')
    expect(view(approved).slice(0, 2)).toEqual(['plan:done:Onaylandı', 'kosu:sel:Sürüyor'])
    expect(approved[0]!.href).toBe('#/plan/r1')
    // Koşular listesinde plan aşaması kendi etiketidir ve plan sayfasına götürür.
    expect(lifecycle(run({ status: 'sirada', planState: 'taslak' }))).toMatchObject({ label: 'Plan', href: '#/plan/r1' })
    expect(lifecycle(run({ status: 'calisiyor', planState: 'duzenleniyor' }))).toMatchObject({ label: 'Plan' })
    expect(lifecycle(run({ status: 'calisiyor', planState: 'onaylandi' }))).toMatchObject({ label: 'Koşu' })
  })

  it('devam koşusunun değerlendirmesi ana koşunun panosudur', () => {
    const steps = runSteps(
      run({ id: 'c1', options: { maxTasks: 20, maxSteps: 150, parentRunId: 'r1' } }),
      'kosu',
    )
    expect(steps[1]!.href).toBe('#/monitor/c1')
    expect(steps[2]!.href).toBe('#/onay/r1')
  })

  it('listedeki durum koşunun bulunduğu adımdır, tek etiket', () => {
    const at = (over: Partial<RunInfo>) => {
      const l = lifecycle(run(over))
      return `${l.label}|${l.href}`
    }
    expect(at({ status: 'sirada' })).toBe('Sırada|#/monitor/r1')
    expect(at({ status: 'calisiyor' })).toBe('Koşu|#/monitor/r1')
    expect(at({ status: 'bitti', review: { pending: 8, accepted: 0, rejected: 0, unclear: 0 } })).toBe('Değerlendirme|#/onay/r1')
    expect(at({ status: 'bitti' })).toBe('Değerlendirme|#/onay/r1')
    // Yarıda kalan ve durdurulan koşu da değerlendirme adımındadır.
    expect(at({ status: 'hata' })).toBe('Değerlendirme|#/onay/r1')
    expect(at({ status: 'durduruldu' })).toBe('Değerlendirme|#/onay/r1')
    expect(at({ status: 'hata', closedAt: '2026-11-19T10:00:00.000Z' })).toBe('Kapatıldı|#/onay/r1')
    expect(at({ id: 'c1', options: { maxTasks: 20, maxSteps: 150, parentRunId: 'r1' } })).toBe('Değerlendirme|#/onay/r1')
  })
})
