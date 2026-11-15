import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { StorageCleanup, StorageStatus, StorageUsage } from '@argus/shared'
import type { Database } from '../db/database.ts'
import { json } from '../db/database.ts'

/**
 * Yerel depolama: koşunun ham kaydı (video kareleri `kare/`, adım görüntüleri `adim/`), kanıt görüntüleri (`kanit/`),
 * talimat ekleri (`data/ekler/`) ve veritabanı yalnız bu bilgisayarda durur, Git'e girmez. Tek koşul toplam boyuttur
 * (Ayarlar → `storageLimitGb`):
 * - Sınır aşılınca uygulama açılışında üç günde en çok bir kez bildirim çıkar (kullanıcıyı sıkmadan hatırlatır); kendiliğinden hiçbir şey silinmez.
 * - Kullanıcı temizleyince toplam sınırın %70'ine (`TARGET_RATIO`) indirilir; böylece temizlikten sonraki ilk koşu
 *   yeniden uyarı doğurmaz. Silme sırası: hiçbir koşunun kullanmadığı ekler → en eski koşuların kaydı → en eski
 *   koşuların kanıtları. Süren koşuya, her sorunun en son kanıtına (bulgu ekranındaki görüntü) ve veritabanına
 *   dokunulmaz. Kaydı silinen koşunun klasörüne `RECORDING_DROPPED` işareti bırakılır (izleme ekranı söyler).
 * - Paylaşılan hafıza (`memory/`, Git) bu hesaba girmez ve hiç silinmez: takımın öğrendikleri oradadır.
 */

export const TARGET_RATIO = 0.7
export const NOTICE_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000
export const RECORDING_DROPPED = 'kayit-silindi'

const GB = 1024 * 1024 * 1024
const DAY = 86_400_000
const RECORDING_DIRS = ['kare', 'adim'] as const

export interface RunDisk {
  id: string
  createdAt: string
  active: boolean
  recordingBytes: number
  /** Silinebilir kanıt baytı (sorunların en son kanıtı hariç). */
  evidenceBytes: number
}

/**
 * Hedefe inmek için silinecekler: önce en eski koşuların kaydı, yetmezse en eski koşuların kanıtı. `total` silinecek
 * eklerden sonraki toplamdır.
 */
export function planCleanup(
  runs: RunDisk[],
  total: number,
  target: number,
): { recordings: string[]; evidence: string[] } {
  const oldest = runs.filter((r) => !r.active).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const recordings: string[] = []
  const evidence: string[] = []
  for (const run of oldest) {
    if (total <= target) break
    if (run.recordingBytes === 0) continue
    recordings.push(run.id)
    total -= run.recordingBytes
  }
  for (const run of oldest) {
    if (total <= target) break
    if (run.evidenceBytes === 0) continue
    evidence.push(run.id)
    total -= run.evidenceBytes
  }
  return { recordings, evidence }
}

function sizeOf(path: string): number {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.size
  return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0)
}

export function storageUsage(dataDir: string): StorageUsage {
  const runsDir = join(dataDir, 'runs')
  const runIds = existsSync(runsDir) ? readdirSync(runsDir) : []
  const recordings = runIds.reduce(
    (sum, id) => sum + RECORDING_DIRS.reduce((s, d) => s + sizeOf(join(runsDir, id, d)), 0),
    0,
  )
  const evidence = runIds.reduce((sum, id) => sum + sizeOf(join(runsDir, id, 'kanit')), 0)
  const attachments = sizeOf(join(dataDir, 'ekler'))
  const database = ['argus.db', 'argus.db-wal', 'argus.db-shm'].reduce(
    (s, f) => s + sizeOf(join(dataDir, f)),
    0,
  )
  return {
    recordings,
    evidence,
    attachments,
    database,
    total: recordings + evidence + attachments + database,
  }
}

export function storageStatus(dataDir: string, limitGb: number): StorageStatus {
  const usage = storageUsage(dataDir)
  const limitBytes = Math.round(limitGb * GB)
  return { usage, limitBytes, targetBytes: Math.round(limitBytes * TARGET_RATIO), over: usage.total > limitBytes }
}

