import { VOICE_NOTE } from './dictation'

/**
 * Girdi alanının görünümü (Claude masaüstündeki gibi): yazı alanı saydamdır, arkasındaki katman aynı metni biçimli
 * çizer. Bağlantılar mavi ve altı çizili; konuşmanın henüz kesinleşmemiş kısmı italik ve soluk; sesle yazılan girdinin
 * notu soluk. Bu modül metni bu parçalara ayırır; harf genişliği değişmeyen biçimler kullanılır (italik yalnız salt
 * okunur konuşma sırasında görünür), böylece imleç ve seçim metinle hizalı kalır.
 */
export type SegmentKind = 'metin' | 'baglanti' | 'gecici' | 'not'

export interface Segment {
  text: string
  kind: SegmentKind
}

/** Bağlantı; cümle sonundaki noktalama bağlantıya katılmaz. */
const URL_RE = /https?:\/\/[^\s<>"')]*[^\s<>"').,;:!?]/g

function links(text: string): Segment[] {
  const out: Segment[] = []
  let at = 0
  for (const match of text.matchAll(URL_RE)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), kind: 'metin' })
    out.push({ text: match[0], kind: 'baglanti' })
    at = match.index + match[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at), kind: 'metin' })
  return out
}

/** Metnin parçaları; `interim` konuşmanın geçici kısmıdır (notun hemen önünde ya da metnin sonunda duruyorsa). */
export function segments(text: string, interim: string): Segment[] {
  const noteAt = text.lastIndexOf(VOICE_NOTE)
  const body = noteAt >= 0 ? text.slice(0, noteAt) : text
  const gap = body.length - body.trimEnd().length
  const main = body.slice(0, body.length - gap)
  const live = interim && main.endsWith(interim) ? interim : ''
  return [
    ...links(main.slice(0, main.length - live.length)),
    ...(live ? [{ text: live, kind: 'gecici' as const }] : []),
    ...(gap ? [{ text: body.slice(body.length - gap), kind: 'metin' as const }] : []),
    ...(noteAt >= 0 ? [{ text: VOICE_NOTE, kind: 'not' as const }] : []),
  ]
}
