import { describe, expect, it } from 'vitest'
import {
  changeSize,
  compressSnapshot,
  diffSnapshot,
  labelsOf,
  stableTree,
  windowSnapshot,
} from './snapshot.ts'

describe('compressSnapshot', () => {
  it('uzun satır dizisini ilk üç + sonuncu olarak özetler, iç içe yapıyı korur', () => {
    const rows = Array.from(
      { length: 20 },
      (_, i) => `      - row "Kayıt ${i + 1}" [ref=e${i + 10}]:\n        - cell "${i + 1}"`,
    ).join('\n')
    const input = `- main [ref=e1]:\n  - heading "Liste" [level=1] [ref=e2]\n  - table [ref=e3]:\n    - rowgroup [ref=e4]:\n${rows}`
    const out = compressSnapshot(input)
    expect(out).toContain('row "Kayıt 1"')
    expect(out).toContain('row "Kayıt 3"')
    expect(out).not.toContain('row "Kayıt 4"')
    expect(out).toContain('- … (+16 benzer row)')
    expect(out).toContain('row "Kayıt 20"')
    expect(out).toContain('    - rowgroup [ref=e4]:')
  })

  it('kısa dizilere ve farklı rollere dokunmaz', () => {
    const input = '- list:\n  - listitem "a"\n  - listitem "b"\n  - button "c"'
    expect(compressSnapshot(input)).toBe(input)
  })

  it('uzun metni kırpar, üst sınırda keser', () => {
    const long = 'x'.repeat(400)
    expect(compressSnapshot(`- paragraph "${long}"`)).toBe(`- paragraph "${'x'.repeat(120)}…"`)
    const many = Array.from({ length: 300 }, (_, i) => `- heading "Başlık ${i}"\n- paragraph "p"`).join('\n')
    expect(compressSnapshot(many, 500)).toMatch(/ağaç kırpıldı/)
  })
})

describe('diffSnapshot', () => {
  const before =
    '- main [ref=e1]:\n  - heading "Liste" [ref=e2]\n  - button "Ayrıntılar" [ref=e3]\n  - table [ref=e4]:\n    - row "A" [ref=e5]\n    - row "B" [ref=e6]'

  it('açılan pencereyi üst satırlarıyla birlikte, yalnız onu gönderir', () => {
    const after = `${before}\n  - dialog "Ayrıntı" [ref=e7]:\n    - paragraph [ref=e8]: "Durum: undefined"`
    const diff = diffSnapshot(before, after)
    expect(diff.mode).toBe('fark')
    expect(diff.text).toContain('- dialog "Ayrıntı" [ref=e7]:  ⟵ yeni')
    expect(diff.text).toContain('- main [ref=e1]:')
    expect(diff.text).not.toContain('row "A"')
  })

  it('değişmeyen ağaçta kısa not, sayfa büyük ölçüde değiştiyse tam ağaç döner', () => {
    expect(diffSnapshot(before, before)).toEqual({ mode: 'ayni', text: 'Ekranın ağacı değişmedi.' })
    const other =
      '- main [ref=e9]:\n  - heading "Başka sayfa" [ref=e10]\n  - form [ref=e11]:\n    - textbox "Ad" [ref=e12]'
    expect(diffSnapshot(before, other)).toEqual({ mode: 'tam', text: other })
  })
})

describe('sarmalayıcı atlama', () => {
  it('adsız tek çocuklu generic katmanları atlar, tıklanabilir olanı korur', () => {
    const input =
      '- generic [ref=e1]:\n  - generic [ref=e2]:\n    - button "Kaydet" [ref=e3]\n- generic [ref=e4] [cursor=pointer]:\n  - text: Aç'
    expect(compressSnapshot(input)).toBe(
      '- button "Kaydet" [ref=e3]\n- generic [ref=e4] [cursor=pointer]:\n  - text: Aç',
    )
  })
})

