import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Box } from '@argus/shared'
import type { Locator, Page } from 'playwright'

/**
 * Kanıt görüntüsü: sorunlu öğe görünür alana kaydırılır, üstüne kırmızı bir kutu ve etiket çizilir, görüntü alınır,
 * kutu kaldırılır. Kutunun yeri de saklanır (arayüz yeniden çizebilsin).
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
          const frame = document.createElement('div')
          frame.setAttribute('data-argus-overlay', '')
          Object.assign(frame.style, {
            position: 'fixed',
            left: `${b.x - 4}px`,
            top: `${b.y - 4}px`,
            width: `${b.width + 8}px`,
            height: `${b.height + 8}px`,
            border: '3px solid #e11d48',
            borderRadius: '6px',
            boxShadow: '0 0 0 4px rgba(225,29,72,.25)',
            zIndex: '2147483647',
            pointerEvents: 'none',
          })
          if (label) {
            const tag = document.createElement('div')
            tag.textContent = label
            Object.assign(tag.style, {
              position: 'absolute',
              left: '-3px',
              top: b.y > 28 ? '-26px' : `${b.height + 10}px`,
              background: '#e11d48',
              color: '#fff',
              font: '600 12px system-ui, sans-serif',
              padding: '3px 8px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              maxWidth: '520px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            })
            frame.appendChild(tag)
          }
          document.body.appendChild(frame)
        },
        { b: box, label: target.label ?? '' },
      )
      .catch(() => undefined)
  }
  try {
    await page.screenshot({ path: file, type: 'jpeg', quality: 80 })
  } finally {
    await page
      .evaluate(() => document.querySelectorAll('[data-argus-overlay]').forEach((el) => el.remove()))
      .catch(() => undefined)
  }
  return { box }
}

/** Akış için küçük adım görüntüsü (kutusuz). */
export async function captureStep(page: Page, file: string): Promise<void> {
  mkdirSync(dirname(file), { recursive: true })
  await page.screenshot({ path: file, type: 'jpeg', quality: 55 })
}
