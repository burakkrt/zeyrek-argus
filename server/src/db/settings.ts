import { createHash } from 'node:crypto'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
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
  author: '',
  storageLimitGb: 10,
}

export function getSettings(db: Database): Settings {
  const row = db.prepare(`select value from settings where key = 'settings'`).get() as
    { value: string } | undefined
  // Eski kayıtta tek 'model' alanı olabilir (rol modelleri varsayılandan gelir); motor deneylerinin, gün/koşu sayılı
  // saklamanın ve koşu derinliğinin (görev/adım varsayılanı) anahtarları (2026-11) artık yok, okunurken atılır.
  const {
    model: _legacy,
    experiments: _experiments,
    retention: _retention,
    defaultOptions: _defaultOptions,
    ...saved
  } = json<Partial<Settings> & { model?: string; experiments?: unknown; retention?: unknown; defaultOptions?: unknown }>(row?.value, {})
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    models: { ...DEFAULT_SETTINGS.models, ...(saved.models ?? {}) },
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

/**
 * Uygulama hesapları (kompleks projede uygulamanın kendi giriş ekranı için): uygulama başına birden çok, biri
 * varsayılan. Yalnız bu makinede (SQLite, `data/`), Git'e girmez; ekip arkadaşı kendi hesabını kendi ekler.
 */
interface AccountRow {
  project: string
  application: string
  identifier: string
  password: string
  is_default: number
}

/** Hesap: kullanıcı adı verilirse o, verilmezse varsayılan (yoksa ilk) hesap. */
export function getAppUser(
  db: Database,
  app: AppRef,
  identifier?: string | null,
): { identifier: string; password: string } | null {
  const row = (
    identifier
      ? db
          .prepare(
            'select identifier, password from app_accounts where project = ? and application = ? and identifier = ?',
          )
          .get(app.project, app.application, identifier)
      : db
          .prepare(
            'select identifier, password from app_accounts where project = ? and application = ? order by is_default desc, identifier limit 1',
          )
          .get(app.project, app.application)
  ) as { identifier: string; password: string } | undefined
  return row ?? null
}

export function listAppUsers(db: Database, app?: AppRef): AppUserSetting[] {
  const rows = (app
    ? db
        .prepare('select * from app_accounts where project = ? and application = ? order by identifier')
        .all(app.project, app.application)
    : db
        .prepare('select * from app_accounts order by project, application, identifier')
        .all()) as unknown as AccountRow[]
  return rows.map((r) => ({
    project: r.project,
    application: r.application,
    identifier: r.identifier,
    hasPassword: r.password !== '',
    isDefault: r.is_default === 1,
  }))
}

/**
 * Hesabı ekler ya da günceller (parola boşsa eskisi kalır). Uygulamanın ilk hesabı ya da `makeDefault` ise varsayılan
 * olur; uygulamada hep tek varsayılan vardır.
 */
export function saveAppUser(
  db: Database,
  app: AppRef,
  identifier: string,
  password: string | null,
  makeDefault = false,
): void {
  const existing = getAppUser(db, app, identifier)
  const first = !getAppUser(db, app)
  db.prepare(
    `insert into app_accounts (project, application, identifier, password, is_default) values (?, ?, ?, ?, 0)
     on conflict(project, application, identifier) do update set password = excluded.password`,
  ).run(app.project, app.application, identifier, password ?? existing?.password ?? '')
  if (first || makeDefault) setDefaultAppUser(db, app, identifier)
}

export function setDefaultAppUser(db: Database, app: AppRef, identifier: string): void {
  db.prepare(
    'update app_accounts set is_default = (identifier = ?) where project = ? and application = ?',
  ).run(identifier, app.project, app.application)
}

/** Hesabı siler; varsayılan silindiyse kalan ilk hesap varsayılan olur. */
export function deleteAppUser(db: Database, app: AppRef, identifier: string): void {
  db.prepare('delete from app_accounts where project = ? and application = ? and identifier = ?').run(
    app.project,
    app.application,
    identifier,
  )
  const hasDefault = listAppUsers(db, app).some((a) => a.isDefault)
  const next = getAppUser(db, app)
  if (!hasDefault && next) setDefaultAppUser(db, app, next.identifier)
}

/**
 * Uygulama kullanıcısının saklanan oturum dosyası (`data/oturumlar/`): her koşu yeniden giriş yapmasın diye
 * tarayıcı çerezleri burada kalır. Dosya adı kullanıcı adının özetini taşır; kullanıcı değişince eski oturum
 * kullanılmaz.
 */
export function appSessionFile(dataDir: string, app: AppRef, identifier: string): string {
  const id = createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex').slice(0, 16)
  return join(dataDir, 'oturumlar', `${app.project}__${app.application}__${id}.json`)
}

/** Saklanan oturumu siler (parola değişince, hesap silinince); kullanıcı adı verilmezse uygulamanın hepsini. */
export function forgetAppSessions(dataDir: string, app: AppRef, identifier?: string): void {
  if (identifier) {
    rmSync(appSessionFile(dataDir, app, identifier), { force: true })
    return
  }
  const dir = join(dataDir, 'oturumlar')
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir))
    if (name.startsWith(`${app.project}__${app.application}__`)) rmSync(join(dir, name), { force: true })
}
