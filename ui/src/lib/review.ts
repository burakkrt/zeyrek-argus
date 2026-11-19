import type { FindingKind, Issue, IssueStatus, RunInfo } from '@argus/shared'

/**
 * Koşu onayı panosu: koşunun bulgularına insan karar verir. Sütunlar insanın kararıdır (fiil adıyla): Argus'un tespit
 * türleri (Bulgu, Tutarsızlık, Şüphe) kartın üstündeki etikette kalır; ikisi aynı adı taşısaydı karışıyordu. Karar
 * sorunun durumudur: bekliyor = açık, onaylandı = düzeltilecek (düzeldi de burada durur), reddedildi = bulgu değil
 * (Argus bu türü öğrenir). Belirsiz: insan bulguyu anlamadı ve sorusunu yazdı; durum açık kalır, netleştirme adımında
 * Argus kartı sorusuna göre yeniden yazar ve kart İnceleme bekliyor'a döner (değerlendirmenin ikinci turu).
 */
export const COLUMNS = [
  { id: 'bekliyor', title: 'İnceleme bekliyor', hint: 'Henüz karar verilmedi', status: 'acik' },
  { id: 'belirsiz', title: 'Belirsiz', hint: 'Anlaşılmadı; Argus netleştirecek', status: 'acik' },
  { id: 'onay', title: 'Onaylandı', hint: 'Gerçek sorun, düzeltilecek', status: 'duzeltilecek' },
  { id: 'ret', title: 'Reddedildi', hint: 'Sorun değil, Argus bu türü öğrenir', status: 'bulgu-degil' },
] as const satisfies ReadonlyArray<{ id: string; title: string; hint: string; status: IssueStatus }>

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
      : 'onay'

export const statusOf = (column: ColumnId): IssueStatus => COLUMNS.find((c) => c.id === column)!.status

/** Karta bırakmak durumu değiştirir mi: aynı sütuna bırakmak (düzeldi → onaylandı dahil) karar sayılmaz. */
export const changes = (issue: Pick<Issue, 'status' | 'unclear'>, column: ColumnId): boolean =>
  columnOf(issue) !== column

/** Sütunlara dağıtım: önce ağır önem, aynı önemde başlık sırası. */
export function board(issues: Issue[]): Record<ColumnId, Issue[]> {
  const out: Record<ColumnId, Issue[]> = { bekliyor: [], belirsiz: [], onay: [], ret: [] }
  const sorted = [...issues].sort(
    (a, b) => a.severity.localeCompare(b.severity) || a.title.localeCompare(b.title, 'tr'),
  )
  for (const issue of sorted) out[columnOf(issue)].push(issue)
  return out
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
  if (run.review.unclear) return `${run.review.unclear} belirsiz bulgu var: önce netleştirin.`
  if (run.review.pending) return `Kapatmak için ${run.review.pending} karar kaldı.`
  return null
}

/** Yönlendir ve sürdür: koşu ve devam koşuları bitmiş ve koşu kapatılmamış olmalı. */
export const canContinue = (run: Gate): boolean =>
  !run.closedAt && finished(run) && run.continuations.every(finished)
