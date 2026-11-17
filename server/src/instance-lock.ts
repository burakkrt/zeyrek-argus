import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ArgusError } from './errors.ts'

/**
 * Bir veri klasörünü tek sunucu kullanır. İkinci sunucu (ör. `pnpm dev` açıkken `pnpm start`) aynı veritabanını açınca
 * başlangıçta öbürünün çalışan koşularını "sunucu kapandı" diye kapatıyor, `--watch` her kod değişikliğinde bunu
 * yineliyordu (KOS-2026-0044, 0045). Kilit dosyası sahibinin süreç kimliğini taşır; sahibi ölmüşse kilit bayattır.
 */
export function acquireInstanceLock(dataDir: string, pid = process.pid): () => void {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'argus.lock')
  let owner: number
  try {
    owner = Number(readFileSync(file, 'utf8').trim()) || 0
  } catch {
    owner = 0
  }
  if (owner && owner !== pid && alive(owner))
    throw new ArgusError(
      'ALREADY_RUNNING',
      `Argus bu veri klasöründe zaten çalışıyor (süreç ${owner}). Aynı veritabanını iki sunucu kullanamaz: önce onu kapatın.`,
    )
  writeFileSync(file, String(pid))
  return () => rmSync(file, { force: true })
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
