import { describe, expect, it } from 'vitest'
import { crumbsFor, documentTitle, filterNav, locate, type NavGroup } from './nav'

const groups: NavGroup[] = [
  { entries: [{ path: 'genel', label: 'Ana sayfa', icon: 'squaresFour' }] },
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
    expect(locate('genel', groups)).toEqual({ label: 'Ana sayfa' })
    expect(locate('yok', groups)).toEqual({ label: 'Ana sayfa' })
  })

  it('iz ana sayfadan başlar, modülü araya koyar; kayıttan açılan sayfa da modülüne bağlanır', () => {
    expect(crumbsFor('genel')).toEqual(['Ana sayfa'])
    expect(crumbsFor('baslat')).toEqual(['Ana sayfa', 'Koşular', 'Yeni koşu'])
    expect(crumbsFor('bulgular')).toEqual(['Ana sayfa', 'Bulgular'])
    expect(crumbsFor('monitor')).toEqual(['Ana sayfa', 'Koşular', 'Koşu izleme'])
  })

  it('sekme başlığı tek biçimdedir: "Sayfa | Zeyrek Argus"', () => {
    expect(documentTitle('kosular')).toBe('Koşu geçmişi | Zeyrek Argus')
    expect(documentTitle(undefined)).toBe('Ana sayfa | Zeyrek Argus')
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
