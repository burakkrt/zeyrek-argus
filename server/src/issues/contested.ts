import type { IssueHistoryEntry, IssueStatus } from '@argus/shared'

const VERDICT: Partial<Record<IssueStatus, 'gercek' | 'degil'>> = {
  acik: 'gercek',
  duzeltilecek: 'gercek',
  'bulgu-degil': 'degil',
}

/**
 * İki insan sorunun gerçek olup olmadığında ayrışıyor: kişilerin son hükümleri zıt. Tartışmalı sorun bastırılmaz ve
 * öğrenmeye girmez; ayrışan kişi hükmünü değiştirince (ya da karşı hükmü onaylayınca) çözülür. Kişinin kendi hükmünü
 * yinelemesi tartışmayı çözmez.
 */
export function isContested(history: IssueHistoryEntry[]): boolean {
  const latest = new Map<string, 'gercek' | 'degil'>()
  for (const h of history) {
    const verdict = VERDICT[h.to]
    if (verdict && h.author !== 'Argus') latest.set(h.author, verdict)
  }
  return new Set(latest.values()).size > 1
}
