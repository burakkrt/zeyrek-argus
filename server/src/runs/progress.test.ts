import type { RunEvent, RunEventBody, RunStrategy } from '@argus/shared'
import { DEFINITION_PAGE } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { runProgress } from './progress.ts'

let seq = 0
const ev = (body: RunEventBody, page: string | null = null): RunEvent =>
  ({ ...body, runId: 'r1', seq: ++seq, at: new Date(1_000_000 + seq * 1000).toISOString(), page }) as RunEvent

const strategy = { understood: 'Liste', items: [] } as unknown as RunStrategy
const D = DEFINITION_PAGE

describe('koşunun ilerlemesi', () => {
  it('planlama olayları devam sayılmaz; strateji yayımlandıktan sonra yürütme devamdır', () => {
    expect(runProgress([ev({ type: 'kosu-basladi', pages: [] }), ev({ type: 'bilgi', message: 'Plan hazır' })]).resumed).toBe(false)
    const progress = runProgress([ev({ type: 'kosu-basladi', pages: [] }), ev({ type: 'strateji', strategy })])
    expect(progress.resumed).toBe(true)
    expect(progress.strategy).toBe(strategy)
  })

  it('biten vaka özetiyle gelir; başlayıp bitmeyen ve yarıda kalan işaretli vaka bitmiş sayılmaz', () => {
    const progress = runProgress([
      ev({ type: 'strateji', strategy }),
      ev({ type: 'plan', summary: '', tasks: [{ title: 'A', goal: '' }, { title: 'B', goal: '' }, { title: 'C', goal: '' }] }, D),
      ev({ type: 'gorev-basladi', index: 0, title: 'A' }, D),
      ev({ type: 'gorev-bitti', index: 0, summary: 'A tamam, kayıt 7' }, D),
      ev({ type: 'gorev-basladi', index: 1, title: 'B' }, D),
      ev({ type: 'gorev-basladi', index: 2, title: 'C' }, D),
      ev({ type: 'gorev-bitti', index: 2, summary: 'Yarım kaldı: durduruldu', interrupted: true }, D),
      ev({ type: 'kosu-bitti', status: 'durduruldu', usage: {} as never }),
    ])
    expect([...progress.definitions]).toEqual([['A', 'A tamam, kayıt 7']])
    expect(progress.interrupted).toEqual(['B', 'C'])
  })

  it('ekran sayfası yarıda kalmadan bittiyse tamamdır; görevleri bitmemiş yarım sayfa tamam sayılmaz', () => {
    const progress = runProgress([
      ev({ type: 'strateji', strategy }),
      ev({ type: 'plan', summary: '', tasks: [{ title: 'Liste', goal: '' }, { title: 'Filtre', goal: '' }] }, 'pf-liste'),
      ev({ type: 'gorev-basladi', index: 0, title: 'Liste' }, 'pf-liste'),
      ev({ type: 'gorev-bitti', index: 0, summary: 'Liste tutarlı' }, 'pf-liste'),
      ev({ type: 'sayfa-bitti', summary: 'Liste tutarlı' }, 'pf-liste'),
      ev({ type: 'plan', summary: '', tasks: [{ title: 'Form', goal: '' }, { title: 'Kaydet', goal: '' }] }, 'pf-form'),
      ev({ type: 'gorev-basladi', index: 0, title: 'Form' }, 'pf-form'),
      ev({ type: 'gorev-bitti', index: 0, summary: 'Form açılıyor' }, 'pf-form'),
      ev({ type: 'gorev-basladi', index: 1, title: 'Kaydet' }, 'pf-form'),
      ev({ type: 'gorev-bitti', index: 1, summary: 'Yarım kaldı', interrupted: true }, 'pf-form'),
      ev({ type: 'sayfa-bitti', summary: '...', interrupted: true }, 'pf-form'),
    ])
    expect([...progress.pages]).toEqual([['pf-liste', 'Liste tutarlı']])
    expect(progress.interrupted).toEqual([])
  })

  it('bütün görevleri biten sayfa, sayfa sonu işi yarıda kalsa da tamamdır (sunucu kapandı, sayfa bitişi yok)', () => {
    const progress = runProgress([
      ev({ type: 'strateji', strategy }),
      ev({ type: 'plan', summary: '', tasks: [{ title: 'Form', goal: '' }, { title: 'Liste', goal: '' }] }, 'ob-liste'),
      ev({ type: 'gorev-basladi', index: 0, title: 'Form' }, 'ob-liste'),
      ev({ type: 'gorev-bitti', index: 0, summary: 'Form tamam' }, 'ob-liste'),
      ev({ type: 'gorev-basladi', index: 1, title: 'Liste' }, 'ob-liste'),
      ev({ type: 'gorev-bitti', index: 1, summary: 'Liste tamam' }, 'ob-liste'),
    ])
    expect([...progress.pages]).toEqual([['ob-liste', '1. Form: Form tamam\n2. Liste: Liste tamam']])
  })

  it('devamda yeniden yürüyüp biten vaka bitmiş sayılır', () => {
    const progress = runProgress([
      ev({ type: 'strateji', strategy }),
      ev({ type: 'plan', summary: '', tasks: [{ title: 'A', goal: '' }] }, D),
      ev({ type: 'gorev-basladi', index: 0, title: 'A' }, D),
      ev({ type: 'kosu-bitti', status: 'hata', usage: {} as never }),
      ev({ type: 'kosu-basladi', pages: [] }),
      ev({ type: 'plan', summary: '', tasks: [{ title: 'A', goal: '' }] }, D),
      ev({ type: 'gorev-basladi', index: 0, title: 'A' }, D),
      ev({ type: 'gorev-bitti', index: 0, summary: 'A tamam' }, D),
    ])
    expect([...progress.definitions]).toEqual([['A', 'A tamam']])
    expect(progress.interrupted).toEqual([])
  })
})