describe('ekran kimliği', () => {
  it('odak işareti ve içeriksiz satır ekranı değiştirmez; ref değişimi de (KOŞU ölçümü: Tab, aynı ekranı yeniden inceletiyordu)', () => {
    const before = [
      '- navigation [ref=e1]:',
      '  - link "Ana sayfa" [cursor=pointer] [ref=e2]:',
      '    - generic',
      '  - button "Kaydet" [ref=e3]',
    ].join('\n')
    const focused = [
      '- navigation [ref=e7]:',
      '  - link "Ana sayfa" [active] [cursor=pointer] [ref=e8]:',
      '      ',
      '  - button "Kaydet" [ref=e9]',
    ].join('\n')
    expect(changeSize(stableTree(before), stableTree(focused))).toBe(0)
    expect(changeSize(stableTree(before), stableTree(focused.replace('Kaydet', 'Sil')))).toBe(2)
  })
})

describe('ağaç sınırı', () => {
  it('uzun sayfanın alt bölümü kesilmez (eski 9 bin karakterlik sınır karnenin alt tablolarını saklıyordu)', () => {
    const sections = Array.from(
      { length: 300 },
      (_, i) => `- heading "Bölüm ${i}" [level=2] [ref=e${i}]\n- paragraph [ref=p${i}]: Açıklama metni ${i}`,
    )
    const out = compressSnapshot(sections.join('\n'))
    expect(out.length).toBeGreaterThan(9_000)
    expect(out).toContain('Bölüm 299')
    expect(out).not.toContain('kırpıldı')
  })
})

describe('kaydırma penceresi', () => {
  const tree = [
    '- main:',
    ...Array.from({ length: 200 }, (_, i) => `  - region "Bölüm ${i}":\n    - button "Düğme ${i}"`),
  ].join('\n')

  it('kısa ağaç olduğu gibi döner', () => {
    expect(windowSnapshot('- button "Kaydet"', 0.9, 9_000)).toBe('- button "Kaydet"')
  })

  it('uzun ağaçta kaydırma konumunun bölümünü üst satırlarıyla verir; gizlenen kısımları söyler', () => {
    const top = windowSnapshot(tree, 0, 2_000)
    expect(top).toContain('Düğme 0')
    expect(top).not.toContain('Düğme 199')
    expect(top).toContain('aşağı kaydırınca')
    const bottom = windowSnapshot(tree, 1, 2_000)
    expect(bottom).toContain('Düğme 199')
    expect(bottom).not.toContain('Düğme 0"')
    expect(bottom.startsWith('- main:')).toBe(true)
    expect(bottom).toContain('yukarı kaydırınca')
    expect(bottom.length).toBeLessThan(2_300)
  })
})

describe('etiketler', () => {
  it('ekrandaki kısa adları rolüyle tekil verir; satır metni, sayı ve tarih etiket sayılmaz', () => {
    const tree = [
      '- heading "Firma karnesi" [level=1] [ref=e1]',
      '- table [ref=e2]:',
      '  - row "Satış 91,2 Veri yok" [ref=e3]:',
      '    - columnheader "BAŞARI" [ref=e4]',
      '    - cell "Veri yok" [ref=e5]',
      '    - cell "91,2" [ref=e6]',
      '    - cell "12 Kas 2026" [ref=e7]',
      '- paragraph [ref=e8]: Verisi olmayan',
      '- dialog "Eğitim ayrıntısı" [ref=e11]:',
      '  - paragraph [ref=e12]: "Toplam: 5 kayıt"',
      '- button "Kaydet" [ref=e9]',
      '- button "Kaydet" [ref=e10]',
    ].join('\n')
    expect(labelsOf(tree)).toEqual([
      { role: 'heading', text: 'Firma karnesi' },
      { role: 'columnheader', text: 'BAŞARI' },
      { role: 'cell', text: 'Veri yok' },
      { role: 'paragraph', text: 'Verisi olmayan' },
      { role: 'dialog', text: 'Eğitim ayrıntısı' },
      { role: 'paragraph', text: 'Toplam: 5 kayıt' },
      { role: 'button', text: 'Kaydet' },
    ])
  })
})
