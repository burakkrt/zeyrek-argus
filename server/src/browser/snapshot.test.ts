import { describe, expect, it } from 'vitest'
import { compressSnapshot } from './snapshot.ts'

describe('compressSnapshot', () => {
  it('uzun satır dizisini ilk dört + sonuncu olarak özetler, iç içe yapıyı korur', () => {
    const rows = Array.from(
      { length: 20 },
      (_, i) => `      - row "Kayıt ${i + 1}" [ref=e${i + 10}]:\n        - cell "${i + 1}"`,
    ).join('\n')
    const input = `- main [ref=e1]:\n  - heading "Liste" [level=1] [ref=e2]\n  - table [ref=e3]:\n    - rowgroup [ref=e4]:\n${rows}`
    const out = compressSnapshot(input)
    expect(out).toContain('row "Kayıt 1"')
    expect(out).toContain('row "Kayıt 4"')
    expect(out).not.toContain('row "Kayıt 5"')
    expect(out).toContain('- … (+15 benzer row)')
    expect(out).toContain('row "Kayıt 20"')
    expect(out).toContain('    - rowgroup [ref=e4]:')
  })

  it('kısa dizilere ve farklı rollere dokunmaz', () => {
    const input = '- list:\n  - listitem "a"\n  - listitem "b"\n  - button "c"'
    expect(compressSnapshot(input)).toBe(input)
  })

  it('uzun metni kırpar, üst sınırda keser', () => {
    const long = 'x'.repeat(400)
    expect(compressSnapshot(`- paragraph "${long}"`)).toBe(`- paragraph "${'x'.repeat(160)}…"`)
    const many = Array.from({ length: 300 }, (_, i) => `- heading "Başlık ${i}"\n- paragraph "p"`).join('\n')
    expect(compressSnapshot(many, 500)).toMatch(/ağaç kırpıldı/)
  })
})