/**
 * Sınır aşıldıysa ve son bildirimden bu yana üç gün geçtiyse bildirim zamanını yazar ve `true` döner. Uygulama her
 * açılışta sorar; karar sunucuda verildiği için birden çok sekme ya da yenileme bu süre içinde ikinci bildirim çıkarmaz.
 */
export function claimStorageNotice(db: Database, status: StorageStatus, now = Date.now()): boolean {
  if (!status.over) return false
  const row = db.prepare(`select value from settings where key = 'storage_notice_at'`).get() as
    | { value: string }
    | undefined
  if (row && now - Number(row.value) < NOTICE_INTERVAL_MS) return false
  db.prepare(
    `insert into settings (key, value) values ('storage_notice_at', ?) on conflict(key) do update set value = excluded.value`,
  ).run(String(now))
  return true
}

/** Kullanıcının istediği temizlik: toplamı sınırın %70'ine indirir (bkz. dosya başı). */
export function cleanStorage(db: Database, dataDir: string, limitGb: number, now = Date.now()): StorageCleanup {
  const before = storageUsage(dataDir).total
  const target = Math.round(limitGb * GB * TARGET_RATIO)
  const runsDir = join(dataDir, 'runs')
  const rows = db.prepare('select id, created_at, status, options from runs').all() as Array<{
    id: string
    created_at: string
    status: string
    options: string
  }>

  // Ekler: hiçbir koşunun kullanmadığı ek 1 gün sonra gider (yeni koşu formunda henüz eklenmiş olabilir).
  const used = new Set(rows.flatMap((r) => json<{ attachments?: string[] }>(r.options, {}).attachments ?? []))
  let attachmentsDropped = 0
  const ekler = join(dataDir, 'ekler')
  if (existsSync(ekler))
    for (const name of readdirSync(ekler)) {
      if (used.has(name) || now - statSync(join(ekler, name)).mtimeMs < DAY) continue
      rmSync(join(ekler, name), { force: true })
      attachmentsDropped += 1
    }

  // Her sorunun en son kanıtı korunur: bulgu ekranı onu gösterir.
  const keep = new Set(
    (
      db
        .prepare(
          `select o.run_id, o.shot from occurrences o
           where o.shot is not null and o.at = (select max(at) from occurrences x where x.issue_id = o.issue_id and x.shot is not null)`,
        )
        .all() as Array<{ run_id: string; shot: string }>
    ).map((r) => `${r.run_id}/${r.shot}`),
  )
  const droppable = (id: string) => {
    const dir = join(runsDir, id, 'kanit')
    return existsSync(dir) ? readdirSync(dir).filter((name) => !keep.has(`${id}/kanit/${name}`)) : []
  }
  const runs: RunDisk[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    active: r.status === 'sirada' || r.status === 'calisiyor',
    recordingBytes: RECORDING_DIRS.reduce((s, d) => s + sizeOf(join(runsDir, r.id, d)), 0),
    evidenceBytes: droppable(r.id).reduce((s, name) => s + sizeOf(join(runsDir, r.id, 'kanit', name)), 0),
  }))

  const plan = planCleanup(runs, storageUsage(dataDir).total, target)
  for (const id of plan.recordings) {
    for (const d of RECORDING_DIRS) rmSync(join(runsDir, id, d), { recursive: true, force: true })
    writeFileSync(join(runsDir, id, RECORDING_DROPPED), new Date(now).toISOString())
  }
  let evidenceFilesDropped = 0
  for (const id of plan.evidence)
    for (const name of droppable(id)) {
      rmSync(join(runsDir, id, 'kanit', name), { force: true })
      evidenceFilesDropped += 1
    }

  return {
    recordingsDropped: plan.recordings.length,
    evidenceFilesDropped,
    attachmentsDropped,
    freedBytes: Math.max(0, before - storageUsage(dataDir).total),
  }
}
