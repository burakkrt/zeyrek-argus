import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Box } from '@argus/shared'
import type { Locator, Page } from 'playwright'

/**
 * Kutu ve etiket çizimi (tarayıcıda koşar): çevre hafifçe karartılır, üstüne beyaz kenarlı kalın kırmızı bir çerçeve
 * ve iki satıra sığan okunur bir etiket çizilir. Hem canlı sayfada hem yakalanmış bir görüntünün üstünde kullanılır.
 */
function drawOverlay({ b, label }: { b: Box; label: string }): void {
  const pad = 6
  const frame = document.createElement('div')
  frame.setAttribute('data-argus-overlay', '')
  Object.assign(frame.style, {
    position: 'fixed',
    left: `${b.x - pad}px`,
    top: `${b.y - pad}px`,
    width: `${b.width + pad * 2}px`,
    height: `${b.height + pad * 2}px`,
    border: '4px solid #e11d48',
    borderRadius: '8px',
    // İç ve dış beyaz çizgi her zeminde ayırt edilsin; geniş gölge sayfanın geri kalanını hafifçe karartır.
    boxShadow: 'inset 0 0 0 2px #fff, 0 0 0 2px #fff, 0 0 0 9999px rgba(15, 17, 26, 0.28)',
    zIndex: '2147483647',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  })
  document.body.appendChild(frame)
  if (!label) return
  const tag = document.createElement('div')
  tag.setAttribute('data-argus-overlay', '')
  tag.textContent = label
  const above = b.y > 70
  const left = Math.max(8, Math.min(b.x - pad, window.innerWidth - 556))
  Object.assign(tag.style, {
    position: 'fixed',
    left: `${left}px`,
    ...(above
      ? { bottom: `${window.innerHeight - (b.y - pad) + 8}px` }
      : { top: `${b.y + b.height + pad + 8}px` }),
    maxWidth: '540px',
    background: '#e11d48',
    color: '#fff',
    font: '600 14px/1.35 "Segoe UI", system-ui, sans-serif',
    padding: '6px 10px',
    borderRadius: '6px',
    border: '2px solid #fff',
    boxShadow: '0 4px 14px rgba(0,0,0,.35)',
    display: '-webkit-box',
    webkitLineClamp: '2',
    webkitBoxOrient: 'vertical',
    overflow: 'hidden',
    zIndex: '2147483647',
    pointerEvents: 'none',
  })
  document.body.appendChild(tag)
}

/**
 * Kanıt görüntüsü: sorunlu öğe görünür alana kaydırılır, kutu ve etiket çizilir, PNG alınır (yazılar keskin kalır),
 * sonra çizimler kaldırılır. Bu görüntü modele gitmez; yalnız insan için, token maliyeti yoktur.
 */
export async function captureEvidence(
  page: Page,
  file: string,
  target: { locator?: Locator; label?: string } = {},
): Promise<{ box: Box | null }> {
  mkdirSync(dirname(file), { recursive: true })
  let box: Box | null = null
  if (target.locator) {
    await target.locator.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined)
    box = await target.locator.boundingBox({ timeout: 2_000 }).catch(() => null)
  }
  if (box) await page.evaluate(drawOverlay, { b: box, label: target.label ?? '' }).catch(() => undefined)
  try {
    await page.screenshot({ path: file, type: file.endsWith('.png') ? 'png' : 'jpeg' })
  } finally {
    await page
      .evaluate(() => document.querySelectorAll('[data-argus-overlay]').forEach((el) => el.remove()))
      .catch(() => undefined)
  }
  return { box }
}

/** Ekranın bir anlık hâli: incelemeci model sonradan bakar, kanıt bu görüntünün üstüne çizilir. */
export interface StateShot {
  png: Buffer
  width: number
  height: number
  url: string
  title: string
  text: string
  /** Görünür metin taşıyan öğelerin konumu (alıntının kutusunu bulmak için). */
  boxes: Array<Box & { text: string }>
}

/** Uzun görüntünün en çok yüksekliği (piksel): aşırı uzun sayfada görüntü ve bellek sınırlı kalır. */
const TALL_LIMIT = 6_000

/**
 * Ekranın bir anlık hâli, sayfanın tamamıyla: içerik pencereden uzunsa pencere geçici olarak içerik boyuna büyütülür,
 * görüntü ve metin kutuları alınır, sonra pencere ve kaydırma konumları geri konur (gezgin kaldığı yerden sürer). Göz
 * sayfanın tamamını okuduğu için ekranın altındaki bulguyu da bildirir; kanıt yalnız görünen alanı alırken o öğe
 * görüntüde yoktu (ölçüldü: kör etiketlemede 53 bulgunun 8'i). Uygulama iç kutuda kaydırdığı için tam sayfa görüntüsü
 * yetmez; pencereyi büyütmek iç kutuyu da açar. `tall: false`: açık katman varken pencere değişmez (büyütme kapatır).
 */
