import type { RunStrategy, StrategyItem } from '@argus/shared'
import { scenarioParts } from './plan'
import { similar } from './similar'

/**
 * İki plan sürümünün farkı. Plan sayfası iki yerde kullanır: düzenletmeden sonra Argus'un neyi değiştirdiğini işaretler
 * (önceki sürüm → şimdiki plan) ve düzenletmeden önce insanın elle yaptığı değişiklikleri listeler (Argus'un yazdığı
 * plan → şimdiki plan). Planlayıcı planı baştan yazdığı için öğelerin kimliği yoktur; eşleştirme sırasıyla: birebir aynı
 * öğe "aynı", aynı başlıklı (senaryoda aynı durumlu) ya da kısa olanın kelimelerinin çoğu ötekinde de geçen öğe "değişti", eşi olmayan "yeni";
 * öncekinde eşi kalmayan "silindi". Boşluk farkı değişiklik sayılmaz; başlığı boş vaka ve boş satır (kayıtta atılır)
 * hesaba girmez.
 *
 * Düzenletmeden sonraki işaretler (`revisionMarks`) yalnız Argus'un değişikliğidir: önceki sürüm ile Argus'un yeni
 * yazdığı plan karşılaştırılır, sonuç şimdiki plana (elle düzenlemeleriyle) taşınır. Elle eklenen öğe işaretsiz kalır;
 * Argus'un eklediği öğe elle düzeltilse de "yeni" kalır.
 */
export type ChangeKind = 'yeni' | 'degisti' | 'ayni'

export interface Change<T> {
  kind: ChangeKind
  /** Değişen öğenin önceki hâli; yeni ve aynı öğede null. */
  before: T | null
  /** Eşleştiği öğenin önceki listedeki sırası; yeni öğede null. */
  from: number | null
}

export interface PlanDiff {
  /** Kapsam değiştiyse önceki metni, değişmediyse null. */
  understood: string | null
  doneWhen: string | null
  /** Şimdiki planın sırasıyla hizalı. */
  items: Change<StrategyItem>[]
  scenarios: Change<string>[]
  known: Change<string>[]
  infeasible: Change<string>[]
  removed: { items: StrategyItem[]; scenarios: string[]; known: string[]; infeasible: string[] }
}

const norm = (text: string) => text.trim().replace(/\s+/g, ' ')

const NEW = { kind: 'yeni', before: null, from: null } as const

function matchList<T>(
  before: Array<{ item: T; at: number }>,
  after: T[],
  key: (item: T) => string,
  label: (item: T) => string,
  text: (item: T) => string = key,
): { changes: Change<T>[]; removed: T[] } {
  const free = before.map((b) => ({ ...b, used: false }))
  const changes: Change<T>[] = after.map(() => NEW)
  const passes: Array<[(a: T, b: T) => boolean, ChangeKind]> = [
    [(a, b) => key(a) === key(b), 'ayni'],
    [(a, b) => !!label(a) && label(a) === label(b), 'degisti'],
    [(a, b) => similar(text(a), text(b)), 'degisti'],
  ]
  for (const [same, kind] of passes) {
    after.forEach((item, i) => {
      if (changes[i]!.kind !== 'yeni') return
      const match = free.find((f) => !f.used && same(f.item, item))
      if (!match) return
      match.used = true
      changes[i] = { kind, before: kind === 'ayni' ? null : match.item, from: match.at }
    })
  }
  return { changes, removed: free.filter((f) => !f.used).map((f) => f.item) }
}

const itemKey = (item: StrategyItem) =>
  [norm(item.title), norm(item.goal), item.source, item.page ?? '', item.excluded ? 'disarida' : ''].join('\u0000')
const textOnly = (item: StrategyItem) => `${item.title} ${item.goal}`

