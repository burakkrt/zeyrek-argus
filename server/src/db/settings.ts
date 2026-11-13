import type { AppRef, AppUserSetting, Settings } from '@argus/shared'
import { json, type Database } from './database.ts'

export const DEFAULT_SETTINGS: Settings = {
  model: 'claude-opus-5-5',
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
  const saved = json<Partial<Settings>>(row?.value, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
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
