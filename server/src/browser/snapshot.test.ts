import { describe, expect, it } from 'vitest'
import { compressSnapshot, diffSnapshot } from './snapshot.ts'

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
