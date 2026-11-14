import { describe, expect, it } from 'vitest'
import { planIdentity } from './plan.ts'

const accounts = [
  { identifier: 'onur@ornek.test', isDefault: false },
  { identifier: 'furkan@ornek.test', isDefault: true },
]

describe('kimlik planı', () => {
  it('kullanıcı seçilmezse varsayılan hesap; varsayılan işaretli değilse ilk hesap', () => {
    expect(planIdentity(null, accounts, false)).toEqual({ kind: 'hesap', identifier: 'furkan@ornek.test' })
    expect(planIdentity('', [{ identifier: 'a@x', isDefault: false }], true)).toEqual({
      kind: 'hesap',
      identifier: 'a@x',
    })
  })

  it('istenen kullanıcının hesabı varsa süper giriş olsa da o hesapla girilir (büyük/küçük harf duyarsız)', () => {
    expect(planIdentity(' Onur@Ornek.test ', accounts, true)).toEqual({
      kind: 'hesap',
      identifier: 'onur@ornek.test',
    })
  })

  it('hesabı olmayan kişiye, süper giriş tanımlıysa varsayılan hesaptan geçilir', () => {
    expect(planIdentity('Çetin KOCATÜRK', accounts, true)).toEqual({
      kind: 'super',
      base: 'furkan@ornek.test',
      target: 'Çetin KOCATÜRK',
    })
  })

  it('hiç hesap yoksa platform jetonuyla açılır (yeni klonda ilk koşu)', () => {
    expect(planIdentity(undefined, [], true)).toEqual({ kind: 'platform' })
  })

  it('kişiye hiçbir yoldan girilemiyorsa koşu açılmaz, nedeni yola göre söylenir', () => {
    const noSuper = planIdentity('yok@ornek.test', accounts, false)
    expect(noSuper.kind === 'yok' && noSuper.message).toContain('süper giriş tanımlı değil')
    const noBase = planIdentity('Çetin KOCATÜRK', [], true)
    expect(noBase.kind === 'yok' && noBase.message).toContain('süper giriş yetkisi olan bir hesap ekleyin')
  })
})
