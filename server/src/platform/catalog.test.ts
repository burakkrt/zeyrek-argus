import { describe, expect, it } from 'vitest'
import { landedOn, runtimeHeaders } from './catalog.ts'

const base = 'https://glomil.zeyrek.app/dev/qm/web'

describe('açılan sayfa', () => {
  it('uygulama başka sayfaya yönlendirdiyse vardığı sayfanın adını verir', () => {
    expect(landedOn(`${base}/performans-olcum`, `${base}/sayfa-bulunamadi`)).toBe('sayfa-bulunamadi')
    expect(landedOn(`${base}/performans-olcum`, `${base}/giris?donus=/performans-olcum`)).toBe('giris')
  })

  it('aynı sayfada kaldıysa null; sorgu, sondaki eğik çizgi ve büyük harf fark sayılmaz', () => {
    expect(landedOn(`${base}/performans-karne`, `${base}/performans-karne?yil=2026#ust`)).toBeNull()
    expect(landedOn(`${base}/performans-karne`, `${base}/Performans-Karne/`)).toBeNull()
  })
})

describe('çalışma anı başlıkları', () => {
  it('ortam, sayfa ve yüzey isteğin bağlamı olarak gider', () => {
    expect(runtimeHeaders('development', 'dashboard')).toEqual({
      'x-environment': 'development',
      'x-page': 'dashboard',
      'x-surface': 'runtime',
    })
  })
})
