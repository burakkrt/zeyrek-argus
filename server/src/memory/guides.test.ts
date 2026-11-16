import { describe, expect, it } from 'vitest'
import { chooseGuides, GUIDE_LIMITS, guideIndex, guidesText, parseGuide, type TestGuide } from './guides.ts'

const doc = (id: string, extra = '', body = 'Gövde.') => `---\nkimlik: ${id}\naciklama: ${id} açıklaması\n${extra}---\n${body}\n`

describe('test yöntemleri', () => {
  it('ön bilgiden kimlik, açıklama ve her koşu işareti okunur; kimliksiz ya da gövdesiz dosya yok sayılır', () => {
    expect(parseGuide('test/genel.md', doc('genel', 'her_kosu: evet\n'))).toMatchObject({
      id: 'genel',
      description: 'genel açıklaması',
      always: true,
      body: 'Gövde.',
    })
    expect(parseGuide('test/x.md', '---\naciklama: kimliksiz\n---\nGövde')).toBeNull()
    expect(parseGuide('test/y.md', doc('Büyük Harf'))).toBeNull()
    expect(parseGuide('test/z.md', doc('bos', '', ''))).toBeNull()
  })

  it('planlayıcı dizini görür; her koşu yüklenenler ve seçilenler gelir, bilinmeyen kimlik düşer', () => {
    const guides = [
      parseGuide('a', doc('genel', 'her_kosu: evet\n'))!,
      parseGuide('b', doc('akis'))!,
      parseGuide('c', doc('arayuz'))!,
    ]
    expect(guideIndex(guides)).toBe(
      '- genel — genel açıklaması (her koşuda)\n- akis — akis açıklaması\n- arayuz — arayuz açıklaması',
    )
    expect(chooseGuides(guides, ['akis', 'yok']).map((g) => g.id)).toEqual(['genel', 'akis'])
  })

  it('metin bütçeyle sınırlıdır: uzun dosya kesilir, bütçe biterse sonrakiler girmez; ikisi de söylenir', () => {
    const big = (id: string): TestGuide => ({
      id,
      description: '',
      always: false,
      body: 'x'.repeat(GUIDE_LIMITS.file + 500),
      file: id,
    })
    const out = guidesText([big('a'), big('b'), big('c'), big('d')])
    expect(out.text.length).toBeLessThan(GUIDE_LIMITS.total + 400)
    expect(out.text).toContain('## Yöntem: a')
    expect(out.trimmed).toEqual(['a', 'b', 'c', 'd'])
    expect(guidesText([]).text).toBe('')
  })
})
