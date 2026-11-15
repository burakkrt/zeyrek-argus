import { existsSync, mkdirSync, rmSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import { moduleOf, RUN_CEILINGS, type AppRef, type RunInfo, type RunOptions, type Settings } from '@argus/shared'
import { PageController } from '../agent/page-controller.ts'
import { pickPages } from '../agent/page-picker.ts'
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
  setRunPages,
  startRun,
} from '../db/runs.ts'
import { appSessionFile, getAppUser, getSettings, listAppUsers } from '../db/settings.ts'
import { planIdentity } from '../identity/plan.ts'
import { parseSuperLogin, type SuperLoginSpec } from '../identity/super-login.ts'
import { endSuperLogin, reserveSuperLogin, switchUser } from '../identity/switch.ts'
import { ArgusError, errorMessage } from '../errors.ts'
import { loadAttachments, validAttachments } from './attachments.ts'
import { renderKnowledge } from '../agent/knowledge.ts'
import { ScreenMemory } from './screens.ts'
import { authorSlug } from '../memory/shared.ts'
import type { IssueService } from '../issues/issues.ts'
import type { Learner } from '../memory/learn.ts'
import { selectRules } from '../memory/select.ts'
import { bumpEligible, bumpUses, ruleStats } from '../memory/stats.ts'
import type { MemoryStore } from '../memory/store.ts'
import { assertNotProduction, pageUrl } from '../platform/catalog.ts'
import type { Platform } from '../platform/platform.ts'
import { fetchAccessToken } from '../platform/token.ts'
import type { EventBus } from './bus.ts'
import { comparePrints, describeChange, lastPrint, savePrint, studioPrint, type PagePrint } from './prints.ts'

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
  /** Paylaşılan dosyalarda (`findings/`, `pages/`, `screens/`) bu makinenin yazar adı. */
  author: () => string
  headless?: boolean
}

interface ActiveRun {
  id: string
  stop: boolean
  steering: string[]
}

