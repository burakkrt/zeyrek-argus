/**
 * Metin benzerliği (plan farkı ve değerlendirme kullanır): kısa olanın kelimelerinin çoğu (≥ %60) ötekinde de geçiyorsa
 * iki metin aynı şeyi anlatıyordur. Noktalama ve büyük/küçük harf yok sayılır (Türkçe kurallarıyla). Boş metin hiçbir
 * şeye benzemez.
 */
const norm = (text: string) => text.trim().replace(/\s+/g, ' ')

export const words = (text: string) =>
  new Set(
    norm(text)
      .toLocaleLowerCase('tr')
      .replace(/[.,;:!?()"'“”]/g, '')
      .split(' ')
      .filter(Boolean),
  )

export function similar(a: string, b: string, threshold = 0.6): boolean {
  const x = words(a)
  const y = words(b)
  if (!x.size || !y.size) return false
  let common = 0
  for (const w of x) if (y.has(w)) common += 1
  return common / Math.min(x.size, y.size) >= threshold
}
