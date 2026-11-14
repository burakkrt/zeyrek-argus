import type { Issue, PageGroup, RunInfo } from '@argus/shared'

/**
 * Yeni koşu ekranının saf mantığı: derinlik ön ayarları, yapıştırılan bağlantıdan sayfa çözme, kapsam satırları ve geçmiş
 * koşulardan süre/maliyet tahmini. Bileşen yalnız bunları çağırır.
 */

export type DepthKey = 'hizli' | 'standart' | 'derin' | 'ozel'

export const DEPTHS: Array<{
  key: Exclude<DepthKey, 'ozel'>
  label: string
  hint: string
  maxTasks: number
  maxSteps: number
}> = [
  { key: 'hizli', label: 'Hızlı', hint: 'Açılış ve ana akış', maxTasks: 2, maxSteps: 6 },
  { key: 'standart', label: 'Standart', hint: 'Liste, filtre, form, pencere', maxTasks: 5, maxSteps: 10 },
  { key: 'derin', label: 'Derin', hint: 'Kenar durumlar ve tutarlılık', maxTasks: 8, maxSteps: 16 },
]

/** Sayılar bir ön ayara denk geliyorsa onun anahtarı, değilse `ozel`. */
export function depthOf(maxTasks: number, maxSteps: number): DepthKey {
  return DEPTHS.find((d) => d.maxTasks === maxTasks && d.maxSteps === maxSteps)?.key ?? 'ozel'
}

/** Bağlantı; cümle sonundaki noktalama bağlantıya katılmaz. */
const URL_RE = /https?:\/\/[^\s<>"')]*[^\s<>"').,;:!?]/g

/**
 * Metindeki bağlantıların gösterdiği sayfalar (katalogdaki slug'lar, metindeki sırayla, tekrarsız). Zeyrek adresi
 * `…/<proje>/<uygulama>/<slug>` biçimindedir (önünde dal ya da ortam öneki olabilir); yolun son parçası katalogda bir
 * sayfaysa eşlenir. Katalogda olmayan bağlantı yok sayılır.
 */
export function pagesFromLinks(text: string, groups: PageGroup[]): string[] {
  const known = new Set(groups.flatMap((g) => g.pages.map((p) => p.slug)))
  const found: string[] = []
  for (const raw of text.match(URL_RE) ?? []) {
    let segments: string[]
    try {
      segments = new URL(raw).pathname.split('/').filter(Boolean).map(decodeURIComponent)
    } catch {
      continue
    }
    const slug = [...segments].reverse().find((s) => known.has(s))
    if (slug && !found.includes(slug)) found.push(slug)
  }
  return found
}

/** Geçmiş yokken kullanılan birim (sayfa × görev başına). */
const FALLBACK = { minutes: 0.4, cost: 0.16 }

export interface Estimate {
  minutes: number
  cost: number
  /** `gecmis`: bu dalın biten koşularından; `varsayim`: geçmiş yok. */
  basis: 'gecmis' | 'varsayim'
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Süre ve maliyet tahmini: model çalıştırmış (maliyeti sıfırdan büyük) bitmiş son 20 koşunun "sayfa × görev" başına
 * süre ve maliyet medyanı, seçilen sayfa ve görev sayısıyla çarpılır. Modelsiz koşu (açılışta doğrulanıp biten) birimi
 * sıfıra çeker, sayılmaz. Adım sınırı görevin üst sınırıdır, ortalamayı az etkiler; hesaba katılmaz.
 */
export function estimateRun(history: RunInfo[], pages: number, maxTasks: number): Estimate | null {
  if (!pages) return null
  const units = history
    .filter((r) => r.status === 'bitti' && r.startedAt && r.finishedAt && (r.usage.costUsd ?? 0) > 0)
    .slice(0, 20)
    .map((r) => {
      const work = r.pages.length * Math.max(1, r.options.maxTasks)
      const minutes = (Date.parse(r.finishedAt!) - Date.parse(r.startedAt!)) / 60_000
      return { minutes: minutes / work, cost: r.usage.costUsd! / work }
    })
    .filter((u) => u.minutes > 0)
  const unit = units.length
    ? { minutes: median(units.map((u) => u.minutes)), cost: median(units.map((u) => u.cost)) }
    : FALLBACK
  const work = pages * maxTasks
  return { minutes: unit.minutes * work, cost: unit.cost * work, basis: units.length ? 'gecmis' : 'varsayim' }
}

/** Kapsam tablosunun satırı: katalogdaki sayfa + bu daldaki son koşusu ve uygulamadaki açık bulgu sayısı. */
export interface ScopeRow {
  id: string
  slug: string
  name: string
  module: string
  lastRun: string | null
  openIssues: number
}

const OPEN_STATUSES = new Set(['acik', 'duzeltilecek'])

/**
 * Sayfa kataloğundan kapsam satırları. Son koşu, sayfayı içeren en yeni koşunun başlangıcıdır (geçmiş en yeniden
 * eskiye gelir); açık bulgu, durumu "açık" ya da "düzeltilecek" olup sayfada görülen sorun sayısıdır.
 */
export function scopeRows(
  groups: PageGroup[],
  runs: Pick<RunInfo, 'pages' | 'createdAt' | 'startedAt'>[],
  issues: Pick<Issue, 'pages' | 'status'>[],
): ScopeRow[] {
  const lastRun = new Map<string, string>()
  for (const run of runs)
    for (const slug of run.pages) if (!lastRun.has(slug)) lastRun.set(slug, run.startedAt ?? run.createdAt)
  const open = new Map<string, number>()
  for (const issue of issues)
    if (OPEN_STATUSES.has(issue.status))
      for (const slug of new Set(issue.pages)) open.set(slug, (open.get(slug) ?? 0) + 1)
  return groups.flatMap((group) =>
    group.pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      name: page.name,
      module: group.key === '—' ? '' : group.key,
      lastRun: lastRun.get(page.slug) ?? null,
      openIssues: open.get(page.slug) ?? 0,
    })),
  )
}

/**
 * Koşuyu başlatmaya engel olan ilk eksik (Başlat düğmesi hep etkindir; tıklanınca bu bildirim olarak gösterilir).
 * Talimat ve ekler isteğe bağlıdır; yalnız kapsam zorunludur, yükleme sürerken ekler koşuya giremez.
 */
export function startProblem(input: {
  pages: number
  uploading: boolean
}): { title: string; message: string } | null {
  if (!input.pages)
    return {
      title: 'Kapsam seçilmedi',
      message:
        'Kapsam tablosundan test edilecek en az bir sayfa seç ya da talimata sayfa bağlantısı yapıştır.',
    }
  if (input.uploading)
    return { title: 'Dosyalar yükleniyor', message: 'Ekler yüklenince koşuyu yeniden başlat.' }
  return null
}
