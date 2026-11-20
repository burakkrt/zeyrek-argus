import {
  RUN_CEILINGS,
  type RunEvent,
  type RunEventBody,
  type RunCoverage,
  type RunInfo,
  type RunReview,
  type RunOptions,
  type RunStatus,
  type Usage,
  type Workspace,
  type PlanState,
  type RunStrategy,
} from '@argus/shared'
import { json, newId, now, type Database } from './database.ts'

export const EMPTY_USAGE: Usage = {
  input: 0,
  cacheWrite: 0,
  cacheRead: 0,
  output: 0,
  requests: 0,
  costUsd: 0,
}

interface RunRow {
  id: string
  code: string
  project: string
  application: string
  environment: string
  pages: string
  options: string
  status: RunStatus
  error: string | null
  usage: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  coverage: string | null
  closed_at: string | null
  closed_by: string | null
  plan: string | null
  plan_state: PlanState | null
  plan_feedback: string | null
}

function counts(db: Database, runId: string): RunInfo['counts'] {
  const rows = db
    .prepare('select outcome, count(*) as n from occurrences where run_id = ? group by outcome')
    .all(runId) as Array<{ outcome: string; n: number }>
  const of = (o: string) => rows.find((r) => r.outcome === o)?.n ?? 0
  return {
    new: of('yeni') + of('yeniden-acildi'),
    repeated: of('tekrar'),
    suppressed: of('bastirildi'),
  }
}

/** Ana koşunun devam koşuları (yönlendir ve sürdür), eskiden yeniye. */
function continuationsOf(db: Database, rootId: string): RunInfo['continuations'] {
  return db
    .prepare(
      `select id, code, status from runs where json_extract(options, '$.parentRunId') = ? order by created_at`,
    )
    .all(rootId) as RunInfo['continuations']
}

/**
 * Koşunun ve devam koşularının (aile) gördüğü sorunların insan kararına göre sayısı: sorun başına bir kez; bastırılan da
 * reddedilmiş sayılır.
 */
function review(db: Database, rootId: string): RunReview {
  const rows = db
    .prepare(
      `select i.status, count(distinct i.id) as n from occurrences o join issues i on i.id = o.issue_id
       where o.run_id = ? or o.run_id in (select id from runs where json_extract(options, '$.parentRunId') = ?)
       group by i.status`,
    )
    .all(rootId, rootId) as Array<{ status: string; n: number }>
  const of = (s: string) => rows.find((r) => r.status === s)?.n ?? 0
  const unclear = (
    db
      .prepare(
        `select count(distinct i.id) as n from occurrences o join issues i on i.id = o.issue_id
         where i.unclear_at is not null and i.status = 'acik'
           and (o.run_id = ? or o.run_id in (select id from runs where json_extract(options, '$.parentRunId') = ?))`,
      )
      .get(rootId, rootId) as { n: number }
  ).n
  return {
    pending: of('acik'),
    accepted: of('duzeltilecek') + of('duzeldi'),
    rejected: of('bulgu-degil'),
    unclear,
  }
}

function toInfo(db: Database, row: RunRow): RunInfo {
  const options = json<RunOptions>(row.options, { ...RUN_CEILINGS })
  const root = options.parentRunId ?? row.id
  return {
    id: row.id,
    code: row.code,
    project: row.project,
    application: row.application,
    environment: row.environment,
    pages: json<string[]>(row.pages, []),
    options,
    status: row.status,
    error: row.error,
    usage: json<Usage>(row.usage, EMPTY_USAGE),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    counts: counts(db, row.id),
    coverage: json<RunCoverage | null>(row.coverage, null),
    review: review(db, root),
    continuations: continuationsOf(db, root),
    closedAt: row.closed_at ?? null,
    closedBy: row.closed_by ?? null,
    planState: row.plan_state ?? null,
    planRequest: row.plan_state === 'duzenleniyor' ? (row.plan_feedback ?? null) : null,
  }
}

/** Ana koşuyu ve devam koşularını kapatır. */
export function closeRun(db: Database, rootId: string, by: string): void {
  db.prepare(
    `update runs set closed_at = ?, closed_by = ?
     where (id = ? or json_extract(options, '$.parentRunId') = ?) and closed_at is null`,
  ).run(now(), by, rootId, rootId)
}

/**
 * Koşu kodu: `KOS-<yıl>-<sıra>`, sıra yıl içinde 1'den başlar ve 4 hanelidir (`KOS-2026-0007`). Kod yalnız koşu
 * oluşturulurken atanır; Yeni koşu ekranı bunu önizler ama ayırmaz — sayfa yenilenince ya da koşu başlatılmadan
 * bırakılınca kod tükenmez.
 */