/** Koşuları sırayla yürütür (aynı anda tek koşu). Sunucu açılırken yarım kalanlar "hata" ile kapanır. */
/** Talimatın üst sınırı (karakter): isteme sınırsız metin girmesin. */
const BRIEF_LIMIT = 2_000

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
    // Sayfa seçmek isteğe bağlıdır: yalnız girdi (ya da ek) verilirse sayfalar koşu başında girdiden seçilir.
    if (!input.pages.length && !input.options?.brief?.trim() && !input.options?.attachments?.length)
      throw new ArgusError('NO_PAGES', 'Sayfa seçin ya da girdi yazın.')
    // Görev ve adım kullanıcıya bırakılmaz (kalite önceliklidir); tavanlar yalnız kaçağı durdurur.
    const options: RunOptions = {
      maxTasks: Math.min(Math.max(input.options?.maxTasks ?? RUN_CEILINGS.maxTasks, 1), RUN_CEILINGS.maxTasks),
      maxSteps: Math.min(Math.max(input.options?.maxSteps ?? RUN_CEILINGS.maxSteps, 3), RUN_CEILINGS.maxSteps),
      user: input.options?.user?.trim() || null,
      brief: input.options?.brief?.trim().slice(0, BRIEF_LIMIT) || null,
      attachments: validAttachments(this.deps.dataDir, input.options?.attachments),
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
    // Kayıt (kayıttan izleme): ekran yayınının kareleri `kare/<an>.jpg`; giriş ve kimlik kurulurken yazılmaz.
    const frameDir = join(runDir, 'kare')
    let recording = false
    const onFrame = (data: string, at: number) => {
      bus.frame(run.id, data, at)
      if (recording) writeFile(join(frameDir, `${at}.jpg`), Buffer.from(data, 'base64'), () => undefined)
    }
    let lastUsageSave = 0
    let session: BrowserSession | null = null
    // Süper giriş açıldıysa koşu sonunda (hata olsa da) kapatılır.
    let superLogin: SuperLoginSpec | null = null
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
      // Talimatın ekleri bir kez okunur, her sayfanın planlayıcısına gider.
      const attachments = loadAttachments(this.deps.dataDir, run.options.attachments ?? [])
      // Sayfa seçilmediyse (yalnız girdi) sayfalar girdiden seçilir; koşunun kaydı o sayfalarla güncellenir.
      let pages = run.pages
      if (!pages.length) {
        const picked = await pickPages({
          createMessage: model,
          meter,
          model: settings.models.planner,
          brief: run.options.brief ?? null,
          attachments,
          catalog: await platform.catalog.pages(run.project, run.application, run.environment),
        })
        if (!picked.pages.length)
          throw new ArgusError('NO_PAGES', 'Girdiden test edilecek sayfa çıkarılamadı; sayfa seçin ya da girdiyi açın.')
        pages = picked.pages
        setRunPages(db, run.id, pages)
        bus.runUpdated(getRun(db, run.id)!)
        bus.publish(run.id, null, {
          type: 'bilgi',
          message: `Girdiye göre ${pages.length} sayfa seçildi: ${pages.join(', ')}.${picked.reason ? ` ${picked.reason}` : ''}`,
        })
      }
      // Kimlik koşudan önce, modelsiz belirlenir (`identity/plan.ts`); kurulamıyorsa koşu burada durur.
      const spec = parseSuperLogin(memory.identity(app))
      const plan = planIdentity(run.options.user, listAppUsers(db, app), spec !== null)
      if (plan.kind === 'yok') throw new ArgusError('IDENTITY', plan.message)
      const appUser =
        plan.kind === 'hesap'
          ? getAppUser(db, app, plan.identifier)
          : plan.kind === 'super'
            ? getAppUser(db, app, plan.base)
            : null
      const origin = new URL(access.credentials.studioBaseUrl).origin
      const token = await fetchAccessToken(access.credentials)
      // Uygulama oturumu saklanır: her koşu yeniden giriş yapmaz, süresi dolunca giriş ekranından yeniden girilir.
      const stateFile = appUser ? appSessionFile(this.deps.dataDir, app, appUser.identifier) : null
      const hadState = stateFile !== null && existsSync(stateFile)
      session = await BrowserSession.open({
        origin,
        accessToken: token,
        headless: this.deps.headless ?? true,
        onFrame,
        ...(stateFile ? { storageState: stateFile } : {}),
      })
      const signIn = await session.signIn(urlOf(pages[0]!), appUser).catch((error: unknown) => {
        // Giriş tutmadıysa saklanan oturum da geçersizdir: sonraki koşu temiz başlar.
        if (stateFile) rmSync(stateFile, { force: true })
        throw error
      })
      // Saklanan oturum hep asıl hesabındır: süper girişten önce yazılır, sonra yazılmaz.
      if (stateFile && (signIn === 'girildi' || hadState)) await session.saveState(stateFile)
      const who = appUser ? ` (${appUser.identifier})` : ''
      bus.publish(run.id, null, {
        type: 'bilgi',
        message:
          signIn === 'girildi'
            ? `Uygulamanın giriş ekranından girildi${who}; oturum sonraki koşular için saklandı.`
            : hadState
              ? `Saklanan uygulama oturumu sürdürüldü${who}; yeniden giriş yapılmadı.`
              : 'Platform jetonuyla girildi.',
      })
      if (spec) reserveSuperLogin(session, origin, app, spec)
      if (plan.kind === 'super' && spec) {
        const person = await switchUser(session, app, spec, plan.target, run.environment)
        superLogin = spec
        bus.publish(run.id, null, {
          type: 'bilgi',
          message: `Süper girişle ${person.label} kişisine geçildi (asıl hesap: ${plan.base}); koşu sonunda kapatılacak.`,
        })
      }
      // Girişten önceki açılışın 401'leri ve konsol kayıtları sayfa bulgusu değildir.
      session.drainNetwork()
      session.drainProblems()
      session.drainBlocked()
      mkdirSync(frameDir, { recursive: true })
      recording = true
      const author = this.deps.author()
      const synced = issues.syncFromMemory(app, author)
      if (synced)
        bus.publish(run.id, null, { type: 'bilgi', message: `Takımın ${synced} kararı hafızadan okundu.` })

      for (const page of pages) {
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
        const knowledge = memory.pageKnowledge(app, page)
        const screens = new ScreenMemory(memory.screenDir(app, page), authorSlug(author))
        // Bu koşunun sayfa izi: sayfa bilgisiyle birlikte saklanır (takım genelinde "ne değişti?" dayanağı).
        let current: PagePrint | null = null
        const controller = new PageController({
          session,
          url,
          page,
          facts: {
            openIssues: issues.openOnPage(app, page),
            known: issues.knownInModule(app, moduleOf(page)),
            rejected: issues.rejected(app),
            knowledge: knowledge?.body ?? null,
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
          brief: run.options.brief ?? null,
          attachments,
          ruleStats: {
            used: selection.used.length,
            dropped: selection.dropped.length,
            tokens: selection.tokens,
          },
          hooks: {
            emit: (body) => bus.publish(run.id, page, body),
            pointer: (tool, target, at) => bus.pointer(run.id, tool, target, at),
            record: (draft) => {
              const result = issues.record({ ...draft, app, runId: run.id, page })
              const cited = [...draft.rules, ...(draft.suppressedByRule ? [draft.suppressedByRule] : [])]
              if (cited.length) bumpUses(db, cited)
              return result
            },
            retract: (key) => issues.retract(app, run.id, page, key),
            markFixed: (key, note) => issues.markFixed(app, key, note),
            closeVanishedEyeIssues: (keys) => issues.closeVanishedEyeIssues(app, page, keys),
            lastSighting: (issue) => issues.lastSighting(issue.id, page),
            print: async (ui, api) => {
              const studio = await platform.catalog
                .pageSchema(run.project, run.application, run.environment, page)
                .then(studioPrint)
                .catch(() => null)
              const print = { ui, api, studio }
              current = print
              // Sayfa bilgisi varsa (kimin koşusundan gelirse gelsin) değişiklik onun yazıldığı andaki ize göre, yoksa bu
              // makinenin son koşusuna göre ölçülür.
              const basis = knowledge?.print ? 'bilgi' : 'kosu'
              const change = comparePrints(
                knowledge?.print ?? lastPrint(db, app, run.environment, page),
                print,
              )
              savePrint(db, { ...app, environment: run.environment, page, runId: run.id, print })
              bus.publish(run.id, page, { type: 'bilgi', message: describeChange(change, basis) })
              return change
            },
            screenMemory: (print) => screens.get(print),
            rememberScreen: (print, label, notes) => screens.remember(print, label, notes),
            saveKnowledge: (distilled) => {
              if (!current) return
              const at = new Date().toISOString()
              const content = renderKnowledge(distilled, { page, author, run: run.code, at, print: current })
              memory.writePageKnowledge(app, page, author, content)
            },
            file: (kind) => {
              counters[kind] += 1
              const rel = `${kind}/${String(counters[kind]).padStart(4, '0')}.${kind === 'kanit' ? 'png' : 'jpg'}`
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
      if (session && superLogin) {
        const ended = await endSuperLogin(session, app, superLogin, run.environment)
        bus.publish(run.id, null, {
          type: ended ? 'bilgi' : 'hata',
          message: ended
            ? 'Süper giriş kapatıldı.'
            : 'Süper giriş kapatılamadı; uygulamada kullanıcı menüsünden sonlandırın.',
        })
      }
      await session?.close()
    }
    finishRun(db, run.id, status, meter.usage, failure)
    // Bu makinenin açık bulguları takımla paylaşılır (kişinin kendi dosyası; başkasınınkine dokunulmaz).
    try {
      memory.writeSharedFindings(app, this.deps.author(), issues.ownFindings(app))
    } catch (error) {
      bus.publish(run.id, null, {
        type: 'hata',
        message: `Paylaşılan bulgular yazılamadı: ${describeModelError(error)}`,
      })
    }
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
