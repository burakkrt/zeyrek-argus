import { join } from 'node:path'
import { anthropicModel, type CreateMessage } from './agent/model.ts'
import { subscriptionModel } from './agent/subscription.ts'
import { detectAuthor, type Author } from './author.ts'
import type { Config } from './config.ts'
import { openDatabase, type Database } from './db/database.ts'
import { getSettings } from './db/settings.ts'
import { ArgusError } from './errors.ts'
import { IssueService } from './issues/issues.ts'
import { Learner } from './memory/learn.ts'
import { MemoryStore } from './memory/store.ts'
import type { PlatformAccess } from './platform/credentials.ts'
import { Platform } from './platform/platform.ts'
import { EventBus } from './runs/bus.ts'
import { RunManager } from './runs/manager.ts'

/** Sunucunun bütün servisleri. Testte platform erişimi ve model dışarıdan verilir. */
export interface AppContext {
  config: Config
  db: Database
  bus: EventBus
  memory: MemoryStore
  issues: IssueService
  platform: Platform
  learner: Learner
  runs: RunManager
  model: () => CreateMessage
  /** Bu makinenin yazar kimliği (otomatik; kullanıcı belirlemez). */
  author: () => Author
}

export function createContext(
  config: Config,
  overrides: {
    access?: PlatformAccess
    model?: CreateMessage
    headless?: boolean
    dbFile?: string
    author?: Author
  } = {},
): AppContext {
  const db = openDatabase(overrides.dbFile ?? join(config.dataDir, 'argus.db'))
  const bus = new EventBus(db)
  const memory = new MemoryStore(config.memoryDir)
  const issues = new IssueService(db, memory)
  const platform = new Platform(config, overrides.access)
  // Sağlayıcı her koşunun başında ayardan okunur: Claude hesabı (abonelik) ya da API anahtarı.
  let api: CreateMessage | null = null
  let subscription: CreateMessage | null = null
  const model = (): CreateMessage => {
    if (overrides.model) return overrides.model
    if (getSettings(db).provider === 'abonelik') return (subscription ??= subscriptionModel())
    if (!config.anthropicApiKey)
      throw new ArgusError(
        'NO_KEY',
        'API anahtarı yok: .env dosyasına ANTHROPIC_API_KEY ekleyin ya da Ayarlar → Yapay zekâ ve öğrenme’den Claude hesabını seçin.',
      )
    return (api ??= anthropicModel(config.anthropicApiKey))
  }
  const identity = overrides.author ?? detectAuthor(config.rootDir)
  const author = () => identity
  const learner = new Learner({ db, memory, issues, model, settings: () => getSettings(db) })
  const runs = new RunManager({
    db,
    bus,
    platform,
    memory,
    issues,
    learner,
    dataDir: config.dataDir,
    model,
    author,
    headless: overrides.headless ?? true,
  })
  return { config, db, bus, memory, issues, platform, learner, runs, model, author }
}