export const RUN_CODE_PREFIX = 'KOS'

export function nextRunCode(db: Database, at: string = now()): string {
  const year = at.slice(0, 4)
  const row = db
    .prepare(
      `select max(cast(substr(code, ${RUN_CODE_PREFIX.length + 7}) as integer)) as seq from runs where code like ?`,
    )
    .get(`${RUN_CODE_PREFIX}-${year}-%`) as { seq: number | null }
  return `${RUN_CODE_PREFIX}-${year}-${String((row.seq ?? 0) + 1).padStart(4, '0')}`
}

export function createRun(
  db: Database,
  input: { project: string; application: string; environment: string; pages: string[]; options: RunOptions },
): RunInfo {
  const id = newId()
  const createdAt = now()
  // Kod ve kayıt tek ifadede: sıra hesaplanıp aynı anda yazılır (SQLite yazmaları sıralar, iki koşu aynı kodu almaz).
  db.prepare(
    `insert into runs (id, code, project, application, environment, pages, options, status, usage, created_at)
     values (?, ?, ?, ?, ?, ?, ?, 'sirada', ?, ?)`,
  ).run(
    id,
    nextRunCode(db, createdAt),
    input.project,
    input.application,
    input.environment,
    JSON.stringify(input.pages),
    JSON.stringify(input.options),
    JSON.stringify(EMPTY_USAGE),
    createdAt,
  )
  return getRun(db, id)!
}

export function getRun(db: Database, id: string): RunInfo | null {
  const row = db.prepare('select * from runs where id = ?').get(id) as RunRow | undefined
  return row ? toInfo(db, row) : null
}

/** Koşular, yeniden eskiye. Çalışma alanı verilirse yalnız o proje · uygulama · dalınkiler. */
export function listRuns(db: Database, limit = 100, workspace?: Workspace): RunInfo[] {
  const rows = (workspace
    ? db
        .prepare(
          'select * from runs where project = ? and application = ? and environment = ? order by created_at desc limit ?',
        )
        .all(workspace.project, workspace.application, workspace.environment, limit)
    : db.prepare('select * from runs order by created_at desc limit ?').all(limit)) as unknown as RunRow[]
  return rows.map((row) => toInfo(db, row))
}

/** Son koşuların farklı çalışma alanları, yeniden eskiye (açılışta çalışma alanı tahmini için). */
export function recentWorkspaces(db: Database, limit = 10): Workspace[] {
  return db
    .prepare(
      `select project, application, environment from runs group by project, application, environment
       order by max(created_at) desc limit ?`,
    )
    .all(limit) as unknown as Workspace[]
}

export function nextQueuedRun(db: Database): RunInfo | null {
  // Planı onay bekleyen koşu sırada durur ama yürütülmez.
  const row = db
    .prepare(
      `select * from runs where status = 'sirada' and coalesce(plan_state, '') <> 'taslak' order by created_at limit 1`,
    )
    .get() as RunRow | undefined
  return row ? toInfo(db, row) : null
}

export interface PlanVersions {
  /** Üzerinde çalışılan plan (insanın elle düzenlemeleri dahil). */
  plan: RunStrategy | null
  /** Argus'un son yazdığı plan; elle düzenleme bunu değiştirmez. Eski koşularda null. */
  base: RunStrategy | null
  /** Son düzenletmeden önce Argus'un yazdığı plan; hiç düzenletilmediyse null. */
  previous: RunStrategy | null
  feedback: string | null
}

/** Koşunun planı, sürümleri ve Argus'tan istenen son düzenleme. */
export function getPlan(db: Database, id: string): PlanVersions {
  const row = db.prepare('select plan, plan_base, plan_previous, plan_feedback from runs where id = ?').get(id) as
    | { plan: string | null; plan_base: string | null; plan_previous: string | null; plan_feedback: string | null }
    | undefined
  return {
    plan: json<RunStrategy | null>(row?.plan ?? null, null),
    base: json<RunStrategy | null>(row?.plan_base ?? null, null),
    previous: json<RunStrategy | null>(row?.plan_previous ?? null, null),
    feedback: row?.plan_feedback ?? null,
  }
}

/** Argus planı yazdı: taslak olur; yazdığı hâl ayrıca saklanır (elle düzenlemeler bunun üstüne yapılır). */
export function savePlanDraft(db: Database, id: string, plan: RunStrategy): void {
  const text = JSON.stringify(plan)
  db.prepare(
    `update runs set plan_state = 'taslak', plan_feedback = null, plan = ?, plan_base = ?, status = 'sirada' where id = ?`,
  ).run(text, text, id)
}

