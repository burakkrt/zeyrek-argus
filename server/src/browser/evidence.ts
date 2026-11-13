import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Box } from '@argus/shared'
import type { Locator, Page } from 'playwright'

/**
 * Kanıt görüntüsü: sorunlu öğe görünür alana kaydırılır; çevresi hafifçe karartılır, üstüne beyaz kenarlı kalın
 * kırmızı bir çerçeve ve iki satıra sığan okunur bir etiket çizilir; PNG olarak alınır (yazılar keskin kalır),
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
  if (box) {
    await page
      .evaluate(
        ({ b, label }) => {
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
          if (label) {
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
        },
        { b: box, label: target.label ?? '' },
      )
      .catch(() => undefined)
  }
  try {
    await page.screenshot({ path: file, type: file.endsWith('.png') ? 'png' : 'jpeg' })
  } finally {
    await page
      .evaluate(() => document.querySelectorAll('[data-argus-overlay]').forEach((el) => el.remove()))
      .catch(() => undefined)
  }
  return { box }
}
