import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type {
  Box,
  FindingKind,
  Issue,
  ModelRole,
  PlatformRead,
  RunEventBody,
  Settings,
  StepTarget,
} from '@argus/shared'
import type { Locator } from 'playwright'
import {
  annotateShot,
  boxOfQuote,
  captureEvidence,
  captureState,
  type StateShot,
} from '../browser/evidence.ts'
import { describeHit, runEyes, type EyeHit, type PatternRule } from '../browser/eyes.ts'
import { isUnsafeTarget } from '../browser/guard.ts'
import { landedOn } from '../platform/catalog.ts'
import { ariaTree, harvestTooltips, scrollFraction, visibleText } from '../browser/research.ts'
import type { BrowserDialog, BrowserSession, Problem } from '../browser/session.ts'
import type { Attachment } from '../runs/attachments.ts'
import {
  changeSize,
  compressSnapshot,
  diffSnapshot,
  labelsOf,
  stableTree,
  windowSnapshot,
} from '../browser/snapshot.ts'
import type { RecordResult } from '../issues/issues.ts'
import { apiPrint, uiPrint, type PagePrint, type PrintChange } from '../runs/prints.ts'
import { clampKnowledge, KNOWLEDGE_SCHEMA, KNOWLEDGE_TASK, type PageKnowledge } from './knowledge.ts'
import {
  describeModelError,
  ESCALATION_LADDER,
  jsonOf,
  textOf,
  type ContentBlock,
  type CreateMessage,
  type MessageParam,
  type MessageParams,
  type TextBlockParam,
  type Tool,
  type UsageMeter,
} from './model.ts'
import {
  eyeFindingsText,
  INSPECT_TASK,
  JUDGE_TASK,
  pageFacts,
  TERMS_TASK,
  type PageFacts,
} from './prompts.ts'
import { INSPECT_SCHEMA, JUDGE_SCHEMA, PLAN_SCHEMA, platformTools, TASK_TOOLS } from './tools.ts'
import { readStep, type PlatformReader } from '../platform/reader.ts'

export interface FindingDraft {
  key: string
  title: string
  kind: FindingKind
  source: 'goz' | 'yz'
  phase: 'acilis' | 'gorev'
  scenario: string
  expected: string
  observed: string
  quote: string | null
  shot: string | null
  box: Box | null
  rules: string[]
  verified: boolean
  suppressedByRule: string | null
}

/** Sayfa denetleyicisinin dış dünyası: koşu yöneticisi verir (kayıt, olay, dosya yolu, yönlendirme, durdurma). */
export interface PageHooks {
  emit(body: RunEventBody): void
  /** Canlı imleç: etkileşimden hemen önce hedef (saklanmaz). */
  pointer(tool: string, target: StepTarget, at: number): void
  record(draft: FindingDraft): RecordResult
  retract(key: string): boolean
  markFixed(key: string, note: string): boolean
  closeVanishedEyeIssues(foundKeys: Set<string>): string[]
  /** Açık sorunun bu sayfadaki son görünümü (alıntılı); modelsiz doğrulama için. */
  lastSighting(issue: Issue): { quote: string; scenario: string; expected: string; observed: string } | null
  /** Sayfanın arayüz, veri ve Studio izi; önceki koşuya göre neyin değiştiği döner. */
  print(ui: string, api: string): Promise<Record<keyof PagePrint, PrintChange>>
  /** Koşu sonunda damıtılan sayfa bilgisini hafızaya yazar. */
  saveKnowledge(knowledge: PageKnowledge): void
  /** Koşu klasöründe yeni bir dosya yolu: `abs` yazmak, `rel` saklamak için. */
  file(kind: 'adim' | 'kanit'): { abs: string; rel: string }
  drainSteering(): string[]
  stopped(): boolean
  usageChanged(): void
}

export interface PageInput {
  session: BrowserSession
  url: string
  page: string
  facts: Omit<PageFacts, 'tooltips' | 'problems' | 'page' | 'url'>
  /**
   * Bu koşuda bu sayfada zaten kaydı olan sorunlar (anahtar → başlık): sayfa yeniden açılınca modelsiz doğrulamada
   * yeniden kaydedilmez, göz onları "zaten bildirilenler" arasında görür.
   */
  recordedInRun: Map<string, string>
  patterns: PatternRule[]
  system: MessageParams['system']
  createMessage: CreateMessage
  meter: UsageMeter
  settings: Pick<Settings, 'models' | 'effort' | 'escalate' | 'inspector'>
  /** Stratejinin bu sayfadaki işi: kalemler (birer görev) ve tam tarama istenip istenmediği. */
  work: { scan: boolean; tasks: Array<{ baslik: string; amac: string }> }
  /** Güvenlik tavanları (`RUN_CEILINGS`); kullanıcı seçmez, testler küçültür. */
  maxTasks: number
  maxSteps: number
  /** Platform okuma kapısı (tanımlar); gezgin ekranla birlikte kullanır. */
  platform: PlatformReader
  /** Kullanıcının talimatı (yoksa null): planlayıcı önce bunu karşılar, gezgin görevde akılda tutar. */
  brief: string | null
  /** Talimatın ekleri (görsel, PDF, Excel, Word, metin): yalnız planlayıcı görür. */
  attachments: Attachment[]
  ruleStats: { used: number; dropped: number; tokens: number }
  hooks: PageHooks
}

/**
 * Kalite önceliklidir: görev ve adım sayısı kullanıcıya bırakılmaz, sayfa ve görev gerektirdiği kadar sürer. Tavanlar
 * kapsamı daraltmak için değil, kaçağı (sonsuz döngü, takılma) durdurmak içindir; gece bırakılan koşu da sabaha
 * maliyet patlatmasın. Kaçak, tavandan önce şu korumalarla durur: aynı işlemi aynen tekrarlamak ilerleme sayılmaz;
 * iki tur ilerleyemeyen gezgin bir üst modele geçer; en üst modelde de `NO_PROGRESS_LIMIT` tur ilerleyemezse görev
 * bulgular bildirilerek kapanır.
 */
const NO_PROGRESS_LIMIT = 4
const REPEAT_LIMIT = 2

const text = (value: string): ContentBlock => ({ type: 'text', text: value })
/** Gezginin ağacı en çok bu kadar karakter: uzun sayfada kaydırma konumunun bölümü gider (`windowSnapshot`). */
const EXPLORER_TREE = 9_000
/** Göz bir ekran için en çok bu kadar not yazar (yalnız önceki notlarda olmayan gözlemler). */
const MAX_NOTES = 8
/** Pencere boyu değişince kapanabilen açık katmanlar: menü, açılır liste, ipucu, açık durumdaki öğe. */
const OVERLAY = /- (?:menu|listbox|tooltip)\b|\[expanded\]/
const screenText = (s: { label: string; notes: string[] }, i: number) =>
  `Ekran ${i + 1} (${s.label}):\n${s.notes.length ? s.notes.map((n) => `  - ${n}`).join('\n') : '  (not yok)'}`

type StepFrame = { shot: string | null; target: StepTarget | null; actAt: number }

const DIALOG_KIND: Record<string, string> = {
  beforeunload: 'kaydedilmemiş değişiklik (çıkış) onayı',
  confirm: 'onay penceresi',
  prompt: 'giriş penceresi',
  alert: 'uyarı penceresi',
}

/** Adımda açılan tarayıcı pencereleri, modele ve akışa tek cümle. Pencere açılması düğmenin çalıştığını gösterir. */
function dialogNote(dialogs: BrowserDialog[]): string {
  if (!dialogs.length) return ''
  const shown = dialogs
    .map(
      (d) =>
        `${DIALOG_KIND[d.type] ?? d.type}${d.message ? ` ("${d.message}")` : ''} → ${d.accepted ? 'kabul edildi' : 'iptal edildi, sayfada kalındı'}`,
    )
    .join(', ')
  return `Tarayıcı penceresi açıldı: ${shown}. Düğme tepki verdi; tepkisizlik bulgusu değildir. Sayfadan çıkış onayı kabul edilir (kaydedilmemiş girdi yok sayılır), iş onaylatan pencere iptal edilir.`
}
const firstLine = (value: string) => value.split('\n')[0] ?? value
const field = (input: unknown, name: string): string => {
  const v = (input as Record<string, unknown> | null)?.[name]
  return typeof v === 'string' ? v : ''
}
const normalizeSpace = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr')

