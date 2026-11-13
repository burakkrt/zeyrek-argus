import type { FindingKind } from '@argus/shared'
import type { Page } from 'playwright'

/**
 * Belirlenimci gözler: sayfanın içinde koşar, token harcamaz, kanıtı kesindir. Model bunları yeniden aramaz;
 * "zaten bulunanlar" olarak görür. Her isabet bulunduğu öğeyi `data-argus-hit` ile işaretler ki kanıt
 * görüntüsünde kutuyla gösterilebilsin.
 */

export interface PatternRule {
  id: string
  pattern: string
  text: string
}

export interface EyeHit {
  check: string
  /** Sorun anahtarı (uygulama genelinde): aynı anahtar başka sayfada görünüm olarak eklenir. */
  key: string
  value: string
  context: string
  marker: string
}

interface EyeDefinition {
  title: (hit: EyeHit) => string
  kind: FindingKind
  expected: string
}

const DEFINITIONS: Record<string, EyeDefinition> = {
  'ham-deger': {
    title: (h) => `Ekranda ham değer görünüyor: ${h.value}`,
    kind: 'kesin',
    expected: 'Boş değer için "-" ya da anlamlı bir metin gösterilmeli.',
  },
  guid: {
    title: () => 'Ekranda kayıt kimliği (GUID) görünüyor',
    kind: 'kesin',
    expected: 'Kullanıcıya kimlik yerine kaydın adı gösterilmeli.',
  },
  'ham-tarih': {
    title: () => 'Tarih ham biçimde (ISO) görünüyor',
    kind: 'kesin',
    expected: 'Tarih Türkçe biçimde gösterilmeli (ör. 13.11.2026 10:00).',
  },
  'ham-donem': {
    title: () => 'Dönem ham yıl-ay biçiminde görünüyor',
    kind: 'kesin',
    expected: 'Dönem ay adıyla gösterilmeli (ör. Eylül 2026).',
  },
  'renk-kodu': {
    title: () => 'Ekranda renk kodu görünüyor',
    kind: 'kesin',
    expected: 'Renk, kod yerine renk örneği ya da seçiciyle gösterilmeli.',
  },
  'ceviri-anahtari': {
    title: (h) => `Çevrilmemiş metin anahtarı görünüyor: ${h.value}`,
    kind: 'kesin',
    expected: 'Anahtar yerine çevrilmiş metin gösterilmeli.',
  },
  'kesik-metin': {
    title: (h) => `Metin sığmıyor ve kesiliyor: "${h.value}"`,
    kind: 'kesin',
    expected: 'Metin tam görünmeli ya da üzerine gelince tamamı gösterilmeli.',
  },
}

export function describeHit(hit: EyeHit, rules: PatternRule[]): EyeDefinition & { titleText: string } {
  if (hit.check.startsWith('desen:')) {
    const rule = rules.find((r) => `desen:${r.id}` === hit.check)
    const definition: EyeDefinition = {
      title: () => `Kural ihlali: ${rule?.text ?? hit.check}`,
      kind: 'kesin',
      expected: rule?.text ?? '',
    }
    return { ...definition, titleText: definition.title(hit) }
  }
  const definition = DEFINITIONS[hit.check] ?? {
    title: () => hit.check,
    kind: 'kesin' as const,
    expected: '',
  }
  return { ...definition, titleText: definition.title(hit) }
}

const normalize = (value: string) => value.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim().slice(0, 60)

/** Anahtar: değer sorunun kendisiyse (ham değer, çeviri anahtarı, kesik metin) değer de anahtara girer. */
export function hitKey(check: string, value: string): string {
  if (check === 'ham-deger' || check === 'ceviri-anahtari' || check === 'kesik-metin')
    return `goz:${check}:${normalize(value)}`
  return `goz:${check}`
}

