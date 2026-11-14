import type { IconName } from './icons'
import { turkishFilter } from './components/form/options'

/**
 * Uygulamanın menü ağacı: kenar menü, iz, komut paleti ve sekme başlığı bu tablodan okunur. Düzen IMS Cortex
 * menüsünündür: büyük harfli başlıklı gruplar; üstte çalışma sayfaları, dipte Sistem. Bir öğe ya sayfadır (`path`) ya da
 * alt sayfaları olan modüldür (`children`, akordeon).
 */
export interface NavPage {
  path: string
  label: string
}

export interface NavEntry {
  label: string
  icon: IconName
  path?: string
  children?: NavPage[]
}

export interface NavGroup {
  label?: string
  /** `bottom`: grup menünün dibine yaslanır (Sistem). */
  placement?: 'bottom'
  entries: NavEntry[]
}

export const HOME = 'genel'
export const HOME_LABEL = 'Ana sayfa'
export const APP_NAME = 'Zeyrek Argus'

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Kalite kontrol',
    entries: [
      { path: 'genel', label: HOME_LABEL, icon: 'squaresFour' },
      {
        label: 'Koşular',
        icon: 'playCircle',
        children: [
          { path: 'baslat', label: 'Yeni koşu' },
          { path: 'kosular', label: 'Koşu geçmişi' },
        ],
      },
      { path: 'bulgular', label: 'Bulgular', icon: 'bug' },
    ],
  },
  {
    label: 'Sistem',
    placement: 'bottom',
    entries: [
      { path: 'ayarlar', label: 'Ayarlar', icon: 'gear' },
      { path: 'hafiza', label: 'Hafıza', icon: 'brain' },
    ],
  },
]

/** Menüde olmayan sayfalar (bir kayıttan açılanlar) ve bağlı oldukları modül. */
const OTHER: Record<string, { label: string; module: string }> = {
  monitor: { label: 'Canlı koşu', module: 'Koşular' },
}

/** Sayfanın menüdeki yeri: modülü (varsa) ve adı. Bilinmeyen sayfa ana sayfadır. */
export function locate(
  path: string | undefined,
  groups: NavGroup[] = NAV_GROUPS,
): { module?: string; label: string } {
  if (path && OTHER[path]) return OTHER[path]
  for (const entry of groups.flatMap((g) => g.entries)) {
    if (entry.path && entry.path === path) return { label: entry.label }
    const child = entry.children?.find((c) => c.path === path)
    if (child) return { module: entry.label, label: child.label }
  }
  return { label: HOME_LABEL }
}

/** İz her zaman ana sayfadan başlar: Ana sayfa › modül › sayfa (ana sayfada yalnız kendisi). */
export function crumbsFor(path: string | undefined): string[] {
  const place = locate(path)
  if (!place.module && place.label === HOME_LABEL) return [HOME_LABEL]
  return [HOME_LABEL, ...(place.module ? [place.module] : []), place.label]
}

/** Tarayıcı sekmesinin başlığı, tek biçim: "Sayfa | Zeyrek Argus". */
export const documentTitle = (path: string | undefined) => `${locate(path).label} | ${APP_NAME}`

/**
 * Menü araması: modül adı eşleşirse bütün alt sayfalarıyla, değilse yalnız eşleşen alt sayfalarıyla kalır; boş kalan
 * grup düşer. Türkçe harf duyarlıdır ("İ"/"ı").
 */
export function filterNav(groups: NavGroup[], query: string): NavGroup[] {
  if (!query.trim()) return groups
  const hit = (text: string) => turkishFilter(text, query) === 1
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.flatMap((entry): NavEntry[] => {
        if (hit(entry.label)) return [entry]
        const children = entry.children?.filter((c) => hit(c.label))
        return children?.length ? [{ ...entry, children }] : []
      }),
    }))
    .filter((group) => group.entries.length)
}