function problemKey(problem: Problem): { key: string; title: string } {
  const clean = problem.key
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|:|$)/g, '/:id')
    .slice(0, 120)
  if (problem.kind === 'istek')
    return { key: `goz:istek:${clean}`, title: `İstek başarısız: ${problem.text}` }
  return {
    key: `goz:konsol:${clean.toLowerCase().replace(/\d+/g, 'n').slice(0, 80)}`,
    title: `Konsolda hata: ${firstLine(problem.text).slice(0, 120)}`,
  }
}

/**
 * Bir sayfanın denetimi: araştırma (token yok) → plan (1 çağrı) → kısa görev konuşmaları → doğrulama.
 * Bağlam görev başına sıfırlanır; önceki görevlerden yalnız kısa özetler (not defteri) taşınır.
 */
export class PageController {
  private readonly seenKeys = new Set<string>()
  private readonly eyeFindings: Array<{ key: string; title: string }> = []
  private lastTree: string | null = null
  /**
   * Sayfanın önbellekli talimatları: sabit talimat + sayfanın sabit bağlamı (`pageFacts`), gezgin/planlayıcı ve
   * göz/yargıç/öğretmen için ayrı. Sayfa açılınca kurulur; o sayfadaki her çağrı aynı ön eki önbellekten okur.
   */
  private context: Record<'gezgin' | 'yargic', TextBlockParam[]> | null = null
  /** Yargıcın bu sayfadaki kararları (gezginin anahtarıyla): aynı aday yeniden bildirilirse yeniden sorulmaz. */
  private readonly verdicts = new Map<string, Verdict>()
  /** Bu ekrana nasıl gelindi: son adımların sonuçları (gözün senaryosu için). */
  private trail: string[] = []
  /** Bu sayfada kaydedilen yapay zekâ bulguları (anahtar — başlık): göz aynısını yeniden bildirmesin. */
  private readonly pageTitles: string[] = []
  /** Gözün incelediği ekranlar (kimlik ağacı), ekran notları ve süren incelemeler. */
  private readonly inspectedTrees: string[] = []
  private readonly screens: Array<{ label: string; notes: string[] }> = []
  /** İncelenen ekranların etiketleri ve görüntüsü: sayfa sonunda terim gözü bunlarda karşılaştırır ve kanıtlar. */
  private readonly views: Array<{
    label: string
    shot: StateShot
    labels: Array<{ role: string; text: string }>
  }> = []
  private readonly pending: Array<Promise<void>> = []
  private inspectQueue: Promise<void> = Promise.resolve()
  /** Kanıt çizimi için ağ kullanmayan ayrı sekme; çizimler sırayla yapılır. */
  private overlay: Promise<import('playwright').Page> | null = null
  private overlayQueue: Promise<unknown> = Promise.resolve()
  /** Önceki koşuya göre sayfanın değişiklik izi (açılışta ölçülür). */
  private change: Record<keyof PagePrint, PrintChange> | null = null
  /** Gözün taban ağacı: sayfada ilk incelenen ekranın tam ağacı (önbellekte); sonraki ekranlar ona göre fark olarak gider. */
  private eyeBase: string | null = null

  /**
   * Göz: gezginin ulaştığı ekran öncekilerden belirgin biçimde farklıysa (odak dışında en az 3 satır: küçük bir
   * pencere sayılır, ipucu gibi 1-2 satırlık değişim sayılmaz) ekranın o anki hâli yakalanır ve Göz modeli onu paralel
   * inceler; gezgin beklemez. Ekran sayısına sınır yoktur (bulgu kaçmasın); aynı ekranı bir koşuda iki kez incelememek
   * döngüye karşı yeterlidir. Önceki koşuda incelenmiş ekran yeniden incelenir: ölçümde aynı içerikli ekrana ikinci bakış 10 ekranda 5 yeni bulgu çıkardı
   * (koşular arası ekran atlamak kaliteyi düşürüyordu); maliyeti önbellek ve kapsanmayana yönelen plan düşürür.
   */
  private async maybeInspect(full: string, blocked: string[]): Promise<void> {
    if (!this.input.settings.inspector) return
    const tree = stableTree(full)
    if (this.inspectedTrees.some((seen) => changeSize(seen, tree) < 3)) return
    this.inspectedTrees.push(tree)
    // Sırayla: CDP'nin ölçekli görüntüsü sayfaya geçici ölçek uygular; aynı anda alınan PNG bozulur (ölçüldü). Modelin
    // görüntüsü önce alınır; açık katman (menü, liste, ipucu) varken kanıt için pencere büyütülmez: büyütme onları
    // kapatıyordu (göz "ağaçta açık, görüntüde yok" diyordu, gezginin açtığı liste kapanıyordu).
    const jpeg = await this.input.session.modelScreenshot().catch(() => null)
    const shot = await captureState(this.page, { tall: !OVERLAY.test(tree) }).catch(() => null)
    if (!shot) return
    const trail = [...this.trail]
    // İncelemeler sırayla koşar (gezgini beklemeden): her biri öncekinin bulgusunu görür, aynı sorun iki kez gelmez.
    const job = this.inspectQueue.then(() =>
      this.inspect(full, shot, jpeg, trail, blocked).catch((error: unknown) => {
        this.input.hooks.emit({
          type: 'hata',
          message: `Göz bir ekranı inceleyemedi: ${describeModelError(error)}`,
        })
      }),
    )
    this.inspectQueue = job
    this.pending.push(job)
  }

