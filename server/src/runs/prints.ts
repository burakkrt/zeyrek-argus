import { createHash } from 'node:crypto'
import type { AppRef, NetworkEntry } from '@argus/shared'
import { endpointKey } from '../browser/guard.ts'
import { now, type Database } from '../db/database.ts'

/**
 * Sayfanın değişiklik izi: arayüz yapısı (maskeli ağaç), veri sözleşmesi (çağrılan uçlar) ve Studio tanımı
 * (sayfa şeması). Şimdilik yalnız gözlemdir: hiçbir alan "değişmedi" diye atlanmaz; izlerin doğruluğu birkaç koşuda
 * ölçülmeden atlamaya izin verilmez.
 */
export interface PagePrint {
  ui: string
  api: string
  studio: string | null
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)

/** Veriyle değişen her şey maskelenir: ref, sayı, tarih, tırnak içi metin. Geriye ağacın iskeleti kalır. */
export function maskTree(tree: string): string {
  return tree
    .split('\n')
    .map((line) =>
      line
        .replace(/\s*\[ref=[^\]]*\]/g, '')
        .replace(/"(?:[^"\\]|\\.)*"/g, '"…"')
        .replace(/: .*$/, ':')
        .replace(/\d+/g, '#')
        .trimEnd(),
    )
    .filter((line) => !/^\s*- … \(\+#/.test(line))
    .join('\n')
}

export function uiPrint(tree: string): string {
  return hash(maskTree(tree))
}

export function apiPrint(requests: NetworkEntry[]): string {
  const keys = new Set<string>()
  for (const r of requests) {
    try {
      keys.add(endpointKey(r.method, r.url))
    } catch {
      continue
    }
  }
  return hash([...keys].sort().join('\n'))
}

/** Şemadan sürüm ve zaman damgası gibi her kayıtta değişen alanlar atılır; anahtarlar sıralanır. */
export function studioPrint(schema: unknown): string {
  const VOLATILE = new Set([
    'version',
    'updatedAt',
    'updated_at',
    'modifiedAt',
    'createdAt',
    'etag',
    'revision',
  ])
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => !VOLATILE.has(key))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, inner]) => [key, stable(inner)]),
      )
    return value
  }
  return hash(JSON.stringify(stable(schema)))
}

export type PrintChange = 'ilk' | 'ayni' | 'degisti' | 'bilinmiyor'

export function comparePrints(
  previous: PagePrint | null,
  next: PagePrint,
): Record<keyof PagePrint, PrintChange> {
  if (!previous) return { ui: 'ilk', api: 'ilk', studio: next.studio ? 'ilk' : 'bilinmiyor' }
  return {
    ui: previous.ui === next.ui ? 'ayni' : 'degisti',
    api: previous.api === next.api ? 'ayni' : 'degisti',
    studio:
      !previous.studio || !next.studio ? 'bilinmiyor' : previous.studio === next.studio ? 'ayni' : 'degisti',
  }
}

export function lastPrint(db: Database, app: AppRef, environment: string, page: string): PagePrint | null {
  const row = db
    .prepare(
      `select ui, api, studio from page_prints where project = ? and application = ? and environment = ? and page = ?
       order by at desc limit 1`,
    )
    .get(app.project, app.application, environment, page) as
    { ui: string; api: string; studio: string | null } | undefined
  return row ?? null
}

export function savePrint(
  db: Database,
  input: AppRef & { environment: string; page: string; runId: string; print: PagePrint },
): void {
  db.prepare(
    `insert into page_prints (project, application, environment, page, run_id, ui, api, studio, at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.project,
    input.application,
    input.environment,
    input.page,
    input.runId,
    input.print.ui,
    input.print.api,
    input.print.studio,
    now(),
  )
}

const WORDS: Record<PrintChange, string> = {
  ilk: 'ilk ölçüm',
  ayni: 'aynı',
  degisti: 'DEĞİŞTİ',
  bilinmiyor: 'alınamadı',
}

export function describeChange(change: Record<keyof PagePrint, PrintChange>): string {
  return `Değişiklik izi (yalnız gözlem, atlama yok): arayüz ${WORDS[change.ui]}, veri uçları ${WORDS[change.api]}, Studio tanımı ${WORDS[change.studio]}.`
}
