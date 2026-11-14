/**
 * Ek bileşeninin (`components/form/Attachments.svelte`) saf mantığı: dosya türü ailesi (kart ikonunun etiketi ve
 * rengi; platformun `attachments-logic.ts` › `FILE_FAMILIES` renkleri), boyut metni ve seçilen dosyaların sınıra göre
 * ayrılması.
 */

const FAMILIES: Array<{ extensions: string[]; color: string; image?: boolean }> = [
  { extensions: ['doc', 'docx', 'odt', 'rtf'], color: '#2563EB' },
  { extensions: ['xls', 'xlsx', 'ods', 'csv'], color: '#0F766E' },
  { extensions: ['ppt', 'pptx', 'odp'], color: '#EA580C' },
  { extensions: ['pdf'], color: '#DC2626' },
  { extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'], color: '#7C3AED', image: true },
]
const OTHER = '#6B7280'

export const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''

/** Kart ikonunun etiketi (en çok 5 harf, büyük) ve aile rengi; görsel mi. */
export function fileKind(name: string): { label: string; color: string; image: boolean } {
  const ext = extensionOf(name)
  const family = FAMILIES.find((f) => f.extensions.includes(ext))
  return {
    label: ext.slice(0, 5).toLocaleUpperCase('en'),
    color: family?.color ?? OTHER,
    image: !!family?.image,
  }
}

/** "12 KB", "1,4 MB" (Türkçe ondalık). */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`
}

/**
 * Seçilen dosyaları ayırır: kabul edilen uzantı ve boyuttakiler sınır dolana kadar alınır; gerisi nedeniyle reddedilir
 * (sunucu yine denetler, bu yalnız anında geri bildirim içindir).
 */
export function partitionFiles<F extends { name: string; size: number }>(
  files: F[],
  options: { accept: string[]; maxBytes: number; room: number },
): { take: F[]; rejected: Array<{ name: string; reason: 'tur' | 'boyut' | 'sinir' }> } {
  const take: F[] = []
  const rejected: Array<{ name: string; reason: 'tur' | 'boyut' | 'sinir' }> = []
  for (const file of files) {
    if (!options.accept.includes(extensionOf(file.name))) rejected.push({ name: file.name, reason: 'tur' })
    else if (file.size > options.maxBytes) rejected.push({ name: file.name, reason: 'boyut' })
    else if (take.length >= options.room) rejected.push({ name: file.name, reason: 'sinir' })
    else take.push(file)
  }
  return { take, rejected }
}