/** Sayfa içinde koşan bölüm; dışarıdan değişken kullanmaz (Playwright onu tarayıcıya gönderir). */
function scanPage(args: { patterns: Array<{ id: string; pattern: string }>; perCheck: number }) {
  const hits: Array<{ check: string; value: string; context: string; marker: string }> = []
  const counts = new Map<string, number>()
  let markerSeq = Number(document.body.dataset.argusSeq ?? '0')
  const add = (check: string, value: string, element: Element, context: string) => {
    const n = counts.get(check) ?? 0
    if (n >= args.perCheck) return
    if (hits.some((h) => h.check === check && h.value === value)) return
    counts.set(check, n + 1)
    markerSeq += 1
    const marker = String(markerSeq)
    element.setAttribute('data-argus-hit', marker)
    hits.push({ check, value, context: context.replace(/\s+/g, ' ').trim().slice(0, 160), marker })
  }
  const visible = (el: Element) =>
    typeof (el as HTMLElement).checkVisibility === 'function'
      ? (el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : (el as HTMLElement).offsetParent !== null
  const textChecks: Array<{ check: string; re: RegExp }> = [
    { check: 'ham-deger', re: /\b(undefined|null|NaN)\b|\[object Object\]|\{\{[^}]{1,40}\}\}/ },
    { check: 'guid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
    { check: 'ham-tarih', re: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/ },
    { check: 'ham-donem', re: /(^|[\s(])(19|20)\d{2}-(0[1-9]|1[0-2])(?=$|[\s·,.)])/ },
    { check: 'renk-kodu', re: /(^|\s)#(?=[0-9a-f]*[a-f])[0-9a-f]{6}\b/i },
    { check: 'ceviri-anahtari', re: /\b[a-z][a-zA-Z]+(\.[a-z][a-zA-Z0-9_]+){2,}\b/ },
  ]
  const patternChecks = args.patterns.flatMap((p) => {
    try {
      return [{ check: `desen:${p.id}`, re: new RegExp(p.pattern, 'u') }]
    } catch {
      return []
    }
  })
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE'])
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    if (!text.trim()) continue
    const parent = node.parentElement
    if (!parent || skip.has(parent.tagName) || parent.closest('[data-argus-overlay]') || !visible(parent))
      continue
    for (const { check, re } of [...textChecks, ...patternChecks]) {
      const match = re.exec(text)
      if (!match) continue
      const value = match[0].trim()
      if (
        check === 'ceviri-anahtari' &&
        (/@|https?:|www\.|\.(com|net|org|tr|io|app)\b/i.test(text) || /\.\d/.test(value))
      )
        continue
      add(check, value, parent, text)
    }
  }
  const tableCell = '[role="cell"], [role="gridcell"], [role="columnheader"], td, th'
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
    if (el.children.length > 0 || !el.textContent?.trim() || el.closest(tableCell) || el.title) continue
    const style = getComputedStyle(el)
    if (style.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && visible(el)) {
      add('kesik-metin', el.textContent.trim(), el, el.textContent)
    }
  }
  const canvas = document.createElement('canvas').getContext('2d')
  if (canvas) {
    for (const input of Array.from(
      document.querySelectorAll<HTMLInputElement>('input[placeholder], textarea[placeholder]'),
    )) {
      if (input.value || !visible(input)) continue
      const style = getComputedStyle(input)
      canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const available = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      if (available > 0 && canvas.measureText(input.placeholder).width > available + 1) {
        add('kesik-metin', input.placeholder, input, `yer tutucu: ${input.placeholder}`)
      }
    }
  }
  document.body.dataset.argusSeq = String(markerSeq)
  return hits
}

export async function runEyes(page: Page, patterns: PatternRule[], perCheck = 5): Promise<EyeHit[]> {
  const raw = await page
    .evaluate(scanPage, { patterns: patterns.map((p) => ({ id: p.id, pattern: p.pattern })), perCheck })
    .catch(() => [])
  return raw.map((hit) => ({
    ...hit,
    key: hit.check.startsWith('desen:') ? `goz:${hit.check}` : hitKey(hit.check, hit.value),
  }))
}
