import { DISMISS_REASONS, type DismissReason, type FindingKind, type Issue, type IssueStatus, type RunInfo } from '@argus/shared'
import { similar } from './similar'

/**
 * Koşu onayı panosu: koşunun bulgularına insan karar verir. Karar iki sorunun cevabıdır: gerçek bir sorun mu, gerçekse
 * ne yapılsın. Sütunlar kararın kendisidir; Argus'un tespit türü (Bulgu, Tutarsızlık, Şüphe) kartın etiketinde kalır.
 * - Düzeltilecek: gerçek, düzeltilsin (düzeldi de burada durur).
 * - Bilerek böyle: gerçek ama bu uygulamada kabul edildi; bir daha bulgu sayılmaz (onaylı kuralla).
 * - Bulgu değil: yanlış tespit; nedeni tek tıkla seçilir (öğrenmeye etkisi nedene göredir).
 * - Anlamadım (kod adı `belirsiz`): soru yazıldı; netleştirmede Argus yeniden yazar, kart İnceleme bekliyor'a döner.
 * Sıra: bekleyen solda, kararlar ortada, anlaşılmayan en sağda.
 */
export const COLUMNS = [
  { id: 'bekliyor', title: 'İnceleme bekliyor', hint: 'Henüz karar verilmedi', status: 'acik' },
  { id: 'onay', title: 'Düzeltilecek', hint: 'Gerçek sorun, düzeltilsin', status: 'duzeltilecek' },
  { id: 'kabul', title: 'Bilerek böyle', hint: 'Gerçek ama böyle kalsın', status: 'kabul-edildi' },
  { id: 'ret', title: 'Bulgu değil', hint: 'Yanlış tespit; nedeni öğrenilir', status: 'bulgu-degil' },
  { id: 'belirsiz', title: 'Anlamadım', hint: 'Sorunu yazdın; Argus netleştirecek', status: 'acik' },
] as const satisfies ReadonlyArray<{ id: string; title: string; hint: string; status: IssueStatus }>

/** Karar tuşları (çekmece ve triyaj kipi): tek tuş, tek karar. */
export const DECISIONS = [
  { column: 'onay', key: 'd', label: 'Düzelt' },
  { column: 'kabul', key: 'b', label: 'Bilerek böyle' },
  { column: 'ret', key: 'r', label: 'Bulgu değil' },
  { column: 'belirsiz', key: 'a', label: 'Anlamadım' },
] as const

export type ColumnId = (typeof COLUMNS)[number]['id']

/** Argus'un tespit türü (kartın etiketi). */
export const KIND: Record<FindingKind, string> = { kesin: 'Bulgu', tutarsizlik: 'Tutarsızlık', not: 'Şüphe' }

export const columnOf = (issue: Pick<Issue, 'status' | 'unclear'>): ColumnId =>
  issue.status === 'acik'
    ? issue.unclear
      ? 'belirsiz'
      : 'bekliyor'
    : issue.status === 'bulgu-degil'
      ? 'ret'
      : issue.status === 'kabul-edildi'
        ? 'kabul'
        : 'onay'

export const statusOf = (column: ColumnId): IssueStatus => COLUMNS.find((c) => c.id === column)!.status

/** Karta bırakmak durumu değiştirir mi: aynı sütuna bırakmak (düzeldi → onaylandı dahil) karar sayılmaz. */
export const changes = (issue: Pick<Issue, 'status' | 'unclear'>, column: ColumnId): boolean =>
  columnOf(issue) !== column

/** Sütunlara dağıtım: önce ağır önem, aynı önemde başlık sırası. */
export function board(issues: Issue[]): Record<ColumnId, Issue[]> {
  const out: Record<ColumnId, Issue[]> = { bekliyor: [], onay: [], kabul: [], ret: [], belirsiz: [] }
  const sorted = [...issues].sort(
    (a, b) => a.severity.localeCompare(b.severity) || a.title.localeCompare(b.title, 'tr'),
  )
  for (const issue of sorted) out[columnOf(issue)].push(issue)
  return out
}

/**
 * Bekleyen karta benzeyen bekleyen kartlar (aynı tür, başlığı benzer): çekmecede "benzerlerine de uygula" ile tek kararda
 * birlikte karara bağlanır. Toplu karar yalnız insan onaylayınca uygulanır.
 */
export function similarPending(issue: Issue, issues: Issue[]): Issue[] {
  return issues.filter(
    (other) =>
      other.id !== issue.id &&
      columnOf(other) === 'bekliyor' &&
      other.kind === issue.kind &&
      similar(other.title, issue.title),
  )
}

/**
 * Geçmiş karara dayalı öneri: aynı türde, başlığı benzer, daha önce karar verilmiş en yakın sorun. Öneri asla
 * kendiliğinden uygulanmaz; insan tek tuşla kabul eder ya da başka karar verir (otomasyon yanlılığına karşı her karar
 * aynı kolaylıktadır).
 */
export function suggestionFor(
  issue: Issue,
  decided: Issue[],
): { status: IssueStatus; title: string } | null {
  const match = decided.find(
    (d) =>
      d.id !== issue.id &&
      d.status !== 'acik' &&
      d.status !== 'duzeldi' &&
      d.kind === issue.kind &&
      similar(d.title, issue.title),
  )
  return match ? { status: match.status, title: match.title } : null
}

