import { describe, expect, it } from 'vitest'
import { crumbsFor, documentTitle, filterNav, locate, type NavGroup } from './nav'

const groups: NavGroup[] = [
  { entries: [{ path: 'genel', label: 'Genel bakış', icon: 'squaresFour' }] },
  {
    label: 'Kalite kontrol',
    entries: [
      {
        label: 'Koşular',
        icon: 'playCircle',
        children: [
          { path: 'baslat', label: 'Yeni koşu' },
          { path: 'kosular', label: 'Koşu geçmişi' },
        ],
      },
      { path: 'bulgular', label: 'İnceleme', icon: 'bug' },
    ],
  },
]

describe('menü ağacı', () => {
  it('alt sayfanın modülünü, üst sayfanın yalnız adını verir; bilinmeyen sayfa ana sayfadır', () => {
    expect(locate('kosular', groups)).toEqual({ module: 'Koşular', label: 'Koşu geçmişi' })
    expect(locate('genel', groups)).toEqual({ label: 'Genel bakış' })
    expect(locate('yok', groups)).toEqual({ label: 'Genel bakış' })
  })

  it('iz modülü araya koyar, kayıttan açılan sayfa da modülüne bağlanır', () => {
    expect(crumbsFor('baslat')).toEqual(['Zeyrek Argus', 'Koşular', 'Yeni koşu'])
    expect(crumbsFor('bulgular')).toEqual(['Zeyrek Argus', 'Bulgular'])
    expect(crumbsFor('monitor')).toEqual(['Zeyrek Argus', 'Koşular', 'Canlı koşu'])
    expect(documentTitle('kosular')).toBe('Koşu geçmişi · Zeyrek Argus')
  })

  it('arama alt sayfayı modülüyle birlikte bırakır, boş grubu düşürür', () => {
    expect(filterNav(groups, 'geçmiş')).toEqual([
      {
        label: 'Kalite kontrol',
        entries: [
          { label: 'Koşular', icon: 'playCircle', children: [{ path: 'kosular', label: 'Koşu geçmişi' }] },
        ],
      },
    ])
  })

  it('modül adı eşleşince bütün alt sayfalar kalır; Türkçe büyük İ küçük i ile bulunur', () => {
    expect(filterNav(groups, 'koşular')[0]!.entries[0]!.children).toHaveLength(2)
    expect(filterNav(groups, 'inceleme')[0]!.entries).toEqual([
      { path: 'bulgular', label: 'İnceleme', icon: 'bug' },
    ])
    expect(filterNav(groups, '  ')).toBe(groups)
  })
})
