import type { Issue } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import {
  board,
  canContinue,
  changes,
  closeBlocker,
  columnOf,
  family,
  seenBefore,
  similarPending,
  stampStreak,
  statusOf,
  suggestionFor,
  triageKey,
  triageQueue,
} from './review'

const issue = (
  id: string,
  status: Issue['status'],
  severity: Issue['severity'],
  title: string,
  unclear = false,
  kind: Issue['kind'] = 'tutarsizlik',
) => ({ id, status, severity, title, unclear, kind, firstSeen: '2026-11-17T08:00:00.000Z' }) as Issue

describe('hızlı ve güvenli karar', () => {
  const pending = [
    issue('1', 'acik', 'S4', 'Durum kolonu Statü diye geçiyor'),
    issue('2', 'acik', 'S4', 'Durum kolonu bir yerde Statü diye geçiyor'),
    issue('3', 'acik', 'S2', 'Olay tarihi zorunlu değil', false, 'kesin'),
    issue('4', 'acik', 'S3', 'Liste tarihi ham biçimde'),
  ]
  const decided = [issue('9', 'kabul-edildi', 'S4', 'Liste tarihi ham biçimde görünüyor')]

  it('benzer bekleyen kartlar aynı tür ve benzer başlıktır; karar verilmiş ya da başka tür benzer sayılmaz', () => {
    expect(similarPending(pending[0]!, pending).map((i) => i.id)).toEqual(['2'])
    expect(similarPending(pending[2]!, pending)).toEqual([])
  })

  it('öneri geçmişteki benzer karardır; benzeri yoksa öneri yoktur', () => {
    expect(suggestionFor(pending[3]!, decided)).toEqual({ status: 'kabul-edildi', title: 'Liste tarihi ham biçimde görünüyor' })
    expect(suggestionFor(pending[2]!, decided)).toBeNull()
  })

  it('triyaj sırası: önce önerisi olmayan ağır önemli, benzerler art arda, en sonda önerisi olanlar', () => {
    expect(triageQueue(pending, decided).map((i) => i.id)).toEqual(['3', '2', '1', '4'])
  })

  it('triyaj tuşları tek tuş tek karar; neden beklenirken yalnız 1-4 ve Esc geçer', () => {
    expect(triageKey('D', false)).toEqual({ type: 'decide', column: 'onay' })
    expect(triageKey('b', false)).toEqual({ type: 'decide', column: 'kabul' })
    expect(triageKey('r', false)).toEqual({ type: 'ask-reason' })
    expect(triageKey('ArrowLeft', false)).toEqual({ type: 'step', by: -1 })
    expect(triageKey('x', false)).toBeNull()
    expect(triageKey('2', true)).toEqual({ type: 'dismiss', reason: 'yanlis-gozlem' })
    expect(triageKey('5', true)).toBeNull()
    expect(triageKey('d', true)).toBeNull()
    expect(triageKey('Escape', true)).toEqual({ type: 'cancel' })
  })

  it('öneriyle aynı kararlar sayılır; farklı karar ya da önerisiz kart sayacı sıfırlar', () => {
    expect(stampStreak(3, 'kabul-edildi', 'kabul-edildi')).toBe(4)
    expect(stampStreak(3, 'kabul-edildi', 'duzeltilecek')).toBe(0)
    expect(stampStreak(3, null, 'duzeltilecek')).toBe(0)
  })
})

