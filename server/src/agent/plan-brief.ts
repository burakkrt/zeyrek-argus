import type { ItemSource, RunStrategy } from '@argus/shared'

/**
 * Plan düzenleme isteği (Plan adımı → "Planı düzenlet"): planlayıcı planı baştan yazar, ama asıl isteğin yanında
 * kendi yazdığı önceki taslağı (elle düzenlemeler düzenletmede bırakılır) ve kullanıcının ne istediğini de görür. İstek ya da
 * önceki plan yoksa asıl istek olduğu gibi gider.
 */
export function revisionBrief(brief: string | null, plan: RunStrategy | null, feedback: string | null): string {
  const base = brief ?? ''
  if (!plan || !feedback?.trim()) return base
  return [
    base,
    '',
    'ÖNCEKİ TASLAK PLAN (senin yazdığın; kullanıcı gördü):',
    `Kapsam: ${plan.understood}`,
    'Senaryolar:',
    ...plan.scenarios.map((s) => `- ${s}`),
    `Tamam sayılır: ${plan.doneWhen}`,
    'Vakalar:',
    ...plan.items.map(
      (item, i) =>
        `${i + 1}. ${item.title} (${item.source}${item.page ? `, ${item.page}` : ''}): ${item.goal}${item.excluded ? ' [kullanıcı koşudan çıkardı]' : ''}`,
    ),
    '',
    `KULLANICININ DÜZENLEME İSTEĞİ: ${feedback.trim()}`,
    'Planı bu isteğe göre yeniden yaz; istekle çelişmeyen önceki kararları koru.',
  ].join('\n')
}

const SOURCES: ItemSource[] = ['ekran', 'tanim', 'ikisi']
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const list = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : [])

/**
 * İnsanın Plan adımında elle düzenlediği plan: boş vaka, boş senaryo ve boş not atılır, metinler kırpılır, bilinmeyen
 * kaynak "ikisi" olur, tanım vakasının sayfası yoktur; koşudan çıkarılan vaka işaretini korur. Kapsam türü ve test
 * yöntemleri planlayıcınındır, olduğu gibi kalır.
 */
export function sanitizePlan(plan: RunStrategy): RunStrategy {
  return {
    ...plan,
    understood: text(plan.understood),
    scenarios: list(plan.scenarios),
    doneWhen: text(plan.doneWhen),
    known: list(plan.known),
    infeasible: list(plan.infeasible),
    items: (Array.isArray(plan.items) ? plan.items : [])
      .filter((item) => text(item?.title))
      .map((item) => {
        const source = SOURCES.includes(item.source) ? item.source : 'ikisi'
        return {
          title: text(item.title),
          goal: text(item.goal),
          source,
          page: source === 'tanim' ? null : text(item.page) || null,
          fullScan: item.fullScan === true,
          independent: item.independent === true,
          ...(item.excluded === true ? { excluded: true } : {}),
        }
      }),
  }
}

/** Onaylanan plan: insanın işaretini kaldırdığı vakalar koşmaz, plandan düşer. */
export function approvedPlan(plan: RunStrategy): RunStrategy {
  return { ...plan, items: plan.items.filter((item) => !item.excluded) }
}
