import type { Issue } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { board, canContinue, changes, closeBlocker, columnOf, family, seenBefore, statusOf } from './review'

const issue = (id: string, status: Issue['status'], severity: Issue['severity'], title: string, unclear = false) =>
  ({ id, status, severity, title, unclear, firstSeen: '2026-11-17T08:00:00.000Z' }) as Issue

describe('koşu onayı panosu', () => {
  it('sütun insanın kararıdır: açık bekliyor, düzeltilecek ve düzeldi onaylandı, bulgu değil reddedildi', () => {
    expect(
      ['acik', 'duzeltilecek', 'duzeldi', 'bulgu-degil'].map((s) => columnOf(issue('a', s as Issue['status'], 'S3', 'x'))),
    ).toEqual(['bekliyor', 'onay', 'onay', 'ret'])
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
    const review = { pending: 0, accepted: 3, rejected: 1, unclear: 0 }
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
    ).toBe('1 belirsiz bulgu var: önce netleştirin.')
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
