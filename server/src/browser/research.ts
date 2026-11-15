import type { Page } from 'playwright'

export interface Tooltip {
  label: string
  text: string
}

/**
 * "?" ipuçlarını toplar: kartlardaki tanımlar ("Onaylı ölçüm", "Kısmi veri") burada yazar. 1. sürüm bunları
 * okuyamadığı için tanımı bilmeden "tutarsız" diyordu. `title` taşıyanlar doğrudan okunur, diğerlerinin üstüne
 * gelinip açılan ipucu okunur. Token harcamaz.
 */
export async function harvestTooltips(page: Page, max = 12): Promise<Tooltip[]> {
  const candidates = await page
    .evaluate((limit) => {
      const visible = (el: Element) =>
        typeof (el as HTMLElement).checkVisibility === 'function'
          ? (el as HTMLElement).checkVisibility()
          : true
      const labelOf = (el: Element) => {
        const own = (el.getAttribute('aria-label') ?? '').trim()
        const holder = el.closest('label, th, dt, li, tr, [class*="row"], [class*="item"], div')
        const around = (holder?.textContent ?? '').replace(/\?/g, '').replace(/\s+/g, ' ').trim()
        return (around || own).slice(0, 80)
      }
      const out: Array<{ seq: string; label: string; title: string }> = []
      let seq = 0
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        if (out.length >= limit || !visible(el) || el.closest('[data-argus-overlay]')) continue
        const text = (el.textContent ?? '').trim()
        const aria = (el.getAttribute('aria-label') ?? '').toLocaleLowerCase('tr')
        const title = (el.getAttribute('title') ?? '').trim()
        const cls = typeof el.className === 'string' ? el.className : ''
        const rect = el.getBoundingClientRect()
        const small = rect.width > 0 && rect.width <= 32 && rect.height <= 32
        // "?" simgesi: metni "?" (içinde ikon olabilir), yardım anlatan etiket, ya da küçük ve "help/hint/info" sınıflı öğe.
        const looksLikeHelp =
          (text === '?' && el.children.length <= 2 && !el.parentElement?.closest('[data-argus-tip]')) ||
          /yardım|açıklama|bilgi|help|info|ipucu|\?/.test(aria) ||
          el.hasAttribute('aria-describedby') ||
          (small && /help|hint|tooltip|info|question|ipucu/i.test(cls))
        if (!looksLikeHelp && !(title && title.length > 12)) continue
        seq += 1
        el.setAttribute('data-argus-tip', String(seq))
        out.push({ seq: String(seq), label: labelOf(el), title })
      }
      return out
    }, max)
    .catch(() => [])

  const tips: Tooltip[] = []
  for (const c of candidates) {
    if (c.title) {
      tips.push({ label: c.label, text: c.title })
      continue
    }
    const target = page.locator(`[data-argus-tip="${c.seq}"]`)
    await target.hover({ timeout: 1_500 }).catch(() => undefined)
    await page.waitForTimeout(350)
    const text = await page
      .evaluate(() => {
        const pop = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[role="tooltip"], [data-tooltip], .tooltip, [class*="tooltip"]',
          ),
        ).find(
          (el) =>
            (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true) &&
            (el.textContent ?? '').trim(),
        )
        return (pop?.textContent ?? '').replace(/\s+/g, ' ').trim()
      })
      .catch(() => '')
    if (text) tips.push({ label: c.label, text: text.slice(0, 300) })
  }
  await page.mouse.move(2, 2).catch(() => undefined)
  return tips
}

/** Sayfanın aria ağacı ("ai" kipi: tıklanabilir öğeler ref taşır). */
export async function ariaTree(page: Page): Promise<string> {
  return page
    .ariaSnapshot({ mode: 'ai', timeout: 10_000 })
    .catch((error: unknown) => `(ağaç okunamadı: ${String(error)})`)
}

/**
 * Sayfanın kaydırma konumu (0 üst, 1 alt): en çok kayan alan (pencere ya da uygulamanın iç kaydırma kutusu) ölçülür.
 * Gezginin ağaç penceresi buna göre seçilir.
 */
export async function scrollFraction(page: Page): Promise<number> {
  return page
    .evaluate(() => {
      const boxes = [
        document.scrollingElement,
        ...Array.from(document.querySelectorAll<HTMLElement>('*')),
      ].filter((el): el is Element => !!el && el.scrollHeight - el.clientHeight > 20)
      const box = boxes.sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))[0]
      return box ? box.scrollTop / (box.scrollHeight - box.clientHeight) : 0
    })
    .catch(() => 0)
}

/** Ekrandaki görünür metin (alıntı doğrulaması için). */
export async function visibleText(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const parts: string[] = [document.body.innerText]
      for (const input of Array.from(document.querySelectorAll<HTMLInputElement>('input, textarea'))) {
        if (input.placeholder) parts.push(input.placeholder)
        if (input.value) parts.push(input.value)
      }
      return parts.join('\n')
    })
    .catch(() => '')
}
