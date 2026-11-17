import type { Rule } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { platformNotes } from './platform-notes.ts'

const app = { project: 'qm', application: 'web' }

const rule = (over: Partial<Rule>): Rule => ({
  id: 'x',
  scope: 'uygulama',
  type: 'sorun',
  state: 'onayli',
  text: 'x',
  sources: [],
  author: 'Ayşe',
  date: '2026-11-16',
  file: 'x.md',
  app,
  ...over,
})

describe('platformNotes', () => {
  it('yalnız onaylı kuralları türüne göre bölümlere dizer, kapsamı yazar', () => {
    const notes = platformNotes(app, [
      rule({ id: 'b', text: 'Tarih gg.aa.yyyy olmalı.' }),
      rule({ id: 'a', type: 'sorun-degil', scope: 'modul:dif', text: 'Boş liste uyarısı normaldir.' }),
      rule({ id: 'c', state: 'aday', text: 'Aday kural.' }),
      rule({ id: 'd', state: 'emekli', text: 'Emekli kural.' }),
    ])
    expect(notes.count).toBe(2)
    expect(notes.content).toContain('## Kaçınılacak hatalar\n- Tarih gg.aa.yyyy olmalı.')
    expect(notes.content).toContain('## Hata sayılmayan davranışlar\n- Boş liste uyarısı normaldir. (modul: dif)')
    expect(notes.content).not.toMatch(/Aday kural|Emekli kural|Uygulama bilgisi/)
  })

  it('aynı kurallar sıradan bağımsız aynı içeriği verir', () => {
    const rules = [rule({ id: 'a', text: 'A.' }), rule({ id: 'b', text: 'B.' })]
    expect(platformNotes(app, rules).content).toBe(platformNotes(app, [...rules].reverse()).content)
  })

  it('onaylı ders yoksa bunu söyler', () => {
    expect(platformNotes(app, []).content).toContain('Henüz onaylı ders yok.')
  })
})
