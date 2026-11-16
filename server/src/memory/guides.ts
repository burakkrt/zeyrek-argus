import { parseDocument } from './frontmatter.ts'

/**
 * Test yöntemleri: testin nasıl yapılacağını anlatan, insanın yazıp geliştirdiği Markdown dosyaları
 * (`memory/test/*.md` platform geneli, `memory/apps/<p>/<u>/test/*.md` uygulama ve modül). Kodun içinde değil
 * hafızadadır: takım Git'te düzeltir, geliştirir. Ön bilgi: `kimlik` (dizinde ve seçimde kullanılan ad), `aciklama`
 * (tek satır), `her_kosu: evet` (her koşuda yüklenir). Planlayıcı yalnız dizini görür ve isteğe uyanları seçer; seçilen
 * yöntemler sabit bütçeyle sayfanın önbellekli talimatına girer. Araç kullanımı, güvenlik ve çıktı biçimi koddadır.
 */
export interface TestGuide {
  id: string
  description: string
  always: boolean
  body: string
  file: string
}

/** Dosya başına ve toplam karakter bütçesi: seçilen yöntemler istemi şişirmez. */
export const GUIDE_LIMITS = { file: 3_000, total: 10_000 }

export function parseGuide(file: string, text: string): TestGuide | null {
  const { data, body } = parseDocument(text)
  const id = typeof data.kimlik === 'string' ? data.kimlik.trim() : ''
  if (!/^[a-z0-9-]+$/.test(id) || !body.trim()) return null
  return {
    id,
    description: typeof data.aciklama === 'string' ? data.aciklama.trim() : '',
    always: data.her_kosu === 'evet',
    body: body.trim(),
    file,
  }
}

/** Planlayıcının gördüğü dizin: kimlik — açıklama (her koşu yüklenenler işaretli). */
export const guideIndex = (guides: TestGuide[]): string =>
  guides.map((g) => `- ${g.id} — ${g.description}${g.always ? ' (her koşuda)' : ''}`).join('\n')

/** Her koşu yüklenenler (önce) ve seçilenler (bilinmeyen kimlik düşer); genel ilke özelden önce okunur. */
export const chooseGuides = (guides: TestGuide[], ids: string[]): TestGuide[] => [
  ...guides.filter((g) => g.always),
  ...guides.filter((g) => !g.always && ids.includes(g.id)),
]

/** Seçilen yöntemlerin talimat metni; bütçeyi aşan dosya kesilir ve adı döner (koşu akışında söylenir). */
export function guidesText(chosen: TestGuide[]): { text: string; trimmed: string[] } {
  const trimmed: string[] = []
  let left = GUIDE_LIMITS.total
  const parts: string[] = []
  for (const guide of chosen) {
    const limit = Math.min(GUIDE_LIMITS.file, left)
    if (limit <= 0) {
      trimmed.push(guide.id)
      continue
    }
    const body = guide.body.length > limit ? `${guide.body.slice(0, limit)}\n… (kesildi)` : guide.body
    if (body !== guide.body) trimmed.push(guide.id)
    parts.push(`## Yöntem: ${guide.id}\n${body}`)
    left -= body.length
  }
  return {
    text: parts.length ? `# Bu koşunun test yöntemleri\n\n${parts.join('\n\n')}` : '',
    trimmed,
  }
}
