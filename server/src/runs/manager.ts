import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { moduleOf, type AppRef, type RunInfo, type RunOptions, type Settings } from '@argus/shared'
import { PageController } from '../agent/page-controller.ts'
import { describeModelError, UsageMeter, type CreateMessage } from '../agent/model.ts'
import { appBlock, BASE_INSTRUCTIONS } from '../agent/prompts.ts'
import { BrowserSession } from '../browser/session.ts'
import type { Database } from '../db/database.ts'
import {
  createRun,
  failInterruptedRuns,
  finishRun,
  getRun,
  nextQueuedRun,
  saveUsage,
  startRun,
} from '../db/runs.ts'
import { getAppUser, getSettings } from '../db/settings.ts'
import { ArgusError, errorMessage } from '../errors.ts'
import type { IssueService } from '../issues/issues.ts'
import type { Learner } from '../memory/learn.ts'
import { selectRules } from '../memory/select.ts'
import { bumpEligible, bumpUses, ruleStats } from '../memory/stats.ts'
import type { MemoryStore } from '../memory/store.ts'
import { assertNotProduction, pageUrl } from '../platform/catalog.ts'
import type { Platform } from '../platform/platform.ts'
import { fetchAccessToken } from '../platform/token.ts'
import type { EventBus } from './bus.ts'

export interface RunManagerDeps {
  db: Database
  bus: EventBus
  platform: Platform
  memory: MemoryStore
  issues: IssueService
  learner: Learner
  dataDir: string
  /** Ayarlardaki modelle istek yapan işlev; anahtar yoksa hata fırlatır. */
  model: () => CreateMessage
  headless?: boolean
}

interface ActiveRun {
  id: string
  stop: boolean
  steering: string[]
}

/** Koşuları sırayla yürütür (aynı anda tek koşu). Sunucu açılırken yarım kalanlar "hata" ile kapanır. */
export class RunManager {
  private active: ActiveRun | null = null
  private kicking = false

  constructor(private readonly deps: RunManagerDeps) {
    failInterruptedRuns(deps.db)
  }

  get activeRunId(): string | null {
    return this.active?.id ?? null
  }

  create(input: {
    project: string
    application: string
    environment: string
    pages: string[]
    options?: Partial<RunOptions>
  }): RunInfo {
    assertNotProduction(input.environment)
    if (!input.pages.length) throw new ArgusError('NO_PAGES', 'En az bir sayfa seçin.')
    const settings = getSettings(this.deps.db)
    const options: RunOptions = {
      maxTasks: Math.min(Math.max(input.options?.maxTasks ?? settings.defaultOptions.maxTasks, 1), 12),
      maxSteps: Math.min(Math.max(input.options?.maxSteps ?? settings.defaultOptions.maxSteps, 3), 40),
    }
    const run = createRun(this.deps.db, { ...input, pages: [...new Set(input.pages)], options })
    this.deps.bus.runUpdated(run)
    void this.kick()
    return run
  }

  stop(runId: string): void {
    if (this.active?.id === runId) this.active.stop = true
    else {
      const run = getRun(this.deps.db, runId)
      if (run?.status === 'sirada') {
        finishRun(this.deps.db, runId, 'durduruldu', run.usage, null)
        this.deps.bus.runUpdated(getRun(this.deps.db, runId)!)
      }
    }
  }

  steer(runId: string, message: string): void {
    if (this.active?.id !== runId) throw new ArgusError('NOT_ACTIVE', 'Bu koşu şu an çalışmıyor.')
    this.active.steering.push(message.trim())
  }

  /** Sıradaki koşuyu başlatır; bittiğinde bir sonrakine geçer. */
  async kick(): Promise<void> {
    if (this.kicking || this.active) return
    this.kicking = true
    try {
      for (let run = nextQueuedRun(this.deps.db); run; run = nextQueuedRun(this.deps.db)) {
        this.active = { id: run.id, stop: false, steering: [] }
        await this.execute(run).catch(() => undefined)
        this.active = null
      }
    } finally {
      this.kicking = false
    }
  }