export function planDiff(before: RunStrategy, after: RunStrategy): PlanDiff {
  const indexed = <T>(list: T[], keep: (item: T) => boolean) =>
    list.map((item, at) => ({ item, at })).filter((b) => keep(b.item))
  // Sonuç şimdiki planın bütün satırlarıyla hizalıdır; başlığı boş (henüz yazılan) vaka ve boş satır "yeni"dir.
  const aligned = <T>(list: T[], keep: (item: T) => boolean, m: { changes: Change<T>[] }) => {
    const kept = indexed(list, keep)
    return list.map((_, i) => {
      const at = kept.findIndex((k) => k.at === i)
      return at < 0 ? (NEW as Change<T>) : m.changes[at]!
    })
  }
  const hasTitle = (i: StrategyItem) => !!norm(i.title)
  const hasText = (t: string) => !!norm(t)
  // Benzerlik metinle bakılır: kaynak ya da sayfa değişse de aynı vaka bulunur.
  const itemMatch = matchList(
    indexed(before.items, hasTitle),
    after.items.filter(hasTitle),
    itemKey,
    (i) => norm(i.title),
    textOnly,
  )
  const itemChanges = aligned(after.items, hasTitle, itemMatch)
  const textList = (b: string[], a: string[], label: (t: string) => string) => {
    const m = matchList(indexed(b, hasText), a.filter(hasText), norm, label)
    return { changes: aligned(a, hasText, m), removed: m.removed }
  }
  const scenarios = textList(before.scenarios, after.scenarios, (t) => norm(scenarioParts(t).name))
  const known = textList(before.known, after.known, () => '')
  const infeasible = textList(before.infeasible, after.infeasible, () => '')
  return {
    understood: norm(before.understood) === norm(after.understood) ? null : before.understood,
    doneWhen: norm(before.doneWhen) === norm(after.doneWhen) ? null : before.doneWhen,
    items: itemChanges,
    scenarios: scenarios.changes,
    known: known.changes,
    infeasible: infeasible.changes,
    removed: { items: itemMatch.removed, scenarios: scenarios.removed, known: known.removed, infeasible: infeasible.removed },
  }
}

/** Düzenletmeden sonraki işaretler: Argus'un değişikliği (önceki → Argus'un yazdığı), şimdiki plana taşınmış. */
export function revisionMarks(previous: RunStrategy, base: RunStrategy, plan: RunStrategy): PlanDiff {
  const argus = planDiff(previous, base)
  const manual = planDiff(base, plan)
  const carry = <T>(own: Change<T>[], from: Change<T>[]) =>
    own.map((m) => (m.from === null ? ({ kind: 'ayni', before: null, from: null } as Change<T>) : from[m.from]!))
  return {
    understood: argus.understood,
    doneWhen: argus.doneWhen,
    items: carry(manual.items, argus.items),
    scenarios: carry(manual.scenarios, argus.scenarios),
    known: carry(manual.known, argus.known),
    infeasible: carry(manual.infeasible, argus.infeasible),
    removed: argus.removed,
  }
}

/** Farkın insan diliyle satırları (düzenletmeden önceki onay penceresi: "elle yaptığın değişiklikler gidecek"). */
export function changeLines(diff: PlanDiff, after: RunStrategy): string[] {
  const out: string[] = []
  if (diff.understood !== null) out.push('Kapsam değiştirildi')
  after.items.forEach((item, i) => {
    const change = diff.items[i]!
    if (!norm(item.title) || change.kind === 'ayni') return
    if (change.kind === 'yeni') return out.push(`Vaka eklendi: ${norm(item.title)}`)
    const before = change.before!
    const onlyInclusion = itemKey({ ...before, excluded: item.excluded }) === itemKey(item)
    if (onlyInclusion)
      return out.push(`${item.excluded ? 'Vaka koşudan çıkarıldı' : 'Vaka koşuya geri alındı'}: ${norm(item.title)}`)
    out.push(`Vaka değiştirildi: ${norm(item.title)}`)
  })
  for (const item of diff.removed.items) out.push(`Vaka silindi: ${norm(item.title)}`)
  const named = (t: string) => norm(scenarioParts(t).name) || norm(t)
  after.scenarios.forEach((t, i) => {
    const kind = diff.scenarios[i]!.kind
    if (!norm(t) || kind === 'ayni') return
    out.push(`${kind === 'yeni' ? 'Senaryo eklendi' : 'Senaryo değiştirildi'}: ${named(t)}`)
  })
  for (const t of diff.removed.scenarios) out.push(`Senaryo silindi: ${named(t)}`)
  if (diff.doneWhen !== null) out.push('Bitiş ölçütü değiştirildi')
  const notes = [
    ['known', 'Öğrenilen kural'],
    ['infeasible', 'Yapılamayacak madde'],
  ] as const
  for (const [key, name] of notes) {
    const changed = diff[key].filter((c, i) => norm(after[key][i]!) && c.kind === 'degisti').length
    const added = diff[key].filter((c, i) => norm(after[key][i]!) && c.kind === 'yeni').length
    if (added) out.push(`${name} eklendi (${added})`)
    if (changed) out.push(`${name} değiştirildi (${changed})`)
    if (diff.removed[key].length) out.push(`${name} silindi (${diff.removed[key].length})`)
  }
  return out
}
