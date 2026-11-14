import type { AppRef, AppUserSetting, Settings, Workspace } from '@argus/shared'
import { json, type Database } from './database.ts'

/**
 * Varsayılan: Sonnet gezer, Opus göz ulaşılan her ekranı ekran notlarıyla inceler. 2026-11-14 temiz hafızalı
 * ölçümde (3 sayfa, 15 koşu) tek Opus koşusuna göre gerçek sorunların %68'ini buldu (Opus %41), Opus'un her koşuda
 * yakaladıklarını da yakaladı; süre −%14, sayfa başı maliyet +%15, gerçek bulgu başı −%31. Göz kapalıyken Haiku ya da
 * Sonnet gezgin içerik çelişkilerini kaçırıyordu: göz kapatılırsa gezgin Opus seçilmeli.
 */
export const DEFAULT_SETTINGS: Settings = {
  models: {
    planner: 'claude-opus-5-5',
    explorer: 'claude-sonnet-5-5',
    inspector: 'claude-opus-5-5',
    judge: 'claude-opus-5-5',
    teacher: 'claude-opus-5-5',
  },
  escalate: true,
  inspector: true,
  effort: 'medium',
  ruleBudget: 1500,
  autoApproveFindingRules: true,
  learnAfterDecisions: 3,
  defaultOptions: { maxTasks: 5, maxSteps: 10 },
  author: '',
}

export function getSettings(db: Database): Settings {
  const row = db.prepare(`select value from settings where key = 'settings'`).get() as
    { value: string } | undefined
  // Eski kayıtta tek 'model' alanı olabilir; rol modelleri varsayılandan gelir.
  const { model: _legacy, ...saved } = json<Partial<Settings> & { model?: string }>(row?.value, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    models: { ...DEFAULT_SETTINGS.models, ...(saved.models ?? {}) },
    defaultOptions: { ...DEFAULT_SETTINGS.defaultOptions, ...(saved.defaultOptions ?? {}) },
  }
}

export function saveSettings(db: Database, patch: Partial<Settings>): Settings {
  const next = { ...getSettings(db), ...patch }
  db.prepare(
    `insert into settings (key, value) values ('settings', ?) on conflict(key) do update set value = excluded.value`,
  ).run(JSON.stringify(next))
  return next
}

/** Kullanıcının son seçtiği çalışma alanı (proje · uygulama · dal). */
export function getSavedWorkspace(db: Database): Workspace | null {
  const row = db.prepare(`select value from settings where key = 'workspace'`).get() as
    { value: string } | undefined
  const saved = json<Partial<Workspace>>(row?.value, {})
  return saved.project && saved.application && saved.environment
    ? { project: saved.project, application: saved.application, environment: saved.environment }
    : null
}

export function saveWorkspace(db: Database, workspace: Workspace): void {
  db.prepare(
    `insert into settings (key, value) values ('workspace', ?) on conflict(key) do update set value = excluded.value`,
  ).run(JSON.stringify(workspace))
}

/** Uygulamanın kendi kullanıcısı (kompleks projede giriş ekranı için). Yalnız bu makinede, Git'e girmez. */
export function getAppUser(db: Database, app: AppRef): { identifier: string; password: string } | null {
  const row = db
    .prepare('select identifier, password from app_users where project = ? and application = ?')
    .get(app.project, app.application) as { identifier: string; password: string } | undefined
  return row ?? null
}

export function listAppUsers(db: Database): AppUserSetting[] {
  const rows = db
    .prepare('select project, application, identifier, password from app_users order by project')
    .all() as Array<{
    project: string
    application: string
    identifier: string
    password: string
  }>
  return rows.map((r) => ({
    project: r.project,
    application: r.application,
    identifier: r.identifier,
    hasPassword: r.password !== '',
  }))
}

export function saveAppUser(db: Database, app: AppRef, identifier: string, password: string | null): void {
  const existing = getAppUser(db, app)
  db.prepare(
    `insert into app_users (project, application, identifier, password) values (?, ?, ?, ?)
     on conflict(project, application) do update set identifier = excluded.identifier, password = excluded.password`,
  ).run(app.project, app.application, identifier, password ?? existing?.password ?? '')
}

export function deleteAppUser(db: Database, app: AppRef): void {
  db.prepare('delete from app_users where project = ? and application = ?').run(app.project, app.application)
}
