import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/**
 * Yerel veritabanı (Node'un yerleşik SQLite'ı). Yalnız bu makineye ait veriyi tutar: koşular, olaylar, sorun
 * görünümleri, ayarlar. Takımla paylaşılan bilgi (kurallar, kararlar) `memory/` dosyalarındadır; buradaki karşılığı
 * o dosyalardan eşitlenen bir aynadır.
 */
export type Database = DatabaseSync

/** Göçler `user_version` sırasıyla uygulanır: yeni göç yalnız sona eklenir, var olan araya girmez ya da değişmez. */
const MIGRATIONS: string[] = [
  `
  create table runs (
    id text primary key,
    project text not null,
    application text not null,
    environment text not null,
    pages text not null,
    options text not null,
    status text not null,
    error text,
    usage text not null,
    created_at text not null,
    started_at text,
    finished_at text
  );
  create index runs_created on runs(created_at);

  create table events (
    run_id text not null references runs(id) on delete cascade,
    seq integer not null,
    at text not null,
    page text,
    type text not null,
    body text not null,
    primary key (run_id, seq)
  );

  create table issues (
    id text primary key,
    project text not null,
    application text not null,
    key text not null,
    title text not null,
    kind text not null,
    status text not null,
    source text not null,
    suppressed_by text,
    first_seen text not null,
    last_seen text not null,
    seen_count integer not null default 0,
    last_shot text,
    unique (project, application, key)
  );

  create table occurrences (
    id text primary key,
    issue_id text not null references issues(id) on delete cascade,
    run_id text not null references runs(id) on delete cascade,
    page text not null,
    phase text not null,
    kind text not null,
    outcome text not null,
    scenario text not null,
    expected text not null,
    observed text not null,
    quote text,
    shot text,
    box text,
    reason text,
    rules text not null,
    at text not null
  );
  create index occurrences_issue on occurrences(issue_id);
  create index occurrences_run on occurrences(run_id);

  create table comments (
    id integer primary key autoincrement,
    issue_id text not null references issues(id) on delete cascade,
    author text not null,
    text text not null,
    at text not null
  );

  create table history (
    id integer primary key autoincrement,
    issue_id text not null references issues(id) on delete cascade,
    from_status text,
    to_status text not null,
    author text not null,
    note text,
    at text not null
  );

  create table settings (key text primary key, value text not null);

  create table app_users (
    project text not null,
    application text not null,
    identifier text not null,
    password text not null,
    primary key (project, application)
  );

  create table proposals (
    id text primary key,
    project text not null,
    application text not null,
    action text not null,
    rule text not null,
    related text not null,
    reason text not null,
    sources text not null,
    origin text not null,
    status text not null,
    created_at text not null
  );

  create table rule_stats (
    rule_id text primary key,
    uses integer not null default 0,
    eligible integer not null default 0,
    last_used text
  );

  create table learn_state (
    project text not null,
    application text not null,
    learned_at text not null,
    primary key (project, application)
  );
  `,
  `
  create table page_prints (
    project text not null,
    application text not null,
    environment text not null,
    page text not null,
    run_id text not null,
    ui text not null,
    api text not null,
    studio text,
    at text not null
  );
  create index page_prints_page on page_prints (project, application, environment, page, at);
  `,
  // Uygulama başına birden çok hesap (farklı kullanıcılarla test); biri varsayılan. Eski tek hesap varsayılan olur.
  `
  create table app_accounts (
    project text not null,
    application text not null,
    identifier text not null,
    password text not null,
    is_default integer not null default 0,
    primary key (project, application, identifier)
  );
  insert into app_accounts (project, application, identifier, password, is_default)
    select project, application, identifier, password, 1 from app_users;
  drop table app_users;
  `,
  // Koşu kodu (KOS-<yıl>-<sıra>): mevcut koşulara oluşturulma sırasıyla, yıl başına sıralı atanır.
  `
  alter table runs add column code text;
  update runs set code = 'KOS-' || substr(created_at, 1, 4) || '-' || printf('%04d', (
    select count(*) from runs r
    where substr(r.created_at, 1, 4) = substr(runs.created_at, 1, 4)
      and (r.created_at < runs.created_at or (r.created_at = runs.created_at and r.id <= runs.id))
  ));
  create unique index runs_code on runs(code);
  `,
  // Takım arkadaşlarının bulguları (Git'teki findings/<kimlik>.md'den): sorun başına, yazar başına son görünüm.
  `
  create table shared_sightings (
    issue_id text not null references issues(id) on delete cascade,
    author text not null,
    pages text not null,
    page text not null,
    scenario text not null,
    expected text not null,
    observed text not null,
    quote text,
    first_seen text not null,
    last_seen text not null,
    seen_count integer not null,
    primary key (issue_id, author)
  );
  `,
  // Girdili koşunun isteğe cevabı (gözetmen): durum, cevap, kanıtlar, eksik (json).
  `
  alter table runs add column answer text;
  `,
  // Argus bulgu uygulamasıdır: gözetmenin çıktısı cevap değil kapsam raporudur (test edilen / edilemeyen).
  `
  alter table runs rename column answer to coverage;
  update runs set coverage = null;
  `,
  // Bulgunun önemi (S1 en ağır): liste önemle sıralanır; eski kayıtlar orta (S3) sayılır.
  `
  alter table issues add column severity text not null default 'S3';
  alter table occurrences add column severity text not null default 'S3';
  `,
  // Hafıza 2.0: "bulgu değil" kararı tanım izine bağlanır; kuralın yanılttığı sayılır.
  `
  alter table issues add column decision_print text;
  alter table rule_stats add column misled integer not null default 0;
  `,
  // Kayıtlı vaka: kanıtlı bulgunun platform çağrıları (yeniden doğrulama, yayın kapısı).
  `
  alter table occurrences add column steps text;
  alter table shared_sightings add column steps text;
  `,
]

export function openDatabase(file: string): Database {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;')
  const version = (db.prepare('pragma user_version').get() as { user_version: number }).user_version
  for (let i = version; i < MIGRATIONS.length; i += 1) {
    db.exec('begin')
    try {
      db.exec(MIGRATIONS[i]!)
      db.exec(`pragma user_version = ${i + 1}`)
      db.exec('commit')
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }
  return db
}

export const json = <T>(value: string | null | undefined, fallback: T): T => {
  if (value === null || value === undefined) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const now = () => new Date().toISOString()

export const newId = () => crypto.randomUUID()

export function transaction<T>(db: Database, work: () => T): T {
  db.exec('begin')
  try {
    const result = work()
    db.exec('commit')
    return result
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}