  private async inspect(
    tree: string,
    shot: StateShot,
    jpeg: Buffer | null,
    trail: string[],
    blocked: string[],
  ): Promise<void> {
    const reported = this.reportedText()
    const label = trail.length ? trail[trail.length - 1]! : 'Sayfa açıldı'
    this.views.push({ label, shot, labels: labelsOf(tree) })
    // Önbellekli ön ek yalnız artar: sayfanın taban ağacı (ilk incelenen ekranın tam ağacı, bir kez yazılır) ve ekran
    // başına not blokları; sonuncusu işaretli. Sıradaki göz çağrısı bu ön eki önbellekten okur; ekranın kendisi tabana
    // göre fark olarak gider. Göz böylece uzun sayfanın tamamını görür (ağaç 9 bin karakterde kesilirken karnenin alt
    // bölümleri hiçbir incelemeye girmiyordu) ve tam ağacı her çağrıda yeniden yazmaz (notlar tek metindeyken maliyet
    // ekran sayısıyla karesel büyüyordu).
    const screenTree = stableTree(tree)
    this.eyeBase ??= screenTree
    const change = diffSnapshot(this.eyeBase, screenTree)
    const prefix = [
      `Sayfanın taban ağacı (bu sayfada ilk incelenen ekran; sonraki ekranlar buna göre fark olarak gelir):\n${this.eyeBase}`,
      ...this.screens.map(
        (s, i) =>
          `${i === 0 ? 'Önceki ekranların notları (bu ekranı onlarla da karşılaştır):\n' : ''}${screenText(s, i)}`,
      ),
    ].map((value, i, all) => ({
      type: 'text' as const,
      text: value,
      ...(i === all.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }))
    const message = await this.call(
      'inspector',
      {
        messages: [
          {
            role: 'user',
            content: [
              text(INSPECT_TASK),
              ...prefix,
              text(
                `${eyeFindingsText(this.eyeFindings)}\n\nBu ekrana nasıl gelindi:\n${trail.length ? trail.map((t) => `- ${t}`).join('\n') : '- Sayfa açıldı.'}` +
                  `\n\nBu sayfada zaten bildirilenler:\n${reported}` +
                  (blocked.length ? `\n\nEngellenen yazma istekleri: ${blocked.join(', ')}` : '') +
                  `\n\nAdres: ${shot.url}\nSekme başlığı: ${shot.title}\n\nBu ekranın ağacı: ${change.mode === 'ayni' ? 'taban ağacın aynısı.' : `\n${change.text}`}`,
              ),
              ...(jpeg
                ? [
                    {
                      type: 'image' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: 'image/jpeg' as const,
                        data: jpeg.toString('base64'),
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: INSPECT_SCHEMA as unknown as Record<string, unknown> },
        },
      },
      { cache: false, audience: 'yargic' },
    )
    const answer = jsonOf<{ bulgular?: Array<Record<string, string>>; notlar?: unknown[] }>(message)
    // Notlar yalnız yeni gözlemdir, en çok 8: gözün çıktısının %79'u notlardı ve çoğu önceki notların tekrarıydı.
    const notes = (answer?.notlar ?? []).filter((n): n is string => typeof n === 'string').slice(0, MAX_NOTES)
    this.screens.push({ label, notes })
    for (const item of answer?.bulgular ?? [])
      await this.recordShotFinding(item, shot, trail.length ? 'gorev' : 'acilis')
  }

  /**
   * Terim gözü: sayfa boyunca incelenen ekranların etiketleri (adı, rolü, hangi ekranlarda geçtiği) tek çağrıda
   * karşılaştırılır; aynı kavramın farklı adla geçtiği yer bulunur. Bulgu, alıntının geçtiği ekranın görüntüsüyle
   * kanıtlanır. Sayfa başına bir çağrı; etiketler kısa olduğu için maliyeti küçüktür.
   */
  private async compareTerms(): Promise<void> {
    if (!this.views.length) return
    const where = new Map<string, { role: string; screens: number[] }>()
    this.views.forEach((view, i) => {
      for (const { role, text: name } of view.labels) {
        const entry = where.get(name) ?? { role, screens: [] }
        entry.screens.push(i + 1)
        where.set(name, entry)
      }
    })
    const screens = this.views.map((v, i) => `Ekran ${i + 1}: ${v.label}`).join('\n')
    const labels = [...where]
      .map(([name, e]) => `${e.role} "${name}" (ekran ${e.screens.join(',')})`)
      .join('\n')
    const reported = this.reportedText()
    const message = await this.call(
      'inspector',
      {
        messages: [
          {
            role: 'user',
            content: [
              text(
                `${TERMS_TASK}\n\nBu sayfada zaten bildirilenler:\n${reported}\n\nEkranlar:\n${screens}\n\nEtiketler:\n${labels}`,
              ),
            ],
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: INSPECT_SCHEMA as unknown as Record<string, unknown> },
        },
      },
      { cache: false, audience: 'yargic' },
    )
    const answer = jsonOf<{ bulgular?: Array<Record<string, string>> }>(message)
    for (const item of answer?.bulgular ?? []) {
      const quote = normalizeSpace(item.alinti ?? '')
      const view =
        this.views.find((v) => quote && normalizeSpace(v.shot.text).includes(quote)) ?? this.views[0]!
      await this.recordShotFinding(item, view.shot, 'gorev')
    }
  }

  /** Bu sayfada zaten bildirilenler: bu açılışta kaydedilenler ve koşunun önceki turlarında bu sayfada kaydedilenler. */
  private reportedText(): string {
    const lines = new Set(this.pageTitles)
    for (const [key, title] of this.input.recordedInRun) lines.add(`${key} — ${title}`)
    return lines.size ? [...lines].map((t) => `- ${t}`).join('\n') : '(yok)'
  }

  private screensText(): string {
    return this.screens.map(screenText).join('\n')
  }

  /**
   * Gözün bulgusu: alıntı yakalanan ekranın metninde aranır, görüntüsüne kutu çizilir; yoksa "doğrulanamadı" olur.
   */
  private async recordShotFinding(
    item: Record<string, string>,
    shot: StateShot,
    phase: 'acilis' | 'gorev',
  ): Promise<void> {
    const { hooks } = this.input
    const key = this.normalizeKey(item.anahtar ?? '')
    const title = (item.baslik ?? '').trim() || key
    const quote = (item.alinti ?? '').trim()
    const verified = !quote || normalizeSpace(shot.text).includes(normalizeSpace(quote))
    const box = quote && verified ? boxOfQuote(shot, quote) : null
    const file = hooks.file('kanit')
    await this.annotate(shot, box, title, file.abs)
    const kind = (FINDING_KIND_SET.has(item.tur ?? '') ? item.tur : 'not') as FindingKind
    const result = hooks.record({
      key,
      title,
      kind,
      source: 'yz',
      phase,
      scenario: item.senaryo ?? '',
      expected: item.beklenen ?? '',
      observed: item.gozlenen ?? '',
      quote: quote || null,
      shot: file.rel,
      box,
      rules: [],
      verified,
      suppressedByRule: null,
    })
    this.pageTitles.push(`${key} — ${title}`)
    this.emitFinding(result, file.rel)
  }

  /** Kanıt, yakalanmış görüntünün üstüne ayrı bir sekmede çizilir; çizimler sırayla yapılır. */
  private annotate(shot: StateShot, box: import('@argus/shared').Box | null, label: string, file: string) {
    const job = this.overlayQueue.then(async () => {
      this.overlay ??= this.page.context().newPage()
      await annotateShot(await this.overlay, shot, box, label, file)
    })
    this.overlayQueue = job.catch(() => undefined)
    return job.catch(() => undefined)
  }

  /** Gezginin araçları: tarayıcı + platform okuması (tek araç kutusu; hangisinin gerektiğine gezgin karar verir). */
  private readonly tools: Tool[]
  /** Sayfa doğrudan açılamayıp yönlendirdiyse (kayıt sayfası) yönlendirdiği sayfa; koşu kalemleri orada sürer. */
  redirectedTo: string | null = null

  constructor(private readonly input: PageInput) {
    this.tools = [...TASK_TOOLS, ...platformTools(input.platform)]
  }

  /**
   * Açık sorunların modelsiz doğrulaması: bu açılışta gözlerin yeniden bulduğu ya da düzeldi denen sorun
   * atlanır; son görünümünün alıntısı açılışta ekranda olan sorun kanıtıyla yeniden kaydedilir. Geriye yalnız
   * etkileşimle bakılması gerekenler kalır (onlar gezgine gider).
   */
  private async verifyOpenIssues(closed: Set<string>): Promise<Issue[]> {
    const { hooks } = this.input
    const remaining: Issue[] = []
    const screenText = normalizeSpace(await visibleText(this.page))
    for (const issue of this.input.facts.openIssues) {
      if (this.seenKeys.has(issue.key) || closed.has(issue.key) || this.input.recordedInRun.has(issue.key))
        continue
      const seen = hooks.lastSighting(issue)
      if (!seen || !screenText.includes(normalizeSpace(seen.quote))) {
        remaining.push(issue)
        continue
      }
      const file = hooks.file('kanit')
      const { box } = await captureEvidence(this.page, file.abs, {
        locator: this.page.getByText(seen.quote).first(),
        label: issue.title,
      }).catch(() => ({ box: null }))
      const result = hooks.record({
        key: issue.key,
        title: issue.title,
        kind: issue.kind,
        source: issue.source,
        phase: 'acilis',
        scenario: seen.scenario,
        expected: seen.expected,
        observed: seen.observed,
        quote: seen.quote,
        shot: file.rel,
        box,
        rules: [],
        verified: true,
        suppressedByRule: null,
      })
      this.seenKeys.add(issue.key)
      this.pageTitles.push(`${issue.key} — ${issue.title}`)
      this.emitFinding(result, file.rel)
      hooks.emit({
        type: 'sorun-durumu',
        key: issue.key,
        state: 'var',
        note: `Alıntı ("${seen.quote}") açılışta ekranda; model çağrılmadan doğrulandı.`,
      })
    }
    return remaining
  }

  private get page() {
    return this.input.session.page
  }

  /**
   * Monitör karesi: görünüm alanının görüntüsü diske yazılır, hedef öğe verildiyse kutusu görünüm alanına oranla
   * ölçülür (imleç ve çerçeve buraya çizilir) ve canlı izleyene işlemden önce imleç olarak gider. `actAt` işlemin
   * anıdır (verilmezse şimdi): kayıttan izlemede imleç ve anlatı bu ana hizalanır. Modele hiçbir şey gitmez.
   */
  private async frame(tool: string, ref?: string, at?: number): Promise<StepFrame> {
    try {
      const box = ref
        ? await this.locate(ref)
            .boundingBox({ timeout: 1_000 })
            .catch(() => null)
        : null
      const { image, viewport } = await this.input.session.stepFrame()
      const file = this.input.hooks.file('adim')
      mkdirSync(dirname(file.abs), { recursive: true })
      writeFileSync(file.abs, image)
      const target = box
        ? {
            x: box.x / viewport.width,
            y: box.y / viewport.height,
            width: box.width / viewport.width,
            height: box.height / viewport.height,
          }
        : null
      const actAt = at ?? Date.now()
      if (target) this.input.hooks.pointer(tool, target, actAt)
      return { shot: file.rel, target, actAt }
    } catch {
      return { shot: null, target: null, actAt: at ?? Date.now() }
    }
  }

  /**
   * Adım akışa yazılır; karesi (varsa) monitör içindir, modele gitmez. Adım sırasında tarayıcı penceresi açıldıysa
   * sonuca eklenir ve aynı not döner: çağıran onu modele de söyler (yoksa düğme "tepkisiz" sanılır).
   */
  private async step(
    tool: string,
    reason: string | null,
    outcome: string,
    frame: StepFrame = { shot: null, target: null, actAt: Date.now() },
    platform?: PlatformRead,
  ): Promise<string> {
    const dialogs = this.input.session.drainDialogs()
    const note = dialogNote(dialogs)
    outcome = note ? `${outcome} — ${note}` : outcome
    this.input.hooks.emit({
      type: 'adim',
      tool,
      reason,
      outcome,
      ...frame,
      ...(dialogs.length
        ? {
            dialog: dialogs
              .map(
                (d) =>
                  `${d.message || (DIALOG_KIND[d.type] ?? d.type)} → ${d.accepted ? 'kabul edildi' : 'iptal edildi'}`,
              )
              .join(' · '),
          }
        : {}),
      ...(platform ? { platform } : {}),
    })
    if (tool === 'bastan_ac') this.trail = []
    else if (tool !== 'ekrana_bak') this.trail = [...this.trail, outcome].slice(-10)
    const requests = this.input.session.drainNetwork()
    if (requests.length) this.input.hooks.emit({ type: 'ag', requests: requests.slice(0, 40) })
    return note ? ` ${note}` : ''
  }

  /** Göz isabetlerini ve konsol/ağ sorunlarını kaydeder; yalnız bu sayfada yeni olanları döner. */
  private async recordDeterministic(
    hits: EyeHit[],
    problems: Problem[],
    phase: 'acilis' | 'gorev',
  ): Promise<string[]> {
    const fresh: string[] = []
    for (const hit of hits) {
      if (this.seenKeys.has(hit.key)) continue
      this.seenKeys.add(hit.key)
      const described = describeHit(hit, this.input.patterns)
      const file = this.input.hooks.file('kanit')
      const { box } = await captureEvidence(this.page, file.abs, {
        locator: this.page.locator(`[data-argus-hit="${hit.marker}"]`).first(),
        label: described.titleText,
      }).catch(() => ({ box: null }))
      const result = this.input.hooks.record({
        key: hit.key,
        title: described.titleText,
        kind: described.kind,
        source: 'goz',
        phase,
        scenario: `${this.input.page} sayfasını aç${phase === 'gorev' ? ' ve akıştaki adımları izle' : ''}.`,
        expected: described.expected,
        observed: `Ekranda: "${hit.value}" (${hit.context})`,
        quote: hit.value,
        shot: file.rel,
        box,
        rules: hit.check.startsWith('desen:') ? [hit.check.slice(6)] : [],
        verified: true,
        suppressedByRule: null,
      })
      this.emitFinding(result, file.rel)
      this.eyeFindings.push({ key: hit.key, title: described.titleText })
      fresh.push(`${hit.key} — ${described.titleText}`)
    }
    for (const problem of problems) {
      const { key, title } = problemKey(problem)
      if (this.seenKeys.has(key)) continue
      this.seenKeys.add(key)
      const result = this.input.hooks.record({
        key,
        title,
        kind: 'kesin',
        source: 'goz',
        phase,
        scenario: `${this.input.page} sayfasını aç${phase === 'gorev' ? ' ve akıştaki adımları izle' : ''}.`,
        expected: 'Konsolda hata ve başarısız istek olmamalı.',
        observed: problem.text,
        quote: null,
        shot: null,
        box: null,
        rules: [],
        verified: true,
        suppressedByRule: null,
      })
      this.emitFinding(result, null)
      this.eyeFindings.push({ key, title })
      fresh.push(`${key} — ${title}`)
    }
    return fresh
  }

  private emitFinding(result: RecordResult, shot: string | null): void {
    if (result.duplicate) return
    this.input.hooks.emit({
      type: 'bulgu',
      issueId: result.issue.id,
      occurrenceId: result.occurrence.id,
      key: result.issue.key,
      title: result.issue.title,
      kind: result.occurrence.kind,
      outcome: result.outcome,
      reason: result.reason,
      shot,
    })
  }

  /** Ekranın modele giden hâli: ağaç (sıkıştırılmış), yeni sorunlar ve istenirse görüntü. */
  private async screen(
    withImage: boolean,
    fresh: string[] = [],
    onlyChanges = false,
  ): Promise<ContentBlock[]> {
    const full = compressSnapshot(await ariaTree(this.page))
    const view = windowSnapshot(full, await scrollFraction(this.page), EXPLORER_TREE)
    // Etkileşimden sonra ağacın tamamı değil yalnız değişen kısmı gider (en büyük token kalemi buydu).
    const tree = onlyChanges && this.lastTree !== null ? diffSnapshot(this.lastTree, view).text : view
    this.lastTree = view
    const blocked = this.input.session.drainBlocked()
    await this.maybeInspect(full, blocked)
    const header = [`Adres: ${this.page.url()}`, `Sekme başlığı: ${await this.page.title().catch(() => '')}`]
    if (fresh.length)
      header.push(`Gözlerin yeni bulduğu (bildirme, kaydedildi):\n${fresh.map((f) => `- ${f}`).join('\n')}`)
    if (blocked.length) header.push(`Engellenen yazma istekleri (bulgu değil): ${blocked.join(', ')}`)
    const blocks: ContentBlock[] = [text(`${header.join('\n')}\n\nSayfa ağacı:\n${tree}`)]
    if (withImage) {
      const image = await this.input.session.modelScreenshot().catch(() => null)
      if (image)
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: image.toString('base64') },
        })
    }
    return blocks
  }

  private async afterAction(): Promise<string[]> {
    await this.input.session.settle(4_000)
    const hits = await runEyes(this.page, this.input.patterns)
    return this.recordDeterministic(hits, this.input.session.drainProblems(), 'gorev')
  }

  /**
   * Modele istek, rolüyle. Gezgin konuşması büyüdükçe önbellekten okunur (ucuz); yargıç tek seferliktir, onun
   * içeriği önbelleğe yazılmaz (yazma %25 pahalı ve bir daha okunmaz). Sabit talimat her durumda önbellektedir.
   */
  private call(
    role: ModelRole,
    params: Omit<MessageParams, 'model' | 'system' | 'max_tokens'>,
    options: { model?: string; cache?: boolean; audience?: 'gezgin' | 'yargic' } = {},
  ) {
    const model = options.model ?? this.input.settings.models[role]
    return this.input
      .createMessage(
        {
          model,
          max_tokens: 16_000,
          system: this.context?.[options.audience ?? 'gezgin'] ?? this.input.system,
          ...(options.cache === false ? {} : { cache_control: { type: 'ephemeral' as const } }),
          ...params,
          output_config: { effort: this.input.settings.effort, ...(params.output_config ?? {}) },
        },
        role,
      )
      .then((message) => {
        this.input.meter.add(model, message, role)
        this.input.hooks.usageChanged()
        return message
      })
  }

  async run(): Promise<string> {
    const { hooks } = this.input
    // 1. Araştırma: token harcamaz.
    await this.input.session.open(this.input.url)
    if (await this.input.session.isSignInScreen()) {
      hooks.emit({
        type: 'hata',
        message:
          'Sayfa giriş ekranına yönlendirdi; bakılamadı. Uygulama kullanıcısını ve yetkisini kontrol edin.',
      })
      return 'Bakılamadı: giriş ekranı.'
    }
    // Kayıt sayfası kimliksiz açılınca uygulama başka sayfaya yönlendirir: model çağrılmaz, bulgu yazılmaz.
    const landed = landedOn(this.input.url, this.page.url())
    if (landed) {
      this.redirectedTo = landed
      const summary = `Doğrudan açılamadı: uygulama "${landed}" sayfasına yönlendirdi. Bu bir kayıt sayfası olabilir (bir kayıttan ?id= ile açılır); sayfa atlandı, model çağrılmadı.`
      hooks.emit({ type: 'hata', message: summary })
      hooks.emit({ type: 'sayfa-bitti', summary })
      return summary
    }
    const tooltips = await harvestTooltips(this.page)
    const hits = await runEyes(this.page, this.input.patterns)
    const network = this.input.session.drainNetwork()
    const problems = this.input.session.drainProblems()
    await this.recordDeterministic(hits, problems, 'acilis')
    // Bu açılışta görülen her anahtar (göz + konsol + istek) açık kalır; yalnız görülmeyenler "düzeldi" olur.
    const closed = hooks.closeVanishedEyeIssues(new Set(this.seenKeys))
    for (const key of closed)
      hooks.emit({
        type: 'sorun-durumu',
        key,
        state: 'yok',
        note: 'Açılışta artık görünmüyor; düzeldi olarak işaretlendi.',
      })
    this.change = await hooks.print(uiPrint(compressSnapshot(await ariaTree(this.page))), apiPrint(network))
    const toVerify = await this.verifyOpenIssues(new Set(closed))
    hooks.emit({
      type: 'arastirma',
      tooltips: tooltips.length,
      eyeFindings: this.eyeFindings.length,
      requests: network.length,
      shot: null,
      rules: this.input.ruleStats,
    })
    if (network.length) hooks.emit({ type: 'ag', requests: network.slice(0, 40) })

    const contextFor = (audience: 'gezgin' | 'yargic'): TextBlockParam[] => [
      ...(typeof this.input.system === 'string'
        ? [{ type: 'text' as const, text: this.input.system }]
        : (this.input.system ?? [])),
      {
        type: 'text',
        text: pageFacts(
          {
            ...this.input.facts,
            openIssues: audience === 'yargic' ? this.input.facts.openIssues : toVerify,
            page: this.input.page,
            url: this.input.url,
            tooltips,
            problems: problems.map((p) => p.text),
          },
          audience,
        ),
        cache_control: { type: 'ephemeral' },
      },
    ]
    this.context = { gezgin: contextFor('gezgin'), yargic: contextFor('yargic') }
    const facts = () => eyeFindingsText(this.eyeFindings)

    // 2. Plan: stratejinin bu sayfadaki kalemleri önce; tam tarama istendiyse planlayıcı sayfanın görevlerini de çıkarır
    // (tek çağrı, yapılandırılmış çıktı). Tek görevli taramada ayrı plan çağrısı yapılmaz: görev sayfanın tamamını kapsar.
    if (hooks.stopped()) return 'Durduruldu.'
    const planned = !this.input.work.scan
      ? { summary: 'Strateji kalemleri.', tasks: [] }
      : this.input.maxTasks === 1
        ? {
            summary: '',
            tasks: [
              {
                baslik: 'Sayfanın tamamı',
                amac:
                  'Açık sorunları yeniden doğrula; listeleri, filtreleri, sıralamayı, "Yeni"/"Ekle" formlarını (kaydetmeden), pencereleri, sekmeleri ve sayfa genelinde tutarlılığı dene.' +
                  (this.input.brief ? ` Kullanıcının talimatını önce karşıla: ${this.input.brief}` : ''),
              },
            ],
          }
        : await this.plan(facts)
    const summary = planned.summary
    const tasks = [...this.input.work.tasks, ...planned.tasks].length
      ? [...this.input.work.tasks, ...planned.tasks]
      : [
          {
            baslik: 'Genel gezinti',
            amac: 'Sayfadaki ana öğeleri, listeleri, filtreleri ve açılan pencereleri dene.',
          },
        ]
    hooks.emit({ type: 'plan', summary, tasks: tasks.map((t) => ({ title: t.baslik, goal: t.amac })) })

    // 3. Görevler: her biri kısa, ayrı bir konuşma.
    const notebook: string[] = []
    for (const [index, task] of tasks.entries()) {
      if (hooks.stopped()) break
      hooks.emit({ type: 'gorev-basladi', index, title: task.baslik })
      // Her görev sayfanın temiz hâlinden başlar: önceki görevin bıraktığı form, pencere ya da gezinti ona bulaşmaz.
      if (index > 0) {
        await this.input.session.open(this.input.url)
        this.trail = []
      }
      const result = await this.runTask(task, notebook, facts).catch((error: unknown) => {
        hooks.emit({ type: 'hata', message: `Görev yarım kaldı: ${describeModelError(error)}` })
        return `Yarım kaldı: ${describeModelError(error)}`
      })
      notebook.push(`${index + 1}. ${task.baslik}: ${result}`)
      hooks.emit({ type: 'gorev-bitti', index, summary: result })
    }
    // Gözün süren incelemeleri beklenir; sonra kanıt sekmesi kapanır.
    await Promise.allSettled(this.pending)
    if (!hooks.stopped())
      await this.compareTerms().catch((error: unknown) => {
        hooks.emit({ type: 'hata', message: `Terim gözü çalışamadı: ${describeModelError(error)}` })
      })
    await this.overlayQueue
    if (this.overlay) await (await this.overlay).close().catch(() => undefined)
    const pageSummary = [summary, ...notebook].filter(Boolean).join('\n')
    if (!hooks.stopped()) {
      // Yeni öğrenme yoksa (sayfa değişmedi, bulgu yok) bilgi yeniden yazılmaz.
      const nothingNew =
        this.input.facts.knowledge &&
        this.change !== null &&
        !Object.values(this.change).some((c) => c === 'degisti' || c === 'ilk') &&
        this.pageTitles.length === 0
      if (nothingNew)
        hooks.emit({
          type: 'bilgi',
          message: 'Sayfa bilgisi güncel: yeni öğrenme olmadığı için yeniden yazılmadı.',
        })
      else
        await this.distill(pageSummary, facts).catch((error: unknown) => {
          hooks.emit({ type: 'hata', message: `Sayfa bilgisi yazılamadı: ${describeModelError(error)}` })
        })
    }
    hooks.emit({ type: 'sayfa-bitti', summary: pageSummary })
    return pageSummary
  }

  /**
   * Sayfa bilgisi: koşu sonunda öğretmen modeli önceki sayfa bilgisini ve bu koşuda yapılanları (plan,
   * görev özetleri, ekran notları, bulgular, insan kararları) okuyup sayfa bilgisini sabit bütçede yeniden yazar.
   */
  private async distill(
    pageSummary: string,
    facts: (audience?: 'gezgin' | 'yargic') => string,
  ): Promise<void> {
    const message = await this.call(
      'teacher',
      {
        messages: [
          {
            role: 'user',
            content: [
              text(
                `${KNOWLEDGE_TASK}\n\n${facts()}` +
                  `\n\nBu koşunun planı ve görev özetleri:\n${pageSummary || '(yok)'}` +
                  `\n\nGözün ekran notları:\n${this.screens.length ? this.screensText() : '(yok)'}` +
                  `\n\nBu koşuda kaydedilen bulgular:\n${this.pageTitles.length ? this.pageTitles.map((t) => `- ${t}`).join('\n') : '(yok)'}`,
              ),
            ],
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: KNOWLEDGE_SCHEMA as unknown as Record<string, unknown> },
        },
      },
      { cache: false, audience: 'yargic' },
    )
    const knowledge = clampKnowledge(jsonOf(message))
    this.input.hooks.saveKnowledge(knowledge)
    this.input.hooks.emit({
      type: 'bilgi',
      message: `Sayfa bilgisi güncellendi: ${knowledge.beklentiler.length} beklenti, ${knowledge.kapsanmayan.length} kapsanmayan alan.`,
    })
  }

  /**
   * Değişiklik güdümlü plan: sayfa bilgisi varsa planlayıcıya neyin değiştiğini söyler ve görevleri değişen,
   * kapsanmayan ya da güveni düşük alana yöneltir; değişmeyen ve bilinen alan yeniden gezilmez.
   */
  private changeGuidance(): string {
    if (!this.input.facts.knowledge || !this.change) return ''
    const words: Record<PrintChange, string> = {
      ilk: 'ilk ölçüm',
      ayni: 'aynı',
      degisti: 'DEĞİŞTİ',
      bilinmiyor: 'bilinmiyor',
    }
    const changed = Object.values(this.change).includes('degisti')
    return (
      `\n\nDEĞİŞİKLİK İZİ (önceki koşuya göre): arayüz yapısı ${words[this.change.ui]}, veri uçları ${words[this.change.api]}, Studio tanımı ${words[this.change.studio]}. ` +
      (changed
        ? 'Sayfa değişti: görevleri önce değişikliğin etkileyebileceği yere, sonra sayfa bilgisindeki kapsanmayan alanlara yönelt.'
        : 'Sayfa değişmedi: sayfa bilgisinde "kapsanan" yazan alanları yeniden gezme. Görevleri yalnız kapsanmayan alanlara, güveni düşük beklentilere ve etkileşimle bakılacak açık sorunlara yönelt; bunlar azsa 1 görev yeterlidir.')
    )
  }

  private async plan(
    facts: () => string,
  ): Promise<{ summary: string; tasks: Array<{ baslik: string; amac: string }> }> {
    try {
      const message = await this.call('planner', {
        messages: [
          {
            role: 'user',
            content: [
              text(
                `${facts()}\n\nBu sayfayı eksiksiz test etmek için gereken kadar görev planla (en az ${this.changeGuidance() ? 1 : 2}; ${this.input.maxTasks}'yi aşacaksa yakın alanları birleştir). Basit sayfaya az, zengin sayfaya çok görev; hiçbir bölge ya da akış dışarıda kalmasın. ` +
                  'Görevler birbiriyle örtüşmesin: her ekran bölgesi ya da akış tek bir görevde denensin. Görevler somut olsun (hangi alan, ne denenecek; ' +
                  'görevi yapacak model daha küçük olabilir, amacı adım adım ve açık yaz). ' +
                  'Etkileşimle bakılacak açık sorun varsa onları ilgili göreve kat; ayrı bir "doğrulama" görevi açma. Liste/filtre/sıralama/sayfalama, "Yeni"/"Ekle" ile açılan formlar (kaydetmeden), ' +
                  'pencereler, sekmeler, menüler ve sayfa genelinde tutarlılığı kapsa. Ekranın ağacı ve görüntüsü aşağıda.' +
                  this.changeGuidance(),
              ),
              ...this.briefBlocks(),
              ...(await this.screen(true)),
            ],
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: PLAN_SCHEMA as unknown as Record<string, unknown> },
        },
      })
      const plan = jsonOf<{ ozet: string; gorevler: Array<{ baslik: string; amac: string }> }>(message)
      return { summary: plan?.ozet ?? '', tasks: (plan?.gorevler ?? []).slice(0, this.input.maxTasks) }
    } catch (error) {
      this.input.hooks.emit({ type: 'hata', message: `Plan yapılamadı: ${describeModelError(error)}` })
      throw error
    }
  }

  /**
   * Kullanıcının talimatı ve ekleri, plan isteminde: planlayıcı görevleri önce talimatı karşılayacak biçimde kurar.
   * Görsel ve PDF kendi bloğuyla, Excel / Word / metin adıyla birlikte metin olarak gider. Talimat ve ek yoksa hiçbir
   * şey eklenmez (maliyet değişmez).
   */
  private briefBlocks(): ContentBlock[] {
    const { brief, attachments } = this.input
    if (!brief && !attachments.length) return []
    return [
      text(
        'KULLANICININ TALİMATI (planı önce bunu karşılayacak biçimde kur; talimat sayfanın tamamını kapsamıyorsa kalan görevleri olağan kapsamla doldur):\n' +
          (brief ?? '(yalnız dosya eklendi)') +
          (attachments.length
            ? `\nKullanıcı ${attachments.length} dosya ekledi (aşağıda: ${attachments.map((a) => a.name).join(', ')}); gösterdiği yer, gereksinim ve sorunlar önceliklidir.`
            : ''),
      ),
      ...attachments.flatMap((file): ContentBlock[] => {
        switch (file.kind) {
          case 'image':
            return [
              text(`Ek: ${file.name}`),
              { type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } },
            ]
          case 'pdf':
            return [
              {
                type: 'document',
                title: file.name,
                source: { type: 'base64', media_type: 'application/pdf', data: file.data },
              },
            ]
          default:
            return [
              text(`Ek: ${file.name}${file.truncated ? ' (uzun; başı)' : ''}\n<<<EK\n${file.text}\nEK>>>`),
            ]
        }
      }),
    ]
  }

  private async runTask(
    task: { baslik: string; amac: string },
    notebook: string[],
    facts: () => string,
  ): Promise<string> {
    const { hooks } = this.input
    const intro =
      `${facts()}\n\n` +
      (notebook.length ? `Bu sayfada önceki görevler:\n${notebook.join('\n')}\n\n` : '') +
      (this.input.brief ? `Kullanıcının bu koşu için talimatı: ${this.input.brief}\n\n` : '') +
      `GÖREV: ${task.baslik}\n${task.amac}\nGörevdeki her maddeyi tamamlayana kadar çalış; adım sınırı yok, ama aynı işlemi tekrarlama. Bitince gorevi_bitir çağır.` +
      (this.input.settings.inspector
        ? " Ulaştığın her yeni ekranı ayrı bir göz inceliyor: içerik ve tutarlılık sorunlarını o bulur. Senin işin görevdeki her maddeye ulaşmak (sekme, filtre, sıralama, pencere, form, detay) ve davranış sorunlarını bildirmek: tepki vermeyen düğme, açılmayan pencere, çalışmayan filtre, hata. Ulaşamadığın maddeyi gorevi_bitir'in eksik alanına yaz."
        : '') +
      ' Ekranın şu anki hâli aşağıda.'
    const messages: MessageParam[] = [{ role: 'user', content: [text(intro), ...(await this.screen(false))] }]
    let steps = 0
    let finalRound = false
    // Gezgin ucuz modelle başlar; üst üste iki tur ilerleyemezse (öğe yok, ekran değişmedi, hata) ya da yanıt
    // reddedilirse merdivende bir üst modele geçer. Konuşma aynen sürer.
    let model = this.input.settings.models.explorer
    let stuck = 0
    const escalate = (why: string): boolean => {
      const at = ESCALATION_LADDER.indexOf(model)
      // Göz açıkken içeriği zaten Opus inceliyor; gezgin en çok Sonnet'e çıkar (Opus'a geçiş maliyeti ikiye katlıyordu).
      const ladder = this.input.settings.inspector ? ESCALATION_LADDER.slice(0, 2) : ESCALATION_LADDER
      const next = this.input.settings.escalate && at >= 0 ? ladder[at + 1] : undefined
      if (!next) return false
      hooks.emit({ type: 'bilgi', message: `Gezgin ${why}; ${model} → ${next} ile devam ediliyor.` })
      model = next
      stuck = 0
      return true
    }
    // Eksik bırakılan madde için üst modele bir kez geçilir; aynı işlem (ad + girdi) kaç kez yapıldı.
    let retried = false
    const repeats = new Map<string, number>()
    let closing: string | null = null
    for (let round = 0; round < this.input.maxSteps + 8; round += 1) {
      if (hooks.stopped()) return 'Durduruldu.'
      const last = messages[messages.length - 1]!
      for (const message of hooks.drainSteering()) {
        ;(last.content as ContentBlock[]).push(text(`KULLANICI YÖNLENDİRMESİ: ${message}`))
        hooks.emit({ type: 'yonlendirme', message })
      }
      const response = await this.call('explorer', { messages, tools: this.tools }, { model })
      if (response.stop_reason === 'refusal') {
        if (escalate('yanıt vermedi')) continue
        return 'Model bu adımı yanıtlamadı.'
      }
      messages.push({ role: 'assistant', content: response.content })
      const uses = response.content.filter((b) => b.type === 'tool_use')
      if (!uses.length) return textOf(response).slice(0, 400) || 'Görev bitti.'
      const results: ContentBlock[] = []
      let summary: string | null = null
      let progressed = false
      for (const use of uses) {
        if (use.type !== 'tool_use') continue
        steps += 1
        const reply = (content: string | ContentBlock[], isError = false) =>
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: content as never,
            ...(isError ? { is_error: true } : {}),
          })
        try {
          if (use.name === 'gorevi_bitir') {
            const missing = field(use.input, 'eksik').trim()
            // Görevin bir kısmına ulaşılamadıysa bir kez üst modele geçilir: kapsam kaçmasın.
            if (
              missing &&
              !finalRound &&
              !retried &&
              escalate(`"${missing.slice(0, 80)}" maddesini eksik bıraktı`)
            ) {
              retried = true
              reply(`Daha güçlü bir modele geçildi. Eksik maddeleri tamamla: ${missing}`)
              continue
            }
            summary = `${field(use.input, 'ozet')}${missing ? ` Eksik kalan: ${missing}` : ''}`
            reply('Tamam.')
            continue
          }
          if (use.name === 'bulgu_bildir') {
            progressed = true
            reply(await this.report(use.input))
            continue
          }
          if (use.name === 'bulgu_geri_al') {
            const key = field(use.input, 'anahtar')
            const own = this.normalizeKey(key)
            const ok = hooks.retract(this.normalizeKey(this.verdicts.get(own)?.anahtar || own))
            hooks.emit({
              type: 'bilgi',
              message: ok
                ? `Bulgu geri alındı: ${key} — ${field(use.input, 'neden')}`
                : `Geri alınacak bulgu yok: ${key}`,
            })
            reply(ok ? 'Geri alındı.' : 'Bu anahtarla bu sayfada bildirilmiş bulgu yok.')
            continue
          }
          if (use.name === 'sorun_durumu') {
            const key = field(use.input, 'anahtar')
            const state = field(use.input, 'durum') === 'yok' ? 'yok' : 'var'
            const note = field(use.input, 'aciklama')
            if (state === 'yok') hooks.markFixed(key, `Kontrolcü doğruladı: ${note}`)
            hooks.emit({ type: 'sorun-durumu', key, state, note })
            reply('Kaydedildi.')
            continue
          }
          if (finalRound) {
            reply(`${closing} Bulgularını bildir ve gorevi_bitir çağır.`, true)
            continue
          }
          const signature = `${use.name}:${JSON.stringify(use.input)}`
          const seen = (repeats.get(signature) ?? 0) + 1
          repeats.set(signature, seen)
          const outcome = await this.act(use.name, use.input)
          // İpucu taraması çoğu öğede "değişmedi" döner; bu takılma değil, keşiftir. Aynı işlemin aynen tekrarı
          // (iki durum arasında gidip gelmek) ekran değişse de ilerleme sayılmaz.
          if (seen <= REPEAT_LIMIT && (use.name === 'uzerine_gel' || !isStuck(outcome))) progressed = true
          reply(
            seen > REPEAT_LIMIT
              ? [
                  ...(typeof outcome === 'string' ? [text(outcome)] : outcome),
                  text('Bu işlemi aynen daha önce yaptın; görevin başka bir maddesine geç ya da bitir.'),
                ]
              : outcome,
          )
        } catch (error) {
          reply(`Hata: ${firstLine(describeModelError(error))}`, true)
        }
      }
      if (summary !== null) return summary || 'Görev bitti.'
      stuck = progressed ? 0 : stuck + 1
      if (finalRound) return closing!
      // Üst modele geçiş sayacı sıfırlar; en üst modelde de ilerleme yoksa görev kapanır.
      if (stuck >= 2) escalate('iki turdur ilerleyemedi')
      if (stuck >= NO_PROGRESS_LIMIT) closing = 'İlerleme durdu (aynı yerde dönüyor).'
      else if (steps >= this.input.maxSteps) closing = `Güvenlik tavanı (${this.input.maxSteps} adım) doldu.`
      if (closing) {
        finalRound = true
        hooks.emit({ type: 'bilgi', message: `"${task.baslik}" görevi kapatılıyor: ${closing}` })
        results.push(
          text(
            `${closing} Gördüğün sorunları bulgu_bildir ile bildir ve gorevi_bitir çağır; başka işlem yapma.`,
          ),
        )
      }
      messages.push({ role: 'user', content: results })
    }
    return closing ?? 'Güvenlik tavanı doldu.'
  }

  private locate(ref: string): Locator {
    return this.page.getByRef(ref)
  }

  private async act(name: string, input: unknown): Promise<ContentBlock[] | string> {
    const reason = field(input, 'neden') || null
    const ref = field(input, 'ref')
    switch (name) {
      case 'tikla': {
        const target = await this.locate(ref)
          .evaluate((el) => {
            const button = el as HTMLButtonElement
            return {
              label: (el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('title') ?? '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 80),
              submit: button.type === 'submit' && Boolean(button.form),
              control: el.matches(
                'button, [role=button], [role=menuitem], input[type=button], input[type=submit]',
              ),
            }
          })
          .catch(() => null)
        if (!target) return `'${ref}' bulunamadı; ekran değişmiş olabilir, ekrana_bak ile yeniden bak.`
        const frame = await this.frame(name, ref)
        if (isUnsafeTarget(target.label, target.control) || target.submit) {
          await this.step(name, reason, `Salt okuma: "${target.label}" basılmadı.`, frame)
          return `Salt okuma: "${target.label}" yazma işi yapabilir, basılmadı. Başka bir şey dene.`
        }
        await this.locate(ref).click({ timeout: 5_000 })
        const fresh = await this.afterAction()
        const note = await this.step(name, reason, `Tıklandı: "${target.label}"`, frame)
        return [text(`Tıklandı: "${target.label}".${note}`), ...(await this.screen(false, fresh, true))]
      }
      case 'uzerine_gel': {
        const frame = await this.frame(name, ref)
        await this.locate(ref).hover({ timeout: 5_000 })
        await this.page.waitForTimeout(400)
        const tip = await this.page
          .evaluate(() => {
            const pop = Array.from(
              document.querySelectorAll<HTMLElement>('[role="tooltip"], [class*="tooltip"]'),
            ).find(
              (el) =>
                (typeof el.checkVisibility === 'function' ? el.checkVisibility() : true) &&
                (el.textContent ?? '').trim(),
            )
            return (pop?.textContent ?? '').replace(/\s+/g, ' ').trim()
          })
          .catch(() => '')
        const fresh = await this.afterAction()
        const note = await this.step(
          name,
          reason,
          tip ? `İpucu: ${tip.slice(0, 120)}` : 'Üstüne gelindi',
          frame,
        )
        return [
          text((tip ? `Açılan ipucu: ${tip}` : 'İpucu açılmadı.') + note),
          ...(await this.screen(false, fresh, true)),
        ]
      }
      case 'yaz': {
        const value = field(input, 'metin')
        this.input.session.guard.dirty = true
        const frame = await this.frame(name, ref)
        await this.locate(ref).fill(value, { timeout: 5_000 })
        const fresh = await this.afterAction()
        const note = await this.step(name, reason, `Yazıldı: "${value.slice(0, 60)}"`, frame)
        return [text(`Yazıldı.${note}`), ...(await this.screen(false, fresh, true))]
      }
      case 'tus': {
        const key = field(input, 'tus')
        const at = Date.now()
        await this.page.keyboard.press(key)
        const fresh = await this.afterAction()
        const note = await this.step(name, reason, `Tuş: ${key}`, await this.frame(name, undefined, at))
        return [text(`${key} basıldı.${note}`), ...(await this.screen(false, fresh, true))]
      }
      case 'kaydir': {
        const at = Date.now()
        await this.page.mouse.wheel(0, field(input, 'yon') === 'yukari' ? -600 : 600)
        const fresh = await this.afterAction()
        await this.step(
          name,
          reason,
          field(input, 'yon') === 'yukari' ? 'Yukarı kaydırıldı' : 'Aşağı kaydırıldı',
          await this.frame(name, undefined, at),
        )
        return [text('Kaydırıldı.'), ...(await this.screen(false, fresh, true))]
      }
      case 'ekrana_bak': {
        const withImage = (input as { goruntu?: unknown } | null)?.goruntu === true
        const at = Date.now()
        await this.input.session.settle(3_000)
        await this.step(
          name,
          reason,
          withImage ? 'Ekrana bakıldı (görüntüyle)' : 'Ekrana bakıldı',
          await this.frame(name, undefined, at),
        )
        // Ağaç zaten her adımda geliyor; bakışta yalnız fark (ve istenirse görüntü) gider.
        return this.screen(withImage, [], true)
      }
      case 'platform_arac': {
        const arac = field(input, 'arac')
        await this.step(name, reason, `Platform aracı incelendi: ${arac}`)
        return this.input.platform.describe(arac)
      }
      case 'platform_oku': {
        const read = { tool: field(input, 'arac'), input: field(input, 'girdi') }
        const result = await this.input.platform.read(
          read.tool,
          read.input,
          Number((input as Record<string, unknown> | null)?.devam) || 0,
        )
        const view = readStep({ ...read, result })
        await this.step(name, reason, view.outcome, undefined, view.platform)
        return result
      }
      case 'platform_yaz': {
        const write = { tool: field(input, 'arac'), input: field(input, 'girdi'), write: true }
        const result = await this.input.platform.write(write.tool, write.input)
        const view = readStep({ ...write, result })
        await this.step(name, reason, view.outcome, undefined, view.platform)
        return result
      }
      case 'bastan_ac': {
        const at = Date.now()
        await this.input.session.open(this.input.url)
        const fresh = await this.recordDeterministic(
          await runEyes(this.page, this.input.patterns),
          this.input.session.drainProblems(),
          'gorev',
        )
        await this.step(name, reason, 'Sayfa baştan açıldı', await this.frame(name, undefined, at))
        return this.screen(false, fresh, true)
      }
      default:
        return `Bilinmeyen araç: ${name}`
    }
  }

  private normalizeKey(key: string): string {
    const clean = key
      .trim()
      .toLocaleLowerCase('tr')
      .replace(/[^a-z0-9çğıöşüâîû:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return clean.startsWith('yz:') || clean.startsWith('goz:') ? clean : `yz:${clean || 'adsiz'}`
  }

  /** Yargıç: aday bulguyu ekranın o anki ağacı ve görüntüsüyle, bilinen ve reddedilen sorunlara karşı denetler. */
  private async judge(input: unknown, key: string): Promise<Verdict | null> {
    const candidate = {
      anahtar: key,
      tur: field(input, 'tur'),
      baslik: field(input, 'baslik'),
      senaryo: field(input, 'senaryo'),
      beklenen: field(input, 'beklenen'),
      gozlenen: field(input, 'gozlenen'),
      alinti: field(input, 'alinti'),
    }
    // Yargıç adayı gezginin gördüğü pencereyle ve görüntüyle denetler: aday oradan gelir; sayfanın tam ağacını her aday
    // için önbelleksiz okumak yargıcın maliyetini büyütüyordu.
    const tree = windowSnapshot(
      compressSnapshot(await ariaTree(this.page)),
      await scrollFraction(this.page),
      EXPLORER_TREE,
    )
    const image = await this.input.session.modelScreenshot().catch(() => null)
    const message = await this.call(
      'judge',
      {
        messages: [
          {
            role: 'user',
            content: [
              text(
                `${eyeFindingsText(this.eyeFindings)}\n\n${JUDGE_TASK}\n\nBu ekrana gelen son adımlar:\n${this.trail.length ? this.trail.map((t) => `- ${t}`).join('\n') : '- Sayfa açıldı.'}\n\nAday bulgu:\n${JSON.stringify(candidate, null, 1)}\n\nEkranın ağacı:\n${tree}`,
              ),
              ...(image
                ? [
                    {
                      type: 'image' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: 'image/jpeg' as const,
                        data: image.toString('base64'),
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        output_config: {
          format: { type: 'json_schema', schema: JUDGE_SCHEMA as unknown as Record<string, unknown> },
        },
      },
      { cache: false, audience: 'yargic' },
    )
    const verdict = jsonOf<Partial<Verdict>>(message)
    if (!verdict || !['kabul', 'not', 'ret'].includes(verdict.karar ?? '')) return null
    return {
      karar: verdict.karar!,
      tur: verdict.tur ?? '',
      anahtar: verdict.anahtar ?? '',
      baslik: verdict.baslik ?? '',
      gerekce: verdict.gerekce ?? '',
    }
  }

  /** Bildirilen bulgu: alıntı doğrulanır, öğe kutuyla işaretlenip kanıt alınır, sorun kaydına işlenir. */
  private async report(input: unknown): Promise<string> {
    const { hooks } = this.input
    const key = this.normalizeKey(field(input, 'anahtar'))
    const quote = field(input, 'alinti').trim()
    let verified = true
    if (quote) {
      const present = async () => normalizeSpace(await visibleText(this.page)).includes(normalizeSpace(quote))
      verified = await present()
      if (!verified) {
        await this.page.waitForTimeout(1_500)
        verified = await present()
      }
    }
    const ref = field(input, 'ref').trim()
    let title = field(input, 'baslik').trim() || key
    let kind = (FINDING_KIND_SET.has(field(input, 'tur')) ? field(input, 'tur') : 'not') as FindingKind
    let finalKey = key
    const rules = Array.isArray((input as { kurallar?: unknown }).kurallar)
      ? ((input as { kurallar: unknown[] }).kurallar.filter((r) => typeof r === 'string') as string[])
      : []
    const suppressedBy = field(input, 'bastiran_kural').trim() || null
    // Bastırılan ya da alıntısı doğrulanamayan aday zaten açık bulgu sayılmaz; yargıç yalnız gerisine bakar.
    if (verified && !suppressedBy) {
      const verdict = this.verdicts.has(key)
        ? this.verdicts.get(key)!
        : await this.judge(input, key).catch((error: unknown) => {
            hooks.emit({
              type: 'hata',
              message: `Yargıç çalışmadı, aday olduğu gibi kaydedildi: ${describeModelError(error)}`,
            })
            return null
          })
      // Ret saklanmaz: gezgin ekran değiştikten sonra yeniden bildirirse yargıç yeniden bakar.
      if (verdict && verdict.karar !== 'ret') this.verdicts.set(key, verdict)
      if (verdict?.karar === 'ret') {
        hooks.emit({ type: 'bilgi', message: `Yargıç reddetti: ${title} — ${verdict.gerekce}` })
        return `Yargıç kabul etmedi: ${verdict.gerekce} Kaydedilmedi; başka bir şeye geç.`
      }
      if (verdict) {
        finalKey = this.normalizeKey(verdict.anahtar || key)
        title = verdict.baslik.trim() || title
        kind =
          verdict.karar === 'not'
            ? 'not'
            : ((FINDING_KIND_SET.has(verdict.tur) ? verdict.tur : kind) as FindingKind)
        if (verdict.karar === 'not' || finalKey !== key)
          hooks.emit({
            type: 'bilgi',
            message: `Yargıç: ${verdict.karar === 'not' ? 'nota indirdi' : 'kabul'}${finalKey !== key ? `, anahtar ${finalKey}` : ''} — ${verdict.gerekce}`,
          })
      }
    }
    const file = hooks.file('kanit')
    const { box } = await captureEvidence(this.page, file.abs, {
      ...(ref ? { locator: this.locate(ref) } : {}),
      label: title,
    }).catch(() => ({ box: null }))
    const result = hooks.record({
      key: finalKey,
      title,
      kind,
      source: 'yz',
      phase: 'gorev',
      scenario: field(input, 'senaryo'),
      expected: field(input, 'beklenen'),
      observed: field(input, 'gozlenen'),
      quote: quote || null,
      shot: file.rel,
      box,
      rules,
      verified,
      suppressedByRule: suppressedBy,
    })
    this.pageTitles.push(`${finalKey} — ${title}`)
    this.emitFinding(result, file.rel)
    if (!verified)
      return `Kaydedildi ama alıntı ("${quote}") ekranda bulunamadı; not olarak işaretlendi. Ekran değiştiyse yeniden bak.`
    if (result.outcome === 'bastirildi') return `Kaydedildi, bastırıldı (${result.reason}).`
    return result.outcome === 'tekrar'
      ? 'Bu sorun zaten biliniyordu; yeni görünüm olarak eklendi.'
      : 'Kaydedildi, ekran görüntüsü alındı.'
  }
}

const FINDING_KIND_SET = new Set<string>(['kesin', 'tutarsizlik', 'not'])
/** Sayfa başına gözün en çok kaç ekran incelediği (maliyet tavanı). */

interface Verdict {
  karar: 'kabul' | 'not' | 'ret'
  tur: string
  anahtar: string
  baslik: string
  gerekce: string
}

/** Etkileşim bir şey değiştirmedi mi: öğe bulunamadı, basılmadı ya da ekran aynı kaldı. */
function isStuck(outcome: string | ContentBlock[]): boolean {
  const body =
    typeof outcome === 'string' ? outcome : outcome.map((b) => (b.type === 'text' ? b.text : '')).join('\n')
  return /bulunamadı|Salt okuma|Ekranın ağacı değişmedi/.test(body)
}
