/** Seçim kutularının seçeneği: değer, görünen ad ve sağda soluk bir ek bilgi. */
export interface Option {
  value: string
  label: string
  hint?: string
}

/** Türkçe büyük/küçük harf duyarsız karşılaştırma için normalleştirme ("İ" → "i", "I" → "ı"). */
const fold = (text: string) => text.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

/**
 * Aramalı seçimin süzgeci (bits-ui Command `filter` imzası): aranan her sözcük metinde geçiyorsa 1, değilse 0.
 * Varsayılan süzgeç Türkçe "İ/ı" ayrımını bilmez; "istanbul" araması "İSTANBUL"u bulmaz.
 */
export function turkishFilter(value: string, search: string, keywords: string[] = []): number {
  const haystack = fold([value, ...keywords].join(' '))
  const words = fold(search).split(' ').filter(Boolean)
  return words.every((w) => haystack.includes(w)) ? 1 : 0
}

/** Çoklu seçimin düğme metni: hiçbiri → yer tutucu, en çok iki → adlar, fazlası → "N seçili". */
export function summarizeSelection(options: Option[], values: string[], placeholder: string): string {
  if (!values.length) return placeholder
  const labels = values.map((v) => options.find((o) => o.value === v)?.label ?? v)
  return labels.length <= 2 ? labels.join(', ') : `${labels.length} seçili`
}