  private async execute(run: RunInfo): Promise<void> {
    const { db, bus, platform, memory, issues } = this.deps
    const app: AppRef = { project: run.project, application: run.application }
    const settings: Settings = getSettings(db)
    const meter = new UsageMeter()
    const active = this.active!
    const runDir = join(this.deps.dataDir, 'runs', run.id)
    mkdirSync(runDir, { recursive: true })
    const counters = { adim: 0, kanit: 0 }
    let lastUsageSave = 0
    let session: BrowserSession | null = null
    startRun(db, run.id)
    bus.runUpdated(getRun(db, run.id)!)
    bus.publish(run.id, null, { type: 'kosu-basladi', pages: run.pages })
    let status: RunInfo['status'] = 'bitti'
    let failure: string | null = null
    try {
      const model = this.deps.model()
      const access = platform.access()
      const environment = await platform.catalog.environment(run.project, run.environment)
      const urlOf = (page: string) =>
        pageUrl({
          studioBaseUrl: access.credentials.studioBaseUrl,
          project: run.project,
          application: run.application,
          page,
          environment,
        })
      const origin = new URL(access.credentials.studioBaseUrl).origin
      const token = await fetchAccessToken(access.credentials)
      session = await BrowserSession.open({
        origin,
        accessToken: token,
        headless: this.deps.headless ?? true,
        onFrame: (data) => bus.frame(run.id, data),
      })
      const signIn = await session.signIn(urlOf(run.pages[0]!), getAppUser(db, app))
      // Girişten önceki açılışın 401'leri ve konsol kayıtları sayfa bulgusu değildir.
      session.drainNetwork()
      session.drainProblems()
      session.drainBlocked()
      bus.publish(run.id, null, {
        type: 'bilgi',
        message:
          signIn === 'girildi' ? 'Uygulamanın giriş ekranından girildi.' : 'Platform jetonuyla girildi.',
      })
      const synced = issues.syncFromMemory(app)
      if (synced)
        bus.publish(run.id, null, { type: 'bilgi', message: `Takımın ${synced} kararı hafızadan okundu.` })

      for (const page of run.pages) {
        if (active.stop) break
        const url = urlOf(page)
        bus.publish(run.id, page, { type: 'sayfa-basladi', url })
        const rules = memory.rules(app)
        const stats = ruleStats(db)
        const selection = selectRules(rules, app, page, settings.ruleBudget, (id) => stats.get(id)?.uses ?? 0)
        bumpEligible(
          db,
          selection.used.map((r) => r.id),
        )
        if (selection.dropped.length) {
          bus.publish(run.id, page, {
            type: 'bilgi',
            message: `Kural bütçesi doldu: ${selection.dropped.length} kural isteme giremedi (${selection.dropped.map((r) => r.id).join(', ')}). Hafıza → Bakım önerilir.`,
          })
        }
        const controller = new PageController({
          session,
          url,
          page,
          facts: {
            openIssues: issues.openOnPage(app, page),
            known: issues.knownInModule(app, moduleOf(page)),
            rejected: issues.rejected(app),
          },
          patterns: selection.patterns,
          system: [
            { type: 'text', text: BASE_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: appBlock({ app, rules: selection, notes: memory.appNotes(app) }) },
          ],
          createMessage: model,
          meter,
          settings,
          maxTasks: run.options.maxTasks,
          maxSteps: run.options.maxSteps,
          ruleStats: {
            used: selection.used.length,
            dropped: selection.dropped.length,
            tokens: selection.tokens,
          },
          hooks: {
            emit: (body) => bus.publish(run.id, page, body),
            record: (draft) => {
              const result = issues.record({ ...draft, app, runId: run.id, page })
              const cited = [...draft.rules, ...(draft.suppressedByRule ? [draft.suppressedByRule] : [])]
              if (cited.length) bumpUses(db, cited)
              return result
            },
            retract: (key) => issues.retract(app, run.id, page, key),
            markFixed: (key, note) => issues.markFixed(app, key, note),
            closeVanishedEyeIssues: (keys) => issues.closeVanishedEyeIssues(app, page, keys),
            file: (kind) => {
              counters[kind] += 1
              const rel = `${kind}/${String(counters[kind]).padStart(4, '0')}.jpg`
              return { abs: join(runDir, rel), rel }
            },
            drainSteering: () => active.steering.splice(0),
            stopped: () => active.stop,
            usageChanged: () => {
              const at = Date.now()
              if (at - lastUsageSave < 1_500) return
              lastUsageSave = at
              saveUsage(db, run.id, meter.usage)
              bus.runUpdated(getRun(db, run.id)!)
            },
          },
        })
        await controller.run().catch((error: unknown) => {
          bus.publish(run.id, page, { type: 'hata', message: `${page}: ${describeModelError(error)}` })
        })
      }
      if (active.stop) status = 'durduruldu'
    } catch (error) {
      status = 'hata'
      failure = describeModelError(error)
      bus.publish(run.id, null, { type: 'hata', message: failure })
    } finally {
      await session?.close()
    }
    finishRun(db, run.id, status, meter.usage, failure)
    bus.publish(run.id, null, {
      type: 'kosu-bitti',
      status,
      usage: meter.usage,
      ...(failure ? { error: failure } : {}),
    })
    bus.runUpdated(getRun(db, run.id)!)
    await this.autoLearn(app, run.id, settings)
  }

  /** Yeterince yeni karar birikmişse koşu sonunda ders çıkarıcı kendiliğinden çalışır. */
  private async autoLearn(app: AppRef, runId: string, settings: Settings): Promise<void> {
    if (settings.learnAfterDecisions <= 0) return
    const pending = this.deps.learner.pendingDecisions(app)
    if (pending < settings.learnAfterDecisions) return
    try {
      const proposals = await this.deps.learner.learnFromDecisions(app, settings.author || 'Argus')
      const auto = proposals.filter((p) => p.status === 'otomatik').length
      this.deps.bus.publish(runId, null, {
        type: 'bilgi',
        message: `Ders çıkarıldı: ${proposals.length} öneri (${auto} kendiliğinden devrede, ${proposals.length - auto} onay bekliyor).`,
      })
    } catch (error) {
      this.deps.bus.publish(runId, null, {
        type: 'hata',
        message: `Ders çıkarılamadı: ${errorMessage(error)}`,
      })
    }
  }
}
