import { describe, expect, it } from 'vitest'
import { fixPrompt } from './closing'

describe('kapanışın düzeltme istemi', () => {
  it('her bulgu nerede, ne oluyor, düzeltme ve kabul ölçütleriyle; ekibin düzenlediği düzeltme işaretli', () => {
    const text = fixPrompt({ project: 'qm', application: 'web' }, [
      {
        title: 'Olay tarihi zorunlu değil',
        pages: ['ob-bildir'],
        fix: 'Olay tarihini zorunlu yap.',
        fixEdited: true,
        report: { summary: 'Tarih boşken kayıt kabul ediliyor.', location: 'Olay bildir formu', acceptance: ['Tarih boşken kayıt reddedilir.'] },
      },
      { title: 'Liste tarihi ham', pages: ['ob-liste'], fix: null, fixEdited: false, report: null },
    ])
    expect(text).toContain('qm/web uygulamasında, kalite kontrolünde onaylanan 2 sorunu düzelt')
    expect(text).toContain('## 1. Olay tarihi zorunlu değil')
    expect(text).toContain('Nerede: Olay bildir formu')
    expect(text).toContain('Düzeltme (ekibin belirlediği): Olay tarihini zorunlu yap.')
    expect(text).toContain('- Tarih boşken kayıt reddedilir.')
    expect(text).toContain('## 2. Liste tarihi ham\nNerede: ob-liste')
    expect(text).toContain('Düzeltme (önerilen): Belirtilmedi')
  })
})