/**
 * Düzenletme başlar: elle düzenlemeler bırakılır, plan Argus'un son yazdığı hâle döner; o hâl "önceki sürüm" olur
 * (yeni taslakta neyin değiştiği ona göre işaretlenir).
 */
export function startPlanRevision(db: Database, id: string, feedback: string): void {
  db.prepare(
    `update runs set plan_state = 'duzenleniyor', plan_feedback = ?, plan = coalesce(plan_base, plan),
       plan_previous = coalesce(plan_base, plan), status = 'sirada' where id = ?`,
  ).run(feedback, id)
}

/**
 * Planın durumu. Taslak, düzenleniyor ve onaylandı koşuyu sıraya geri koyar (taslak sırada bekler, ötekiler yürütülür);
 * plan verilirse yazılır, düzenleme isteği yalnız "düzenleniyor"da tutulur.
 */
export function setPlan(
  db: Database,
  id: string,
  state: PlanState,
  plan?: RunStrategy | null,
  feedback: string | null = null,
): void {
  db.prepare(
    `update runs set plan_state = ?, plan_feedback = ?, plan = coalesce(?, plan),
       status = case when ? = 'hazirlaniyor' then status else 'sirada' end where id = ?`,
  ).run(state, feedback, plan ? JSON.stringify(plan) : null, state, id)
}

export function setRunCoverage(db: Database, id: string, coverage: RunCoverage): void {
  db.prepare('update runs set coverage = ? where id = ?').run(JSON.stringify(coverage), id)
}

/** Koşunun sayfaları: stratejinin (ve gözetmenin ek kalemlerinin) ekran kalemlerinden gelince yazılır. */
export function setRunPages(db: Database, id: string, pages: string[]): void {
  db.prepare('update runs set pages = ? where id = ?').run(JSON.stringify(pages), id)
}

/** Koşu yürümeye başladı; devamda ilk başlangıç anı korunur (geçen süre baştan sayılmaz). */
export function startRun(db: Database, id: string, resumed = false): void {
  db.prepare(
    `update runs set status = 'calisiyor', started_at = case when ? then coalesce(started_at, ?) else ? end where id = ?`,
  ).run(resumed ? 1 : 0, now(), now(), id)
}

/** Durdurulan ya da yarıda kalan koşu kaldığı yerden sürmek için yeniden sıraya girer. */
export function requeueRun(db: Database, id: string): void {
  db.prepare(`update runs set status = 'sirada', error = null, finished_at = null where id = ?`).run(id)
}

export function finishRun(
  db: Database,
  id: string,
  status: RunStatus,
  usage: Usage,
  error: string | null,
): void {
  db.prepare('update runs set status = ?, usage = ?, error = ?, finished_at = ? where id = ?').run(
    status,
    JSON.stringify(usage),
    error,
    now(),
    id,
  )
}

export function saveUsage(db: Database, id: string, usage: Usage): void {
  db.prepare('update runs set usage = ? where id = ?').run(JSON.stringify(usage), id)
}

/** Sunucu koşu sırasında kapandıysa yarım kalan koşular "hata" ile kapanır; "çalışıyor" asılı kalmaz. */
export function failInterruptedRuns(db: Database): number {
  const result = db
    .prepare(
      `update runs set status = 'hata', error = 'Sunucu koşu sırasında kapandı.', finished_at = ? where status = 'calisiyor'`,
    )
    .run(now())
  return Number(result.changes)
}

export function appendEvent(
  db: Database,
  runId: string,
  seq: number,
  page: string | null,
  body: RunEventBody,
): RunEvent {
  const at = now()
  db.prepare('insert into events (run_id, seq, at, page, type, body) values (?, ?, ?, ?, ?, ?)').run(
    runId,
    seq,
    at,
    page,
    body.type,
    JSON.stringify(body),
  )
  return { ...body, runId, seq, at, page } as RunEvent
}

export function lastEventSeq(db: Database, runId: string): number {
  const row = db.prepare('select max(seq) as seq from events where run_id = ?').get(runId) as {
    seq: number | null
  }
  return row.seq ?? 0
}

export function listEvents(db: Database, runId: string): RunEvent[] {
  const rows = db
    .prepare('select seq, at, page, body from events where run_id = ? order by seq')
    .all(runId) as Array<{ seq: number; at: string; page: string | null; body: string }>
  return rows.map(
    (r) =>
      ({
        ...json<RunEventBody>(r.body, { type: 'bilgi', message: '' }),
        runId,
        seq: r.seq,
        at: r.at,
        page: r.page,
      }) as RunEvent,
  )
}