/**
 * Triyaj sırası: önce önerisi olmayanlar (Argus'un en az emin olduğu), içlerinde ağır önem önce; en sonda geçmiş
 * karara benzeyenler. Benzer kartlar art arda gelir (aynı kararı tek tek verirken bağlam kaybolmaz).
 */
export function triageQueue(pending: Issue[], decided: Issue[]): Issue[] {
  const rank = (i: Issue) => (suggestionFor(i, decided) ? 1 : 0)
  const sorted = [...pending].sort(
    (a, b) => rank(a) - rank(b) || a.severity.localeCompare(b.severity) || a.title.localeCompare(b.title, 'tr'),
  )
  const out: Issue[] = []
  for (const issue of sorted) {
    if (out.includes(issue)) continue
    out.push(issue, ...sorted.filter((o) => !out.includes(o) && o !== issue && o.kind === issue.kind && similar(o.title, issue.title)))
  }
  return out
}

/** Art arda bu kadar karar öneriyle aynıysa insana hatırlatılır (körü körüne kabul işareti). */
export const STAMP_STREAK = 10

/** Öneriyle aynı kararların art arda sayısı: öneri yoksa ya da karar farklıysa sıfırlanır. */
export const stampStreak = (streak: number, suggested: IssueStatus | null, chosen: IssueStatus): number =>
  suggested !== null && suggested === chosen ? streak + 1 : 0

/** "Bulgu değil" nedenlerinin öğrenmeye etkisi (seçim penceresinde ve triyajda nedenin altında). */
export const REASON_HINT: Record<DismissReason, string> = {
  'davranis-dogru': 'Uygulama böyle çalışmalı; Argus bu türü öğrenir.',
  'yanlis-gozlem': 'Argus yanlış gördü (sayfa yükleniyordu, yanlış yere baktı); kural çıkmaz.',
  'kural-yanlis': "Argus'un dayandığı kural hatalı; kural düzeltilir.",
  'kapsam-disi': 'Bu koşunun konusu değil; kural çıkmaz.',
}

export type TriageAction =
  | { type: 'decide'; column: 'onay' | 'kabul' | 'belirsiz' }
  | { type: 'dismiss'; reason: DismissReason }
  | { type: 'ask-reason' }
  | { type: 'cancel' }
  | { type: 'edit' }
  | { type: 'step'; by: 1 | -1 }
  | { type: 'undo' }

/**
 * Triyaj kipinin tuşları: D düzelt, B bilerek böyle, R bulgu değil (ardından 1-4 neden), A anlamadım, E çözümü düzenle,
 * ←/→ önceki/sonraki kart, Z geri al. Neden beklenirken yalnız 1-4 ve Esc geçerlidir.
 */
export function triageKey(key: string, pickingReason: boolean): TriageAction | null {
  if (pickingReason) {
    const reason = DISMISS_REASONS[Number(key) - 1]
    if (reason) return { type: 'dismiss', reason }
    return key === 'Escape' ? { type: 'cancel' } : null
  }
  switch (key.toLocaleLowerCase('tr')) {
    case 'd':
      return { type: 'decide', column: 'onay' }
    case 'b':
      return { type: 'decide', column: 'kabul' }
    case 'a':
      return { type: 'decide', column: 'belirsiz' }
    case 'r':
      return { type: 'ask-reason' }
    case 'e':
      return { type: 'edit' }
    case 'z':
      return { type: 'undo' }
    case 'arrowright':
      return { type: 'step', by: 1 }
    case 'arrowleft':
      return { type: 'step', by: -1 }
    default:
      return null
  }
}

/** Önceki bir koşuda da görülmüş sorun (kararı varsa onunla gelir). */
export const seenBefore = (issue: Pick<Issue, 'firstSeen'>, run: Pick<RunInfo, 'startedAt'>): boolean =>
  !!run.startedAt && issue.firstSeen < run.startedAt

export const finished = (run: Pick<RunInfo, 'status'>): boolean =>
  run.status !== 'sirada' && run.status !== 'calisiyor'

type Gate = Pick<RunInfo, 'status' | 'review' | 'closedAt' | 'continuations'>

/** Koşunun ailesi: ana koşu ve devam koşuları (bulguları tek panoda toplanır). */
export const family = (run: Pick<RunInfo, 'id' | 'continuations'>): string[] => [
  run.id,
  ...run.continuations.map((c) => c.id),
]

/** Kapatma kapısı: koşu ve devam koşuları bitmiş, bekleyen karar yok ve henüz kapatılmamış. */
export function closeBlocker(run: Gate): string | null {
  if (run.closedAt) return 'Koşu kapatıldı.'
  if (!finished(run)) return 'Koşu bitince kapatılabilir.'
  if (!run.continuations.every(finished)) return 'Devam koşusu bitince kapatılabilir.'
  if (run.review.unclear) return `Anlamadığın ${run.review.unclear} bulgu var: önce netleştir.`
  if (run.review.pending) return `Kapatmak için ${run.review.pending} karar kaldı.`
  return null
}

/** Yönlendir ve sürdür: koşu ve devam koşuları bitmiş ve koşu kapatılmamış olmalı. */
export const canContinue = (run: Gate): boolean =>
  !run.closedAt && finished(run) && run.continuations.every(finished)
