import { existsSync, mkdirSync, rmSync, writeFile } from 'node:fs'
import { join } from 'node:path'
import {
  DEFINITION_PAGE,
  moduleOf,
  RUN_CEILINGS,
  SCOPE_LABELS,
  type PlatformRead,
  type RunCoverage,
  type StrategyItem,
  type AppRef,
  type PlanState,
  type RunInfo,
  type RunStrategy,
  type RunOptions,
  type Settings,
} from '@argus/shared'
import { findingReport } from '../issues/report.ts'
import { revisionBrief, sanitizePlan } from '../agent/plan-brief.ts'
import { severityOf } from '../issues/severity.ts'
import { PageController } from '../agent/page-controller.ts'
import type { Author } from '../author.ts'
import {
  CLEANUP_CEILING,
  DEFINITION_PARALLEL,
  investigate,
  type DefinitionFinding,
} from '../agent/investigator.ts'
import { inspectsScreens, normalizeItems, pageWork, planRun, scanStrategy } from '../agent/strategist.ts'
import { supervise, SUPERVISE_ROUNDS } from '../agent/supervisor.ts'
import { describeModelError, UsageMeter, type CreateMessage, type MessageParams } from '../agent/model.ts'
import { appBlock } from '../agent/prompts.ts'
import { BrowserSession } from '../browser/session.ts'
import type { Database } from '../db/database.ts'
import {
  createRun,
  failInterruptedRuns,
  finishRun,
  getRun,
  nextQueuedRun,
  saveUsage,
  setRunCoverage,
  setRunPages,
  startRun,
  closeRun,
  getPlan,
  setPlan,
} from '../db/runs.ts'
import { appSessionFile, getAppUser, getSettings, listAppUsers } from '../db/settings.ts'
import { planIdentity } from '../identity/plan.ts'
import { parseSuperLogin, type SuperLoginSpec } from '../identity/super-login.ts'
import { endSuperLogin, reserveSuperLogin, switchUser } from '../identity/switch.ts'
import { ArgusError, errorMessage } from '../errors.ts'
import { loadAttachments, validAttachments } from './attachments.ts'
import { renderKnowledge } from '../agent/knowledge.ts'
import { RunTrace } from './trace.ts'
import { PlatformReader, readStep } from '../platform/reader.ts'
import type { IssueService } from '../issues/issues.ts'
import { chooseGuides, guideIndex, guidesText } from '../memory/guides.ts'
import type { Learner } from '../memory/learn.ts'
import type { TextBlockParam } from '../agent/model.ts'
import { selectRules } from '../memory/select.ts'
import { bumpEligible, bumpUses, ruleStats } from '../memory/stats.ts'
import { slugify, type MemoryStore } from '../memory/store.ts'
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
  /** Paylaşılan dosyalarda (`findings/`, `pages/`) bu makinenin yazar adı. */
  author: () => Author
  headless?: boolean
}

interface ActiveRun {
  id: string
  stop: boolean
  steering: string[]
  /** Durdurulunca reddolur: süren model çağrısı beklenmez (planlayıcının tek çağrısı dakikalar sürebilir). */
  halted: Promise<never>
  halt: () => void
}

const STOPPED = 'Koşu durduruldu.'

/** Koşuları sırayla yürütür (aynı anda tek koşu). Sunucu açılırken yarım kalanlar "hata" ile kapanır. */
/**
 * Talimatın güvenlik sınırı (karakter). Kullanıcıya sınır gösterilmez: uzun bir istem yapıştırılabilir; bu yalnız
 * kazara dev bir metnin (ör. yanlış dosya) modele gitmesini önler.
 */
