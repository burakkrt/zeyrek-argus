import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parse } from 'dotenv'
import { ArgusError } from './errors.ts'

export interface Config {
  rootDir: string
  envFile: string | null
  port: number
  dataDir: string
  memoryDir: string
  zeyrekAppDir: string | null
  anthropicApiKey: string | null
  /** Anahtarın nereden geldiği; arayüzde gösterilir ki hangi anahtarın harcandığı belli olsun. */
  anthropicKeySource: '.env' | 'ortam değişkeni' | null
}

/** Depo kökü: `pnpm-workspace.yaml` dosyasının bulunduğu ilk üst klasör. */
export function findRoot(start = process.cwd()): string {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new ArgusError('ROOT', `Argus depo kökü bulunamadı (${start}).`)
    dir = parent
  }
}

const nonEmpty = (source: Record<string, string | undefined>) =>
  Object.fromEntries(Object.entries(source).filter(([, v]) => (v ?? '').trim() !== '')) as Record<
    string,
    string
  >

/**
 * Ayarlar `.env` dosyasından okunur. Aynı ad ortam değişkeninde de varsa `.env` kazanır: Argus'un hangi anahtarla
 * çalıştığı tek dosyadan anlaşılsın (makinedeki genel bir ANTHROPIC_API_KEY sessizce devreye girmesin).
 */
export function loadConfig(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Config {
  const rootDir = findRoot(options.cwd)
  const envPath = join(rootDir, '.env')
  const envFile = existsSync(envPath) ? envPath : null
  const fromFile = envFile ? nonEmpty(parse(readFileSync(envFile))) : {}
  const fromProcess = nonEmpty(options.env ?? process.env)
  const get = (key: string) => fromFile[key] ?? fromProcess[key]
  const path = (value: string) => (isAbsolute(value) ? value : resolve(rootDir, value))

  const port = Number(get('ARGUS_PORT') ?? 5300)
  if (!Number.isInteger(port) || port <= 0)
    throw new ArgusError('CONFIG', `ARGUS_PORT geçersiz: ${get('ARGUS_PORT')}`)
  const key = get('ANTHROPIC_API_KEY') ?? null
  return {
    rootDir,
    envFile,
    port,
    dataDir: path(get('ARGUS_DATA_DIR') ?? './data'),
    memoryDir: path(get('ARGUS_MEMORY_DIR') ?? './memory'),
    zeyrekAppDir: get('ARGUS_ZEYREK_APP_DIR') ? path(get('ARGUS_ZEYREK_APP_DIR')!) : null,
    anthropicApiKey: key,
    anthropicKeySource: key ? (fromFile.ANTHROPIC_API_KEY ? '.env' : 'ortam değişkeni') : null,
  }
}
