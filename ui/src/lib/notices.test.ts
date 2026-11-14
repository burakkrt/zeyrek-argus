import { describe, expect, it } from 'vitest'
import { MAX_NOTICES, NOTICE_DURATION, pushNotice, type Notice } from './notices'

describe('bildirimler', () => {
  it('yeni bildirim en üste girer; süre verilmezse tonun süresi, 0 kapanmaz', () => {
    let list: Notice[] = []
    list = pushNotice(list, { tone: 'success', title: 'Kaydedildi' }, 'a')
    list = pushNotice(list, { tone: 'error', title: 'Olmadı', message: 'Ağ hatası', duration: 0 }, 'b')
    expect(list.map((n) => [n.id, n.duration, n.message])).toEqual([
      ['b', 0, 'Ağ hatası'],
      ['a', NOTICE_DURATION.success, ''],
    ])
  })

  it('aynı bildirim tekrar gelince yeni kart açılmaz: sayaç artar, anahtar yenilenir, en üste çıkar', () => {
    let list: Notice[] = []
    list = pushNotice(list, { tone: 'warning', title: 'Kapsam seçilmedi' }, 'a')
    list = pushNotice(list, { tone: 'info', title: 'Başka' }, 'b')
    list = pushNotice(list, { tone: 'warning', title: 'Kapsam seçilmedi' }, 'c')
    expect(list.map((n) => [n.id, n.count, n.key])).toEqual([
      ['a', 2, 'a:2'],
      ['b', 1, 'b:1'],
    ])
    // Başlık aynı, ton ya da metin farklıysa ayrı bildirimdir.
    list = pushNotice(list, { tone: 'error', title: 'Kapsam seçilmedi' }, 'd')
    expect(list[0]).toMatchObject({ id: 'd', count: 1 })
  })

  it('üst sınır aşılınca en eski düşer', () => {
    let list: Notice[] = []
    for (const id of ['1', '2', '3', '4']) list = pushNotice(list, { tone: 'info', title: id }, id)
    expect(list.map((n) => n.id)).toEqual(['4', '3', '2'])
    expect(list).toHaveLength(MAX_NOTICES)
  })
})
