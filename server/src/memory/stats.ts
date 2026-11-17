import { now, type Database } from '../db/database.ts'

/**
 * Kural kullanım sayaçları yerel veritabanında tutulur, dosyada değil: her koşu Git'te fark üretmesin.
 * "Uygulanabilir oldu" (isteme girdi) ve "kullanıldı" (bir bulgu ona dayandı) ayrı sayılır; bakım,
 * çok kez uygulanabilir olup hiç kullanılmayan kuralı emekliye önerir. "Yanılttı": kurala dayanan bulguya insan
 * "bulgu değil" dedi ya da kuralın bastırdığı sorun gerçek çıktı; bakım çok yanıltan kuralı emekliye önerir.
 */
export function bumpEligible(db: Database, ids: string[]): void {
  const stmt = db.prepare(
    `insert into rule_stats (rule_id, eligible, uses) values (?, 1, 0) on conflict(rule_id) do update set eligible = eligible + 1`,
  )
  for (const id of ids) stmt.run(id)
}

export function bumpUses(db: Database, ids: string[]): void {
  const stmt = db.prepare(
    `insert into rule_stats (rule_id, eligible, uses, last_used) values (?, 0, 1, ?)
     on conflict(rule_id) do update set uses = uses + 1, last_used = excluded.last_used`,
  )
  for (const id of ids) stmt.run(id, now())
}

export function bumpMisled(db: Database, ids: string[]): void {
  const stmt = db.prepare(
    `insert into rule_stats (rule_id, eligible, uses, misled) values (?, 0, 0, 1)
     on conflict(rule_id) do update set misled = misled + 1`,
  )
  for (const id of ids) stmt.run(id)
}

export function ruleStats(
  db: Database,
): Map<string, { uses: number; eligible: number; misled: number; lastUsed: string | null }> {
  const rows = db.prepare('select rule_id, uses, eligible, misled, last_used from rule_stats').all() as Array<{
    rule_id: string
    uses: number
    eligible: number
    misled: number
    last_used: string | null
  }>
  return new Map(
    rows.map((r) => [r.rule_id, { uses: r.uses, eligible: r.eligible, misled: r.misled, lastUsed: r.last_used }]),
  )
}
