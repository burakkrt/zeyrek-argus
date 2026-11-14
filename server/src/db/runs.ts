import type { RunEvent, RunEventBody, RunInfo, RunOptions, RunStatus, Usage, Workspace } from '@argus/shared'
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

function toInfo(db: Database, row: RunRow): RunInfo {
  return {
    id: row.id,
    project: row.project,
    application: row.application,
    environment: row.environment,
    pages: json<string[]>(row.pages, []),
    options: json<RunOptions>(row.options, { maxTasks: 5, maxSteps: 10 }),
    status: row.status,
    error: row.error,
    usage: json<Usage>(row.usage, EMPTY_USAGE),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    counts: counts(db, row.id),
  }
}

export function createRun(
  db: Database,
  input: { project: string; application: string; environment: string; pages: string[]; options: RunOptions },
): RunInfo {
  const id = newId()
  db.prepare(
    `insert into runs (id, project, application, environment, pages, options, status, usage, created_at)
     values (?, ?, ?, ?, ?, ?, 'sirada', ?, ?)`,
  ).run(
    id,
    input.project,
    input.application,
    input.environment,
    JSON.stringify(input.pages),
    JSON.stringify(input.options),
    JSON.stringify(EMPTY_USAGE),
    now(),
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
  const row = db.prepare(`select * from runs where status = 'sirada' order by created_at limit 1`).get() as
    RunRow | undefined
  return row ? toInfo(db, row) : null
}

export function startRun(db: Database, id: string): void {
  db.prepare(`update runs set status = 'calisiyor', started_at = ? where id = ?`).run(now(), id)
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