export async function captureState(page: Page, options: { tall: boolean }): Promise<StateShot> {
  const normal = page.viewportSize() ?? { width: 1280, height: 800 }
  if (!options.tall) return snapshotState(page, normal)
  const scroll = await page
    .evaluate(() => {
      const kept: Array<[Element, number]> = []
      let extra = 0
      for (const el of [document.scrollingElement, ...Array.from(document.querySelectorAll('*'))]) {
        if (!el || el.scrollHeight - el.clientHeight <= 20) continue
        extra = Math.max(extra, el.scrollHeight - el.clientHeight)
        if (el.scrollTop) kept.push([el, el.scrollTop])
      }
      ;(window as unknown as { __argusScroll?: Array<[Element, number]> }).__argusScroll = kept
      return extra
    })
    .catch(() => 0)
  const tall = Math.min(TALL_LIMIT, normal.height + scroll)
  if (tall > normal.height) await page.setViewportSize({ width: normal.width, height: tall })
  try {
    return await snapshotState(page, { width: normal.width, height: tall })
  } finally {
    if (tall > normal.height) {
      await page.setViewportSize(normal)
      await page
        .evaluate(() => {
          for (const [el, top] of (window as unknown as { __argusScroll?: Array<[Element, number]> })
            .__argusScroll ?? [])
            el.scrollTop = top
        })
        .catch(() => undefined)
    }
  }
}

async function snapshotState(page: Page, viewport: { width: number; height: number }): Promise<StateShot> {
  const [png, title, info] = await Promise.all([
    page.screenshot({ type: 'png' }),
    page.title().catch(() => ''),
    page.evaluate(() => {
      const boxes: Array<{ x: number; y: number; width: number; height: number; text: string }> = []
      // Öznitelik metni (yer tutucu, ipucu, erişilebilir ad) de kanıttır: göz ağaçta okuyup alıntılıyor, görünür metinde
      // aranınca bulgu "doğrulanamadı" kalıyordu (ölçüldü: dönemlerde 11 doğrulanamayanın 4'ü).
      const attributes: string[] = []
      const all = document.body ? Array.from(document.body.querySelectorAll<HTMLElement>('*')) : []
      for (const el of all) {
        if (boxes.length >= 1500) break
        const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())
        const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        const named = ['placeholder', 'title', 'aria-label']
          .map((a) => el.getAttribute(a) ?? '')
          .filter(Boolean)
          .join(' ')
        if (named) attributes.push(named)
        if (!own && !field && !named) continue
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue
        const value = field
          ? `${(el as HTMLInputElement).value} ${named}`
          : `${own ? el.innerText || el.textContent || '' : ''} ${named}`
        boxes.push({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          text: value.replace(/\s+/g, ' ').trim().slice(0, 300),
        })
      }
      return { boxes, text: [document.body?.innerText ?? '', ...attributes].join('\n') }
    }),
  ])
  return { png, ...viewport, url: page.url(), title, text: info.text, boxes: info.boxes }
}

/** Alıntıyı içeren en küçük öğenin kutusu. */
export function boxOfQuote(shot: StateShot, quote: string): Box | null {
  const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr')
  const q = norm(quote)
  if (!q) return null
  const hits = shot.boxes.filter((b) => norm(b.text).includes(q))
  if (!hits.length) return null
  const best = hits.reduce((a, b) => (a.width * a.height <= b.width * b.height ? a : b))
  return { x: best.x, y: best.y, width: best.width, height: best.height }
}

/** Yakalanmış görüntünün üstüne kutu ve etiket çizip PNG yazar (ayrı, ağ kullanmayan bir sekmede). */
export async function annotateShot(
  page: Page,
  shot: StateShot,
  box: Box | null,
  label: string,
  file: string,
): Promise<void> {
  mkdirSync(dirname(file), { recursive: true })
  await page.setViewportSize({ width: shot.width, height: shot.height })
  await page.setContent(
    `<html><body style="margin:0;overflow:hidden"><img id="s" style="display:block" src="data:image/png;base64,${shot.png.toString('base64')}"></body></html>`,
  )
  await page.waitForFunction(
    () => (document.getElementById('s') as HTMLImageElement | null)?.complete === true,
  )
  if (box) await page.evaluate(drawOverlay, { b: box, label })
  await page.screenshot({ path: file, type: 'png' })
}