describe('koşu onayı panosu', () => {
  it('sütun insanın kararıdır: açık bekliyor, düzeltilecek ve düzeldi onaylandı, bulgu değil reddedildi', () => {
    expect(
      ['acik', 'duzeltilecek', 'duzeldi', 'kabul-edildi', 'bulgu-degil'].map((s) =>
        columnOf(issue('a', s as Issue['status'], 'S3', 'x')),
      ),
    ).toEqual(['bekliyor', 'onay', 'onay', 'kabul', 'ret'])
    expect(statusOf('kabul')).toBe('kabul-edildi')
    // İnsanın anlamadığı açık bulgu Belirsiz sütunundadır (karar bekler).
    expect(columnOf(issue('a', 'acik', 'S3', 'x', true))).toBe('belirsiz')
    expect(['bekliyor', 'onay', 'ret'].map((c) => statusOf(c as 'onay'))).toEqual([
      'acik',
      'duzeltilecek',
      'bulgu-degil',
    ])
    // Düzelmiş sorunu onaylandı sütununa bırakmak kararı değiştirmez (düzeldi, düzeltilecek'e geri dönmez).
    expect(changes(issue('a', 'duzeldi', 'S3', 'x'), 'onay')).toBe(false)
    expect(changes(issue('a', 'acik', 'S3', 'x'), 'ret')).toBe(true)
    expect(changes(issue('a', 'acik', 'S3', 'x'), 'belirsiz')).toBe(true)
    expect(changes(issue('a', 'acik', 'S3', 'x', true), 'bekliyor')).toBe(true)
  })

  it('sütunlar önem ve başlık sırasıyla dolar', () => {
    const b = board([
      issue('1', 'acik', 'S3', 'Çıkış uyarısı yok'),
      issue('2', 'acik', 'S2', 'Döngü kabul ediliyor'),
      issue('3', 'acik', 'S3', 'Başlık yanlış'),
      issue('4', 'bulgu-degil', 'S4', 'Test verisi'),
      issue('5', 'acik', 'S2', 'Anlaşılmadı', true),
    ])
    expect(b.bekliyor.map((i) => i.id)).toEqual(['2', '3', '1'])
    expect(b.belirsiz.map((i) => i.id)).toEqual(['5'])
    expect(b.ret.map((i) => i.id)).toEqual(['4'])
    expect(b.onay).toEqual([])
  })

  it('kapatma kapısı: süren koşu, bekleyen karar ve kapatılmış koşu nedenini söyler', () => {
    const review = { pending: 0, accepted: 3, kept: 0, rejected: 1, unclear: 0 }
    const continuations: Array<{ id: string; code: string; status: 'bitti' | 'calisiyor' }> = []
    expect(closeBlocker({ status: 'calisiyor', review, closedAt: null, continuations })).toBe(
      'Koşu bitince kapatılabilir.',
    )
    expect(
      closeBlocker({ status: 'bitti', review: { ...review, pending: 2 }, closedAt: null, continuations }),
    ).toBe('Kapatmak için 2 karar kaldı.')
    // Belirsiz kalan bulgu önce netleştirilir.
    expect(
      closeBlocker({ status: 'bitti', review: { ...review, pending: 2, unclear: 1 }, closedAt: null, continuations }),
    ).toBe('Anlamadığın 1 bulgu var: önce netleştir.')
    expect(closeBlocker({ status: 'durduruldu', review, closedAt: null, continuations })).toBeNull()
    expect(
      closeBlocker({ status: 'bitti', review, closedAt: '2026-11-18T10:00:00.000Z', continuations }),
    ).toBe('Koşu kapatıldı.')
    // Devam koşusu sürerken kapatılamaz ve yeniden sürdürülemez; bitince ikisi de serbest.
    const steering = {
      status: 'bitti' as const,
      review,
      closedAt: null,
      continuations: [{ id: 'c', code: 'KOS-2', status: 'calisiyor' as const }],
    }
    expect(closeBlocker(steering)).toBe('Devam koşusu bitince kapatılabilir.')
    expect(canContinue(steering)).toBe(false)
    const done = { ...steering, continuations: [{ id: 'c', code: 'KOS-2', status: 'bitti' as const }] }
    expect(closeBlocker(done)).toBeNull()
    expect(canContinue(done)).toBe(true)
    expect(canContinue({ ...done, closedAt: '2026-11-18T10:00:00.000Z' })).toBe(false)
    expect(family({ id: 'r', continuations: done.continuations })).toEqual(['r', 'c'])
    expect(seenBefore(issue('1', 'acik', 'S3', 'x'), { startedAt: '2026-11-18T07:00:00.000Z' })).toBe(true)
    expect(seenBefore(issue('1', 'acik', 'S3', 'x'), { startedAt: '2026-11-17T07:00:00.000Z' })).toBe(false)
  })
})
