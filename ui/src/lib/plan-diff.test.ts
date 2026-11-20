import type { RunStrategy, StrategyItem } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { changeLines, planDiff, revisionMarks } from './plan-diff'

const item = (title: string, goal: string, extra: Partial<StrategyItem> = {}): StrategyItem => ({
  title,
  goal,
  source: 'tanim',
  page: null,
  fullScan: false,
  independent: false,
  ...extra,
})

const before: RunStrategy = {
  kind: 'karisik',
  scope: 'tam',
  understood: 'Performans modülünün tamamı',
  scenarios: [
    'Dönem aşamaları: dönem sırayla ilerler. Tutarsızlık: aşama atlamak.',
    'Yetki: rol sunucuda denetlenir. Tutarsızlık: yetkisiz işlem.',
    'Karne: puan hesaplanır. Tutarsızlık: yanlış puan.',
  ],
  doneWhen: 'Bütün zincirler yürütülmüş olmalı.',
  known: ['Başlatma kopya üretmez.', 'Karne gece hesaplanır.'],
  infeasible: ['Production verisi okunmaz.'],
  items: [
    item('Dönem aşamaları ve kapanış', 'Dönemin sırayla ilerlediğini doğrula.'),
    item('Dönem listesi sayaçları', 'Sayaçların listeyle tuttuğunu gözle.', { source: 'ekran', page: 'pf-donemler' }),
    item('Başlatma tekrarı', 'Kopya dönem oluşmadığını doğrula.'),
    item('Karne hesabı', 'Puanların ağırlıkla tuttuğunu doğrula.'),
  ],
  guides: [],
}

const after: RunStrategy = {
  ...before,
  understood: 'Dönemler sayfası',
  scenarios: [
    'Dönem açma: zorunlu alanlar doluysa açılır. Tutarsızlık: eksik alanla kayıt.',
    'Dönem aşamaları: dönem sırayla ilerler, aşama dışı işlem reddedilir. Tutarsızlık: aşama atlamak.',
    '  Yetki: rol sunucuda denetlenir.   Tutarsızlık: yetkisiz işlem. ',
  ],
  known: ['Başlatma kopya üretmez.', 'Aç düğmesi yetkiye bağlıdır.'],
  items: [
    item('Aşama ilerletme', 'Dönemin sırayla ilerlediğini ve aşama dışı işlemin reddedildiğini doğrula.', {
      source: 'ikisi',
      page: 'pf-donemler',
    }),
    item('Dönem açma formu', 'Zorunlu alanlar boşken kaydın reddedildiğini doğrula.'),
    item('Dönem listesi sayaçları', 'Sayaçların listeyle ve durumların aşamayla tuttuğunu gözle.', {
      source: 'ekran',
      page: 'pf-donemler',
    }),
    item(' Başlatma tekrarı ', 'Kopya dönem oluşmadığını doğrula.'),
    item('', ''),
  ],
}

describe('plan farkı', () => {
  it('aynı, değişen ve yeni öğeler ayrılır; silinenler ayrıca döner; boşluk farkı değişiklik sayılmaz', () => {
    const diff = planDiff(before, after)
    expect(diff.understood).toBe('Performans modülünün tamamı')
    expect(diff.doneWhen).toBeNull()
    expect(diff.items.map((c) => c.kind)).toEqual(['degisti', 'yeni', 'degisti', 'ayni', 'yeni'])
    // Başlığı değişen vaka metin benzerliğiyle, aynı başlıklı vaka başlığıyla eşleşir; önceki hâli döner.
    expect(diff.items[0]!.before?.title).toBe('Dönem aşamaları ve kapanış')
    expect(diff.items[2]!.before?.goal).toBe('Sayaçların listeyle tuttuğunu gözle.')
    expect(diff.removed.items.map((i) => i.title)).toEqual(['Karne hesabı'])
    expect(diff.scenarios.map((c) => c.kind)).toEqual(['yeni', 'degisti', 'ayni'])
    expect(diff.scenarios[1]!.before).toBe('Dönem aşamaları: dönem sırayla ilerler. Tutarsızlık: aşama atlamak.')
    expect(diff.removed.scenarios).toEqual(['Karne: puan hesaplanır. Tutarsızlık: yanlış puan.'])
    expect(diff.known.map((c) => c.kind)).toEqual(['ayni', 'yeni'])
    expect(diff.removed.known).toEqual(['Karne gece hesaplanır.'])
    expect(diff.infeasible.map((c) => c.kind)).toEqual(['ayni'])
  })

  it('aynı plan farksızdır', () => {
    const diff = planDiff(before, structuredClone(before))
    expect(diff.understood).toBeNull()
    expect(diff.items.every((c) => c.kind === 'ayni')).toBe(true)
    expect(changeLines(diff, before)).toEqual([])
  })
})

describe('düzenletmeden sonraki işaretler', () => {
  it("yalnız Argus'un değişikliği işaretlenir: elle eklenen vaka işaretsiz, Argus'un eklediği elle düzeltilse de yeni", () => {
    const edited: RunStrategy = {
      ...after,
      understood: 'Dönemler sayfası, elle düzeltildi',
      items: [
        after.items[0]!,
        { ...after.items[1]!, goal: 'Zorunlu alanlar boşken kaydın reddedildiğini elle düzelttim.' },
        after.items[2]!,
        after.items[3]!,
        item('Elle eklenen vaka', 'Kullanıcı ekledi.'),
      ],
      known: [...after.known, 'Elle eklenen kural.'],
    }
    const marks = revisionMarks(before, after, edited)
    expect(marks.understood).toBe('Performans modülünün tamamı')
    expect(marks.items.map((c) => c.kind)).toEqual(['degisti', 'yeni', 'degisti', 'ayni', 'ayni'])
    expect(marks.items[0]!.before?.title).toBe('Dönem aşamaları ve kapanış')
    expect(marks.known.map((c) => c.kind)).toEqual(['ayni', 'yeni', 'ayni'])
    expect(marks.scenarios.map((c) => c.kind)).toEqual(['yeni', 'degisti', 'ayni'])
  })
})

describe('elle yapılan değişikliklerin listesi', () => {
  it('her değişiklik bir satırdır; yalnız işareti kaldırılan vaka "koşudan çıkarıldı" diye yazılır', () => {
    const edited: RunStrategy = {
      ...before,
      understood: 'Performans modülünün tamamı, önce karne',
      items: [
        before.items[0]!,
        { ...before.items[1]!, excluded: true },
        { ...before.items[2]!, goal: 'Kopya dönem ve kopya görev oluşmadığını doğrula.' },
        item('Yeni elle vaka', 'Elle eklendi.'),
      ],
      scenarios: [...before.scenarios, 'İtiraz: süre içinde yapılır. Tutarsızlık: süre dışı itiraz.'],
    }
    expect(changeLines(planDiff(before, edited), edited)).toEqual([
      'Kapsam değiştirildi',
      'Vaka koşudan çıkarıldı: Dönem listesi sayaçları',
      'Vaka değiştirildi: Başlatma tekrarı',
      'Vaka eklendi: Yeni elle vaka',
      'Vaka silindi: Karne hesabı',
      'Senaryo eklendi: İtiraz',
    ])
  })
})
