import type { ItemSource, RunStrategy } from '@argus/shared'

/**
 * Plan düzenleme isteği (Plan adımı → "Argus'a düzenlet"): planlayıcı planı baştan yazar, ama asıl isteğin yanında
 * önceki taslağı (kullanıcının elle yaptığı değişikliklerle) ve kullanıcının ne istediğini de görür. İstek ya da
 * önceki plan yoksa asıl istek olduğu gibi gider.
 */
export function revisionBrief(brief: string | null, plan: RunStrategy | null, feedback: string | null): string {
  const base = brief ?? ''
  if (!plan || !feedback?.trim()) return base
  return [
    base,
    '',
    'ÖNCEKİ TASLAK PLAN (kullanıcı gördü; elle yaptığı değişiklikler dahil):',
    `Kapsam: ${plan.understood}`,
    'Senaryolar:',
    ...plan.scenarios.map((s) => `- ${s}`),
    `Tamam sayılır: ${plan.doneWhen}`,
    'Vakalar:',
    ...plan.items.map(
      (item, i) => `${i + 1}. ${item.title} (${item.source}${item.page ? `, ${item.page}` : ''}): ${item.goal}`,
    ),
    '',
    `KULLANICININ DÜZENLEME İSTEĞİ: ${feedback.trim()}`,
    'Planı bu isteğe göre yeniden yaz; istekle çelişmeyen önceki kararları ve kullanıcının elle yaptığı değişiklikleri koru.',
  ].join('\n')
}

const SOURCES: ItemSource[] = ['ekran', 'tanim', 'ikisi']
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const list = (value: unknown) => (Array.isArray(value) ? value.map(text).filter(Boolean) : [])

/**
 * İnsanın Plan adımında elle düzenlediği plan: boş vaka atılır, metinler kırpılır, bilinmeyen kaynak "ikisi" olur,
 * tanım vakasının sayfası yoktur. Kapsam türü, test yöntemleri ve bilinenler planlayıcınındır, olduğu gibi kalır.
 */
export function sanitizePlan(plan: RunStrategy): RunStrategy {
  return {
    ...plan,
    understood: text(plan.understood),
    scenarios: list(plan.scenarios),
    doneWhen: text(plan.doneWhen),
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
        }
      }),
  }
}
