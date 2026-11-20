import type { RunEvent, RunStrategy } from '@argus/shared'
import { DEFINITION_PAGE } from '@argus/shared'

/**
 * Koşunun ilerlemesi, olay kaydından (kaldığı yerden devam için). Argus'un her vakası ayrı ve kısa bir model
 * konuşmasıdır; vakalar arası bilgi konuşmayla değil, biten vakanın yazılı özetiyle ("Bu koşuda bilinenler") taşınır.
 * Bu yüzden devam, yarıda kalan konuşmayı geri yüklemez (geçmiş düzenlenmez, AGENTS.md ilke 6): biten vakaların
 * özetleri aynen geri gelir, biten vaka yeniden yürümez; yarıda kalan vaka baştan ve temiz bir konuşmayla yürür.
 *
 * Vaka "bitti" sayılmaz: başlayıp bitiş olayı gelmeyen, bitiş olayı `interrupted` işaretli (durdurma ya da hatayla
 * kesilen) vaka. Ekran sayfası yarıda kalmadan bittiyse ya da son planındaki bütün görevler bittiyse (sayfa sonu işi
 * — terim gözü, sayfa bilgisi — yarıda kalsa da) tamamdır. Yarım sayfa devamda baştan yürür: sayfa planlayıcısı görev
 * başlıklarını her seferinde yeniden yazdığı için biten görevler başlıkla eşleştirilemez (KOS-2026-0061).
 */
export interface RunProgress {
  /** Koşu daha önce yürüdü (strateji yayımlandı ya da bir bitiş olayı var): bu yürütme bir devamdır. */
  resumed: boolean
  /** Önceki yürütmenin stratejisi (plan onayı olmayan eski koşuda devamın planı). */
  strategy: RunStrategy | null
  /** Biten tanım vakaları: başlık → özet (bitiş sırasıyla). */
  definitions: Map<string, string>
  /** Yarıda kalmadan biten ekran sayfaları: sayfa → özet. */
  pages: Map<string, string>
  /** Başlayıp bitmeyen (ya da yarıda kalan) tanım vakaları. */
  interrupted: string[]
}

export function runProgress(events: RunEvent[]): RunProgress {
  const definitions = new Map<string, string>()
  const pages = new Map<string, string>()
  // Ekran sayfasının son planı ve o planda biten görevleri (yeni plan gelince sıfırlanır).
  const screenPlans = new Map<string, { size: number; done: Set<number>; summaries: string[] }>()
  const started = new Set<string>()
  // Görev sırası → başlık, sayfa başına; her `plan` olayı ve görev başlangıcı günceller (devamda sıra aynı kalır).
  const titles = new Map<string, string[]>()
  let resumed = false
  let strategy: RunStrategy | null = null
  for (const event of events) {
    if (event.type === 'strateji') {
      resumed = true
      strategy = event.strategy
      continue
    }
    if (event.type === 'kosu-bitti') {
      resumed = true
      continue
    }
    const page = event.page
    if (!page) continue
    if (event.type === 'plan') {
      titles.set(page, event.tasks.map((t) => t.title))
      if (page !== DEFINITION_PAGE) screenPlans.set(page, { size: event.tasks.length, done: new Set(), summaries: [] })
    }
    if (event.type === 'gorev-basladi') {
      const list = titles.get(page) ?? []
      list[event.index] = event.title
      titles.set(page, list)
      if (page === DEFINITION_PAGE) started.add(event.title)
    }
    if (event.type === 'gorev-bitti' && !event.interrupted) {
      const title = titles.get(page)?.[event.index]
      if (!title) continue
      if (page === DEFINITION_PAGE) definitions.set(title, event.summary)
      else {
        const plan = screenPlans.get(page)
        if (plan && !plan.done.has(event.index)) {
          plan.done.add(event.index)
          plan.summaries.push(`${event.index + 1}. ${title}: ${event.summary}`)
        }
      }
    }
    if (event.type === 'sayfa-bitti' && page !== DEFINITION_PAGE && !event.interrupted) pages.set(page, event.summary)
  }
  for (const [page, plan] of screenPlans)
    if (!pages.has(page) && plan.size > 0 && plan.done.size === plan.size) pages.set(page, plan.summaries.join('\n'))
  return {
    resumed,
    strategy,
    definitions,
    pages,
    interrupted: [...started].filter((title) => !definitions.has(title)),
  }
}
