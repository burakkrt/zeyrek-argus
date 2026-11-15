import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/database.ts'
import {
  claimStorageNotice,
  cleanStorage,
  NOTICE_INTERVAL_MS,
  planCleanup,
  storageStatus,
  TARGET_RATIO,
  type RunDisk,
} from './storage.ts'

const NOW = Date.parse('2026-11-15T12:00:00Z')
const GB = 1024 * 1024 * 1024
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
const run = (id: string, age: number, recording: number, evidence = 0, active = false): RunDisk => ({
  id,
  createdAt: daysAgo(age),
  active,
  recordingBytes: recording,
  evidenceBytes: evidence,
})
/** Hedefi (sınırın %70'i) bayt olarak verilen sınır. */
const limitFor = (targetBytes: number) => targetBytes / TARGET_RATIO / GB

let dir: string
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

describe('yerel depolama', () => {
  it('plan: hedefe inene kadar önce en eski kayıtlar, sonra en eski kanıtlar; süren koşuya dokunulmaz', () => {
    const runs = [run('yeni', 1, 400, 50), run('orta', 5, 400, 50), run('eski', 9, 400, 50, true), run('ilk', 20, 400, 50)]
    expect(planCleanup(runs, 1800, 1000)).toEqual({ recordings: ['ilk', 'orta'], evidence: [] })
    expect(planCleanup(runs, 1800, 500)).toEqual({ recordings: ['ilk', 'orta', 'yeni'], evidence: ['ilk', 'orta'] })
    expect(planCleanup(runs, 900, 1000)).toEqual({ recordings: [], evidence: [] })
  })

  it('bildirim: yalnız sınır aşılınca ve üç günde en çok bir kez', () => {
    const db = openDatabase(':memory:')
    const status = (over: boolean) => ({ ...storageStatus(tmpdir(), 1), over })
    expect(claimStorageNotice(db, status(false), NOW)).toBe(false)
    expect(claimStorageNotice(db, status(true), NOW)).toBe(true)
    expect(claimStorageNotice(db, status(true), NOW + NOTICE_INTERVAL_MS - 60_000)).toBe(false)
    expect(claimStorageNotice(db, status(true), NOW + NOTICE_INTERVAL_MS)).toBe(true)
  })

  it('temizlik: sahipsiz eski ek, sonra en eski kayıt silinir; hedefe inince durur; sorunun son kanıtı hiç silinmez', () => {
    dir = mkdtempSync(join(tmpdir(), 'argus-depolama-'))
    const db = openDatabase(':memory:')
    const insertRun = (id: string, age: number, attachments: string[] = []) =>
      db
        .prepare(
          `insert into runs (id, code, project, application, environment, pages, options, status, usage, created_at)
           values (?, ?, 'qm', 'web', 'development', '[]', ?, 'bitti', '{}', ?)`,
        )
        .run(id, `KOS-${id}`, JSON.stringify({ attachments }), daysAgo(age))
    const files = (id: string) => {
      for (const d of ['kare', 'adim', 'kanit']) mkdirSync(join(dir, 'runs', id, d), { recursive: true })
      writeFileSync(join(dir, 'runs', id, 'kare', '1.jpg'), Buffer.alloc(1000))
      writeFileSync(join(dir, 'runs', id, 'adim', '0001.jpg'), Buffer.alloc(1000))
    }
    insertRun('eski', 120, ['ek-eski.png'])
    insertRun('yeni', 1)
    files('eski')
    files('yeni')
    writeFileSync(join(dir, 'runs', 'eski', 'kanit', '0001.png'), Buffer.alloc(100))
    writeFileSync(join(dir, 'runs', 'eski', 'kanit', '0002.png'), Buffer.alloc(100))
    db.prepare(
      `insert into issues (id, project, application, key, title, kind, status, source, first_seen, last_seen, seen_count)
       values ('i1', 'qm', 'web', 'yz:a', 'A', 'kesin', 'acik', 'yz', ?, ?, 1)`,
    ).run(daysAgo(120), daysAgo(120))
    db.prepare(
      `insert into occurrences (id, issue_id, run_id, page, phase, kind, outcome, scenario, expected, observed, shot, rules, at)
       values ('o1', 'i1', 'eski', 'p', 'gorev', 'kesin', 'yeni', '', '', '', 'kanit/0001.png', '[]', ?)`,
    ).run(daysAgo(120))
    mkdirSync(join(dir, 'ekler'), { recursive: true })
    for (const name of ['ek-eski.png', 'sahipsiz.png', 'taze.png']) writeFileSync(join(dir, 'ekler', name), 'x')
    const old = new Date(NOW - 3 * 86_400_000)
    for (const name of ['ek-eski.png', 'sahipsiz.png']) utimesSync(join(dir, 'ekler', name), old, old)
    utimesSync(join(dir, 'ekler', 'taze.png'), new Date(NOW), new Date(NOW))

    // Toplam ~4.2 KB, hedef 2.5 KB: en eski koşunun kaydı yeter, kanıta dokunulmaz.
    expect(storageStatus(dir, limitFor(2500)).over).toBe(true)
    const first = cleanStorage(db, dir, limitFor(2500), NOW)
    expect(first).toMatchObject({ recordingsDropped: 1, evidenceFilesDropped: 0, attachmentsDropped: 1 })
    expect(existsSync(join(dir, 'runs', 'eski', 'kare'))).toBe(false)
    expect(existsSync(join(dir, 'runs', 'eski', 'adim'))).toBe(false)
    expect(existsSync(join(dir, 'runs', 'eski', 'kayit-silindi'))).toBe(true)
    expect(existsSync(join(dir, 'runs', 'yeni', 'kare', '1.jpg'))).toBe(true)
    expect(existsSync(join(dir, 'runs', 'eski', 'kanit', '0002.png'))).toBe(true)
    expect(existsSync(join(dir, 'ekler', 'sahipsiz.png'))).toBe(false)
    expect(existsSync(join(dir, 'ekler', 'ek-eski.png'))).toBe(true)
    expect(existsSync(join(dir, 'ekler', 'taze.png'))).toBe(true)
    expect(storageStatus(dir, limitFor(2500)).usage.total).toBeLessThanOrEqual(2500)
    expect(first.freedBytes).toBeGreaterThan(0)

    // Hedef çok düşükse kayıtlardan sonra eski kanıtlar gider; sorunun son kanıtı kalır.
    const second = cleanStorage(db, dir, limitFor(50), NOW)
    expect(second).toMatchObject({ recordingsDropped: 1, evidenceFilesDropped: 1 })
    expect(existsSync(join(dir, 'runs', 'eski', 'kanit', '0001.png'))).toBe(true)
    expect(existsSync(join(dir, 'runs', 'eski', 'kanit', '0002.png'))).toBe(false)
  })
})