const BRIEF_LIMIT = 100_000

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
    // Koşunun kapsamı girdiden (ya da ekten) çıkar: sayfalar koşu başında girdiye göre seçilir. Sayfa listesini yalnız
    // devam koşusu taşır (ana koşunun sayfaları).
    if (!input.pages.length && !input.options?.brief?.trim() && !input.options?.attachments?.length)
      throw new ArgusError('NO_BRIEF', 'Ne test edileceğini girdiye yazın ya da dosya ekleyin.')
    // UTF-8 olmayan metin (ör. komut satırından yanlış kodlamayla gönderilen) çözülemeyen karakterlerle (�) gelir;
    // kaydedilirse girdi ve başlık okunmaz olur (KOS-2026-0036, 0050). Sessizce kaydetmek yerine nedeni söylenir.
    if (input.options?.brief?.includes('�'))
      throw new ArgusError(
        'GIRDI_KODLAMA',
        'Girdide çözülemeyen karakter var; metin UTF-8 olarak gönderilmemiş. Metni yeniden yapıştırıp deneyin.',
      )
    // Görev ve adım kullanıcıya bırakılmaz (kalite önceliklidir); tavanlar yalnız kaçağı durdurur.
    const options: RunOptions = {
      maxTasks: Math.min(
        Math.max(input.options?.maxTasks ?? RUN_CEILINGS.maxTasks, 1),
        RUN_CEILINGS.maxTasks,
      ),
      maxSteps: Math.min(
        Math.max(input.options?.maxSteps ?? RUN_CEILINGS.maxSteps, 3),
        RUN_CEILINGS.maxSteps,
      ),
      user: input.options?.user?.trim() || null,
      brief: input.options?.brief?.trim().slice(0, BRIEF_LIMIT) || null,
      attachments: validAttachments(this.deps.dataDir, input.options?.attachments),
      parentRunId: input.options?.parentRunId ?? null,
      reviewPlan: input.options?.reviewPlan === true,
    }
    const created = createRun(this.deps.db, { ...input, pages: [...new Set(input.pages)], options })
    // Plan onayı: koşu önce planını yazar, taslakta durur (`execute`); insan onaylayınca sürer.
    if (options.reviewPlan) setPlan(this.deps.db, created.id, 'hazirlaniyor')
    const run = getRun(this.deps.db, created.id)!
    this.deps.bus.runUpdated(run)
    void this.kick()
    return run
  }

  /** Plan adımında insanın elle düzenlediği taslak (vakalar, senaryolar, kapsam). */
  updatePlan(runId: string, plan: RunStrategy): RunInfo {
    const run = this.planRun(runId, 'taslak')
    setPlan(this.deps.db, run.id, 'taslak', sanitizePlan(plan))
    return this.notify(run.id)
  }

  /** "Argus'a düzenlet": taslak (varsa elle düzenlenmiş hâli) ve istek planlayıcıya gider, plan yeniden yazılır. */
  revisePlan(runId: string, feedback: string, plan?: RunStrategy): RunInfo {
    const run = this.planRun(runId, 'taslak')
    if (!feedback.trim()) throw new ArgusError('PLAN_ISTEK', "Argus'tan ne istediğini yaz.")
    setPlan(this.deps.db, run.id, 'duzenleniyor', plan ? sanitizePlan(plan) : null, feedback.trim().slice(0, BRIEF_LIMIT))
    const updated = this.notify(run.id)
    void this.kick()
    return updated
  }

  /** Planı onayla: koşu kayıtlı planla başlar (planlayıcı yeniden çağrılmaz). */
  approvePlan(runId: string, plan?: RunStrategy): RunInfo {
    const run = this.planRun(runId, 'taslak')
    const current = plan ? sanitizePlan(plan) : getPlan(this.deps.db, run.id).plan
    if (!current?.items.length) throw new ArgusError('PLAN_BOS', 'Planda en az bir vaka olmalı.')
    setPlan(this.deps.db, run.id, 'onaylandi', current)
    const updated = this.notify(run.id)
    void this.kick()
    return updated
  }

  private planRun(runId: string, state: PlanState): RunInfo {
    const run = getRun(this.deps.db, runId)
    if (!run) throw new ArgusError('RUN_NOT_FOUND', 'Koşu bulunamadı.')
    if (run.planState !== state)
      throw new ArgusError(
        'PLAN_DURUMU',
        run.planState === 'hazirlaniyor' || run.planState === 'duzenleniyor'
          ? 'Argus planı yazıyor; bitince düzenlenebilir.'
          : 'Bu koşunun planı onay beklemiyor.',
      )
    return run
  }

  private notify(runId: string): RunInfo {
    const run = getRun(this.deps.db, runId)!
    this.deps.bus.runUpdated(run)
    return run
  }

  stop(runId: string): void {
    if (this.active?.id === runId) {
      this.active.stop = true
      this.active.halt()
    }
    else {
      const run = getRun(this.deps.db, runId)
      if (run?.status === 'sirada') {
        finishRun(this.deps.db, runId, 'durduruldu', run.usage, null)
        this.deps.bus.runUpdated(getRun(this.deps.db, runId)!)
      }
    }
  }

  /**
   * Koşuyu kapatır: koşu bitmiş olmalı ve her bulgusuna insan karar vermiş olmalı (onay ya da ret). Kapatılmış koşuyu
   * yeniden kapatmak bir şey değiştirmez.
   */
  close(runId: string, author: string): RunInfo {
    const run = this.rootOf(runId)
    if (run.status === 'sirada' || run.status === 'calisiyor')
      throw new ArgusError('KOSU_SURUYOR', 'Koşu bitmeden kapatılamaz.')
    if (run.continuations.some((c) => c.status === 'sirada' || c.status === 'calisiyor'))
      throw new ArgusError('DEVAM_SURUYOR', 'Devam koşusu bitmeden koşu kapatılamaz.')
    if (run.review.pending)
      throw new ArgusError(
        'ONAY_EKSIK',
        `Koşuyu kapatmak için ${run.review.pending} bulguya karar verilmeli (onayla ya da reddet).`,
      )
    closeRun(this.deps.db, run.id, author)
    for (const id of [run.id, ...run.continuations.map((c) => c.id)])
      this.deps.bus.runUpdated(getRun(this.deps.db, id)!)
    return getRun(this.deps.db, runId)!
  }

  /**
   * Yönlendir ve sürdür: biten ve kapatılmamış koşu, kullanıcının notuyla aynı sayfalarda devam koşusu olarak sürer.
   * Not isteğin başına girer, asıl istek bağlam olarak kalır; devam koşusunun bulguları ana koşunun onayına düşer.
   * Devam koşusundan sürdürmek de ana koşuya bağlanır (aile tek düzeydir).
   */
  continueRun(runId: string, message: string): RunInfo {
    const root = this.rootOf(runId)
    const note = message.trim()
    if (!note) throw new ArgusError('BAD_REQUEST', 'Yönlendirme notu boş olamaz.')
    if (root.closedAt) throw new ArgusError('KOSU_KAPALI', 'Koşu kapatıldı; sürdürülemez.')
    if ([root, ...root.continuations].some((r) => r.status === 'sirada' || r.status === 'calisiyor'))
      throw new ArgusError(
        'DEVAM_SURUYOR',
        'Koşu ya da devam koşusu sürüyor; bitince yeniden sürdürülebilir.',
      )
    return this.create({
      project: root.project,
      application: root.application,
      environment: root.environment,
      pages: root.pages,
      options: {
        brief: `Yönlendirme: ${note}${root.options.brief ? `\n\nAsıl istek: ${root.options.brief}` : ''}`,
        user: root.options.user ?? null,
        parentRunId: root.id,
      },
    })
  }

  /** Koşunun ailesindeki ana koşu (devam koşusu için ana koşusu). */
  private rootOf(runId: string): RunInfo {
    const run = getRun(this.deps.db, runId)
    if (!run) throw new ArgusError('NOT_FOUND', 'Koşu bulunamadı.')
    return run.options.parentRunId ? getRun(this.deps.db, run.options.parentRunId)! : run
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
        let halt = () => undefined as void
        const halted = new Promise<never>((_, reject) => (halt = () => reject(new ArgusError('DURDURULDU', STOPPED))))
        halted.catch(() => undefined)
        this.active = { id: run.id, stop: false, steering: [], halted, halt }
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
    // Onaylanan planla süren koşu planlamanın maliyetini taşır.
    const meter = new UsageMeter(settings.provider, run.planState === 'onaylandi' ? run.usage : undefined)
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
    // Platform kapısı (okuma ve yazma); koşu sonunda bıraktığı test kayıtları silinir (hata olsa da).
    let cleanupReader: PlatformReader | null = null
    startRun(db, run.id)
    bus.runUpdated(getRun(db, run.id)!)
    bus.publish(run.id, null, { type: 'kosu-basladi', pages: run.pages })
    let status: RunInfo['status'] = 'bitti'
    let failure: string | null = null
    try {
      // Koşunun bütün model çağrıları ve platform okumaları yerel ize yazılır (data/runs/<id>/iz/).
      const trace = new RunTrace(runDir)
      // Durdurulan koşuda model çağrısı başlamaz; süren çağrı beklenmeden bırakılır (yanıtı yok sayılır).
      const traced = trace.wrap(this.deps.model())
      const model: CreateMessage = (params, role) =>
        active.stop
          ? Promise.reject(new ArgusError('DURDURULDU', STOPPED))
          : Promise.race([traced(params, role), active.halted])
      const access = platform.access()
      const environment = await platform.catalog.environment(run.project, run.environment)
      // Modelin platform kapısı: okuma işaretli araçlar ve veri/çalıştırma yazma araçları, ortam bu koşununkine sabit.
      const reader = new PlatformReader(
        await platform.mcp(),
        {
          project: run.project,
          application: run.application,
          environment: run.environment,
          projectId: await platform.catalog.projectId(run.project),
          applicationId: await platform.catalog.applicationId(run.project, run.application),
        },
        trace,
      )
      cleanupReader = reader
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
      // Test yöntemleri (`memory/brain/test/`, uygulamanın `test/`): planlayıcı dizinden seçer, seçilenler koşunun talimatına girer.
      const guides = memory.testGuides(app)
      // Rol talimatları (`memory/brain/roles/`) koşu başında bir kez okunur; eksik dosya koşuyu modelsiz durdurur.
      const roles = memory.roles()
      // Anla adımı: girdi varsa güçlü model isteği çözümler (gerekirse tanımları okur) ve stratejiyi yazar; girdisiz
      // koşuda seçilen sayfalar baştan sona taranır. Koşunun sayfaları stratejinin ekran kalemlerinden gelir.
      const system: MessageParams['system'] = [
        { type: 'text', text: roles.text('temel'), cache_control: { type: 'ephemeral' } },
      ]
      const onRead = (reason: string, read: PlatformRead, task?: number) =>
        bus.publish(run.id, DEFINITION_PAGE, {
          type: 'adim',
          ...(task === undefined ? {} : { task }),
          tool: read.write ? 'platform_yaz' : 'platform_oku',
          reason: reason || null,
          shot: null,
          target: null,
          ...readStep(read),
        })
      const brief = run.options.brief ?? null
      const briefed = Boolean(brief || attachments.length)
      const catalog = briefed
        ? await platform.catalog.pages(run.project, run.application, run.environment)
        : []
      // Plan onayı: onaylanan plan kayıtlıdır, planlayıcı yeniden çağrılmaz; düzenleme isteğinde önceki taslak ve istek
      // planlayıcıya gider.
      const saved = run.planState ? getPlan(db, run.id) : { plan: null, feedback: null }
      const approved = run.planState === 'onaylandi' ? saved.plan : null
      const strategy = approved
        ? approved
        : briefed
        ? await planRun({
            roles,
            createMessage: model,
            meter,
            model: settings.models.planner,
            system,
            reader,
            brief: run.planState === 'duzenleniyor' ? revisionBrief(brief, saved.plan, saved.feedback) : brief,
            attachments,
            catalog,
            selected: run.pages,
            guides: { index: guideIndex(guides), ids: guides.map((g) => g.id) },
            onRead,
          })
        : scanStrategy(run.pages)
      if (!strategy)
        throw new ArgusError(
          'STRATEGY',
          'Koşunun stratejisi yazılamadı (anla adımı ilerleyemedi); girdiyi açıp yeniden deneyin.',
        )
      if (run.planState === 'hazirlaniyor' || run.planState === 'duzenleniyor') {
        // Taslak hazır: koşu tarayıcı açılmadan durur, insan Plan adımında düzenler ya da onaylar.
        // Erken dönüş: bitiş yazılmaz (finally yalnız platform kapısını ve oturumu toplar). Plan sayfası canlı akıştan
        // güncellenir, bildirim burada gider (dönüşten sonraki satırlar çalışmaz).
        setPlan(db, run.id, 'taslak', strategy)
        saveUsage(db, run.id, meter.usage)
        bus.publish(run.id, null, { type: 'bilgi', message: 'Plan hazır; onayını bekliyor.' })
        bus.runUpdated(getRun(db, run.id)!)
        return
      }
      bus.publish(run.id, null, { type: 'strateji', strategy })
      bus.publish(run.id, null, {
        type: 'bilgi',
        message: `Kapsam: ${SCOPE_LABELS[strategy.scope]}; ${strategy.items.length} kalem.`,
      })
      const chosen = chooseGuides(guides, strategy.guides)
      const methods = guidesText(chosen)
      bus.publish(run.id, null, {
        type: 'bilgi',
        message:
          `Test yöntemleri: ${chosen.map((g) => g.id).join(', ') || 'yazılmamış'}.` +
          (methods.trimmed.length ? ` Bütçeyi aştığı için kısaltılan: ${methods.trimmed.join(', ')}.` : ''),
      })
      // Yöntemler koşu boyunca sabittir: talimatın sonunda, önbellekli ön ekin içinde durur.
      const workSystem: TextBlockParam[] = [
        ...(system as TextBlockParam[]),
        ...(methods.text ? [{ type: 'text' as const, text: methods.text }] : []),
      ]
      // Koşunun bilgisi: tanımdan bilinenler ve tanım kalemlerinin sonuçları (ekran kalemleri görür); gözetmen ayrıca
      // sayfa sonuçlarını görür.
      const notes = [...strategy.known]
      const results: string[] = []
      const tested = new Set<string>()
      const definitions: StrategyItem[] = []
      const writer = this.deps.author()
      // Tarayıcı ilk ekran kaleminde açılır (yalnız tanım kalemli koşu tarayıcısız biter).
      const openBrowser = async (firstPage: string): Promise<BrowserSession> => {
        if (session) return session
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
        const signIn = await session.signIn(urlOf(firstPage), appUser).catch((error: unknown) => {
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
        const synced = issues.syncFromMemory(app, writer)
        if (synced)
          bus.publish(run.id, null, { type: 'bilgi', message: `Takımın ${synced} kararı hafızadan okundu.` })
        return session
      }
      // Tanımdan çıkan bulgu (araştırmacının ya da gözetmenin): görüntüsüz, kanıtı kaynağıdır (araç, kayıt, alan).
      const recordDefinition = (finding: DefinitionFinding, page: string): string => {
        const result = issues.record({
          app,
          runId: run.id,
          page,
          phase: 'gorev',
          // Aynı kök neden tek sorundur: model bilinen sorunun anahtarını verdiyse ona eklenir (aynı bulgu farklı başlıkla
          // dört ayrı sorun olarak kayıtlanıyordu, KOŞU V11).
          key: `yz:${slugify((finding.anahtar ?? '').replace(/^yz:/, '') || finding.baslik)}`,
          title: finding.baslik,
          // Çalıştırılarak kanıtlanmayan iddia bulgu değil şüphedir (not): ayrı listede durur, sayılmaz.
          kind: finding.dogrulama === 'calistirildi' ? finding.tur : 'not',
          severity: severityOf(finding.onem),
          source: 'yz',
          scenario: finding.senaryo,
          expected: finding.beklenen,
          observed: finding.gozlenen,
          quote: null,
          shot: null,
          box: null,
          // Kanıtın türü ve kaynağı rapora (çekmecenin "Kanıt" satırı); gözlenen yalnız ne olduğunu söyler.
          report: findingReport(
            finding,
            `${finding.dogrulama === 'calistirildi' ? 'Çalıştırılarak doğrulandı' : 'Tanımdan çıkarım; çalıştırılarak doğrulanmadı'}. Kaynak: ${finding.kaynak}`,
          ),
          rules: [],
          verified: true,
          suppressedByRule: null,
        })
        if (result.duplicate) return 'Bu koşuda zaten kayıtlı (aynı anahtar); yeniden kaydedilmedi.'
        bus.publish(run.id, page, {
          type: 'bulgu',
          issueId: result.issue.id,
          occurrenceId: result.occurrence.id,
          key: result.issue.key,
          title: result.issue.title,
          kind: result.occurrence.kind,
          severity: result.occurrence.severity,
          outcome: result.outcome,
          reason: result.reason,
          shot: null,
        })
        return `Kaydedildi (${result.outcome}).`
      }
      const runDefinitions = async (items: StrategyItem[], ceiling?: number) => {
        const offset = definitions.length
        definitions.push(...items)
        bus.publish(run.id, DEFINITION_PAGE, { type: 'sayfa-basladi', url: '' })
        bus.publish(run.id, DEFINITION_PAGE, {
          type: 'plan',
          summary: 'Tanım kalemleri: platform tanımlarından cevaplanır.',
          tasks: definitions.map((i) => ({ title: i.title, goal: i.goal })),
        })
        const runOne = async (item: StrategyItem, i: number) => {
          if (active.stop) return
          bus.publish(run.id, DEFINITION_PAGE, {
            type: 'gorev-basladi',
            index: offset + i,
            title: item.title,
          })
          const summary = await investigate({
            roles,
            createMessage: model,
            meter,
            model: settings.models.investigator,
            system: workSystem,
            reader,
            item,
            brief: brief,
            notes,
            known: () => {
              const seen = new Map<string, string>()
              for (const i of issues.list({ app, runId: run.id })) seen.set(i.key, i.title)
              for (const i of issues.knownInModule(
                app,
                moduleOf(item.page ?? strategy.items.find((s) => s.page)?.page ?? ''),
              ))
                seen.set(i.key, i.title)
              return [...seen].map(([key, title]) => `${key} — ${title}`)
            },
            ...(ceiling ? { ceiling } : {}),
            onRead: (reason, read) => onRead(reason, read, offset + i),
            record: (finding) => recordDefinition(finding, item.page ?? DEFINITION_PAGE),
          })
          notes.push(`${item.title}: ${summary}`)
          results.push(`Tanım — ${item.title}: ${summary}`)
          bus.publish(run.id, DEFINITION_PAGE, { type: 'gorev-bitti', index: offset + i, summary })
        }
        // Bağımsız vakalar DEFINITION_PARALLEL'lik havuzda aynı anda, ötekiler (öncekinin kaydına dayananlar) sonra
        // sırayla: sıralı vakalar akış testini 25 dk sınırına dayatıyordu.
        const indexed = items.map((item, i) => ({ item, i }))
        const queue = indexed.filter((x) => x.item.independent)
        await Promise.all(
          Array.from({ length: Math.min(DEFINITION_PARALLEL, queue.length) }, async () => {
            for (let next = queue.shift(); next; next = queue.shift()) await runOne(next.item, next.i)
          }),
        )
        for (const { item, i } of indexed.filter((x) => !x.item.independent)) await runOne(item, i)
        bus.publish(run.id, DEFINITION_PAGE, { type: 'sayfa-bitti', summary: 'Tanım kalemleri bitti.' })
      }
      const runPage = async (
        browser: BrowserSession,
        page: string,
        work: { scan: boolean; tasks: Array<{ baslik: string; amac: string }> },
      ) => {
        const url = urlOf(page)
        bus.publish(run.id, page, { type: 'sayfa-basladi', url })
        const eye = settings.inspector && inspectsScreens(strategy)
        if (settings.inspector && !eye)
          bus.publish(run.id, page, {
            type: 'bilgi',
            message:
              'Göz bu sayfada kapalı: arayüz yöntemi seçilmedi; ekran yalnız akışı ve sonucu teyit için açıldı.',
          })
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
        // Bu koşunun sayfa izi: sayfa bilgisiyle birlikte saklanır (takım genelinde "ne değişti?" dayanağı).
        let current: PagePrint | null = null
        const controller = new PageController({
          roles,
          session: browser,
          url,
          page,
          facts: {
            openIssues: issues.openOnPage(app, page),
            known: issues.knownInModule(app, moduleOf(page)),
            rejected: issues.rejected(app),
            knowledge: knowledge?.body ?? null,
            notes,
          },
          recordedInRun: issues.recordedInRun(run.id, page),
          verifyKnown: inspectsScreens(strategy),
          patterns: selection.patterns,
          system: [
            { type: 'text', text: roles.text('temel'), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: appBlock({ app, rules: selection, notes: memory.appNotes(app) }) },
            ...(methods.text ? [{ type: 'text' as const, text: methods.text }] : []),
          ],
          createMessage: model,
          meter,
          settings: { ...settings, inspector: eye },
          platform: reader,
          maxTasks: run.options.maxTasks,
          maxSteps: run.options.maxSteps,
          work,
          brief: brief,
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
              const result = issues.record({
                ...draft,
                app,
                runId: run.id,
                page,
                studioPrint: current?.studio ?? null,
              })
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
            saveKnowledge: (distilled) => {
              if (!current) return
              const at = new Date().toISOString()
              const content = renderKnowledge(distilled, {
                page,
                author: writer.name,
                run: run.code,
                at,
                print: current,
              })
              memory.writePageKnowledge(app, page, writer, content)
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
        const summary = await controller.run().catch((error: unknown) => {
          if (active.stop) return STOPPED
          const message = `${page}: ${describeModelError(error)}`
          bus.publish(run.id, page, { type: 'hata', message })
          return message
        })
        results.push(`Ekran — ${page}: ${summary}`)
        return controller.redirectedTo
      }
      const runItems = async (items: StrategyItem[]) => {
        const own = items.filter((i) => i.source === 'tanim')
        if (own.length) await runDefinitions(own)
        for (const page of new Set(items.flatMap((i) => (i.page ? [i.page] : [])))) {
          if (active.stop) break
          tested.add(page)
          if ([...tested].join() !== getRun(db, run.id)!.pages.join()) {
            setRunPages(db, run.id, [...tested])
            bus.runUpdated(getRun(db, run.id)!)
          }
          const work = pageWork(items, page)
          const redirected = await runPage(await openBrowser(page), page, work)
          // Kayıt sayfası doğrudan açılamaz (kimliksiz açılınca listeye yönlendirir): kalemleri yönlendirdiği sayfada,
          // ilgili kaydı açarak sürdür (KOS-2026-0038: dönem detayı kalemi atlanmıştı).
          if (redirected && work.tasks.length && !active.stop) {
            bus.publish(run.id, page, {
              type: 'bilgi',
              message: `${page} bir kayıt sayfası; kalemleri ${redirected} sayfasında ilgili kaydı açarak sürdürülüyor.`,
            })
            await runPage(await openBrowser(redirected), redirected, {
              scan: false,
              tasks: work.tasks.map((t) => ({
                baslik: t.baslik,
                amac: `${t.amac} (Hedef "${page}" bir kayıt sayfası, doğrudan açılamıyor: bu sayfadan ilgili kaydı açarak ilerle.)`,
              })),
            })
          }
        }
      }
      await runItems(strategy.items)
      // Gözetmen (girdili koşu): test planını yapılanla karşılaştırır, kaçmış bulguları kaydeder, kapsam raporunu yazar;
      // kapsam boşluğu kaldıysa ek kalem ister (en çok SUPERVISE_ROUNDS tur).
      if (briefed && !active.stop) {
        let coverage: RunCoverage | null = null
        for (let round = 1; round <= SUPERVISE_ROUNDS && !active.stop; round += 1) {
          const verdict = await supervise({
            roles,
            createMessage: model,
            meter,
            model: settings.models.planner,
            system,
            brief: brief,
            strategy,
            results,
            findings: issues
              .list({ app, runId: run.id })
              .map((i) => `${i.key} — ${i.title} (${i.kind}; ${i.pages.join(', ')})`),
            pages: [...tested],
            lastRound: round === SUPERVISE_ROUNDS,
          })
          coverage = verdict.coverage
          for (const finding of verdict.missed) recordDefinition(finding, DEFINITION_PAGE)
          const extra = normalizeItems(verdict.extra, catalog)
          if (!extra.length) break
          bus.publish(run.id, null, {
            type: 'bilgi',
            message: `Gözetmen kapsamı tamamlamak için ${extra.length} ek kalem istedi: ${extra.map((i) => i.title).join(', ')}.`,
          })
          await runItems(extra)
        }
        if (coverage) {
          setRunCoverage(db, run.id, coverage)
          bus.publish(run.id, null, { type: 'kapsam', coverage })
          bus.runUpdated(getRun(db, run.id)!)
        }
      }
      // Koşu sonu temizliği: ekran kalemleri tanım kalemlerinin bıraktığı test kayıtlarını kullanır; kayıtlar ekrandan
      // sonra burada silinir (planlayıcının erken temizlik kalemi ekran verisini siliyordu, KOS-2026-0044).
      if (reader.wrote && strategy.items.some((i) => i.page) && !active.stop)
        await runDefinitions(
          [
            {
              title: 'Koşu sonu temizlik',
              goal:
                'Bulgu arama; yalnız temizle. "Bu koşuda bilinenler"de bırakıldığı yazılan "Argus test" kayıtlarını ' +
                'uygulamanın silme uçlarıyla ya da row_delete ile sil, geri okuyarak doğrula. Özette silinenleri ve ' +
                'silinemeyenleri (nedeniyle) yaz.',
              source: 'tanim',
              page: null,
              fullScan: false,
              independent: false,
            },
          ],
          CLEANUP_CEILING,
        )
      if (active.stop) status = 'durduruldu'
    } catch (error) {
      if (active.stop) {
        status = 'durduruldu'
        bus.publish(run.id, null, { type: 'bilgi', message: STOPPED })
      } else {
        status = 'hata'
        failure = describeModelError(error)
        bus.publish(run.id, null, { type: 'hata', message: failure })
      }
    } finally {
      const cleaner = cleanupReader as PlatformReader | null
      const removed = cleaner ? await cleaner.cleanup() : 0
      if (removed)
        bus.publish(run.id, null, {
          type: 'bilgi',
          message: `Koşunun oluşturup silmediği ${removed} test kaydı silindi.`,
        })
      // Oturum ve süper giriş tarayıcı açılırken (ilk ekran kaleminde, kapanış içinde) atanır; TS bunu izleyemez.
      const opened = session as BrowserSession | null
      const login = superLogin as SuperLoginSpec | null
      if (opened && login) {
        const ended = await endSuperLogin(opened, app, login, run.environment)
        bus.publish(run.id, null, {
          type: ended ? 'bilgi' : 'hata',
          message: ended
            ? 'Süper giriş kapatıldı.'
            : 'Süper giriş kapatılamadı; uygulamada kullanıcı menüsünden sonlandırın.',
        })
      }
      await opened?.close()
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
      const proposals = await this.deps.learner.learnFromDecisions(app, this.deps.author().name)
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
