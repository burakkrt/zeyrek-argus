/**
 * Sunucu ile arayüzün ortak dili. Değerler Türkçe (arayüzde ve hafıza dosyalarında görünür), adlar İngilizce.
 */

/** Kanıt türü: kesin (görüldü, tekrar üretildi), tutarsızlık (neyle çeliştiği yazılı), not (bulgu sayılmaz). */
export const FINDING_KINDS = ['kesin', 'tutarsizlik', 'not'] as const
export type FindingKind = (typeof FINDING_KINDS)[number]
/**
 * Önem (teknik etki; tür değil): S1 veri kaybı, yetki sızıntısı, yanlış hesap, kilitlenen akış; S2 atlatılan kural,
 * geçersiz geçiş; S3 kötü hata yönetimi (geçici çözüm var); S4 görünüm ve metin. Liste önce S1'i gösterir.
 */
export const SEVERITIES = ['S1', 'S2', 'S3', 'S4'] as const
export type Severity = (typeof SEVERITIES)[number]

/** Sorunun durumu: insan kararıyla değişir; "düzeldi" kontrolcü doğrulamasıyla da gelebilir. */
export const ISSUE_STATUSES = ['acik', 'duzeltilecek', 'bulgu-degil', 'duzeldi'] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export const RULE_TYPES = ['sorun', 'sorun-degil', 'bilgi'] as const
export type RuleType = (typeof RULE_TYPES)[number]

export const RULE_STATES = ['aday', 'onayli', 'emekli'] as const
export type RuleState = (typeof RULE_STATES)[number]

/** Kuralın geçerli olduğu yer: bütün platform, bir uygulama, bir modül (sayfa öneki) ya da tek sayfa. */
export type RuleScope = 'platform' | 'uygulama' | `modul:${string}` | `sayfa:${string}`

export interface AppRef {
  project: string
  application: string
}

/**
 * Çalışma alanı: arayüzün odaklandığı tek proje · uygulama · dal (ortam adı). Sunucuda saklanır; bütün sayfalar
 * buna göre süzülür.
 */
export interface Workspace extends AppRef {
  environment: string
}

export interface WorkspaceState {
  /** null: hiçbir yoldan çıkarılamadı, kullanıcı bir kez seçmeli. */
  workspace: Workspace | null
  /** Görünen adlar (katalogdan; platforma ulaşılamazsa kısa adlar). */
  labels: { project: string; application: string } | null
  /** Kayıtlı seçim geçersiz kalıp başka seçime geçildiyse kullanıcıya söylenecek cümle. */
  notice: string | null
}

export interface Rule {
  id: string
  scope: RuleScope
  type: RuleType
  state: RuleState
  text: string
  /** Belirlenimci göz: ekrandaki metinde aranan düzenli ifade (token harcamaz). */
  pattern?: string
  sources: string[]
  author: string
  date: string
  /** Kuralın dosyası (hafıza köküne göre); platform kuralı için app yoktur. */
  file: string
  app: AppRef | null
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Adımın hedef öğesi, görünüm alanına oranla (0–1): monitörde imleç ve çerçeve buraya çizilir. */
export interface StepTarget {
  x: number
  y: number
  width: number
  height: number
}

export interface Usage {
  input: number
  cacheWrite: number
  cacheRead: number
  output: number
  requests: number
  costUsd: number | null
  /** Rol başına istek ve maliyet (planlayıcı, gezgin, yargıç, öğretmen). */
  roles?: Partial<Record<ModelRole, { requests: number; costUsd: number | null; model: string }>>
  /** Koşunun model sağlayıcısı; abonelikte `costUsd` 0'dır (planın kullanım hakkından düşer). */
  provider?: ModelProvider
}

/**
 * Modelin işi: planlayıcı görev çıkarır, gezgin ekranı gezer, göz ulaşılan ekranı inceler, yargıç gezginin adayını
 * denetler, öğretmen ders çıkarır.
 */
/**
 * Model sağlayıcısı: `abonelik` kullanıcının bu bilgisayarda kendi hesabıyla giriş yaptığı Claude Code üzerinden
 * (resmi Agent SDK; Argus jetona dokunmaz), `api` .env'deki ANTHROPIC_API_KEY ile. Abonelikte koşu maliyeti planın
 * kullanım hakkından düşer, dolar olarak yazılmaz.
 */
export type ModelProvider = 'abonelik' | 'api'

export const MODEL_ROLES = ['planner', 'investigator', 'explorer', 'inspector', 'judge', 'teacher'] as const
export type ModelRole = (typeof MODEL_ROLES)[number]
export const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  planner: 'Planlayıcı',
  investigator: 'Araştırmacı',
  explorer: 'Gezgin',
  inspector: 'Göz',
  judge: 'Yargıç',
  teacher: 'Öğretmen',
}

export const RUN_STATUSES = ['sirada', 'calisiyor', 'bitti', 'hata', 'durduruldu'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

/**
 * Koşunun güvenlik tavanları: görev ve adım kullanıcıya bırakılmaz (kalite önceliklidir); tavan kapsamı daraltmak için
 * değil, kaçağı (sonsuz döngü) durdurmak içindir. Ayrıntı: `server/src/agent/page-controller.ts`.
 */
export const RUN_CEILINGS = { maxTasks: 20, maxSteps: 150 } as const

/**
 * Koşunun kipi: normal (sayfa ya da istek), tekrar (kayıtlı vakaları yeniden doğrula; planlama ve keşif yok), kapi
 * (yayın kapısı: development → production farkına odaklı koşu + kayıtlı vakalar; kanıtlı S1/S2 varsa kapı kapalı).
 */
export const RUN_MODES = ['normal', 'tekrar', 'kapi'] as const
export type RunMode = (typeof RUN_MODES)[number]

/** Kayıtlı vakanın bir adımı: kanıtlayan platform çağrısı. */
export interface PlatformCall {
  tool: string
  input: string
  write: boolean
}

export interface RunOptions {
  /** Sayfa başına görev tavanı (`RUN_CEILINGS`; testler küçültür). */
  maxTasks: number
  /** Görev başına adım tavanı (`RUN_CEILINGS`; testler küçültür). */
  maxSteps: number
  /** Koşunun kimliği: uygulama hesabının kullanıcı adı; boşsa varsayılan hesap (yoksa platform jetonu). */
  user?: string | null
  /** Kullanıcının talimatı: neye odaklanılsın, nerede sorun var (planlayıcı ve gezgin okur). */
  brief?: string | null
  /** Talimata eklenen görsellerin kimlikleri (`data/ekler/`); planlayıcı görür. */
  attachments?: string[]
  /** Yoksa normal. */
  mode?: RunMode
}

export interface RunInfo {
  id: string
  /** Koşunun okunur kodu (`KOS-2026-0007`): yıl içinde sıralı, koşu başlatılınca atanır, değişmez. */
  code: string
  project: string
  application: string
  environment: string
  pages: string[]
  options: RunOptions
  status: RunStatus
  error: string | null
  usage: Usage
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  counts: { new: number; repeated: number; suppressed: number }
  /** Girdili koşunun kapsam raporu; girdisiz (yalnız tarama) koşuda null. */
  coverage: RunCoverage | null
}

export interface NetworkEntry {
  method: string
  url: string
  status: number
  ms: number
  blocked?: boolean
}

export type OccurrenceOutcome = 'yeni' | 'tekrar' | 'bastirildi' | 'dogrulanamadi' | 'yeniden-acildi'

/** Bir koşunun akış olayları; saklanır ve monitörde sırayla gösterilir. */
/**
 * Koşunun stratejisi (anla adımı, `server/src/agent/strategist.ts`): isteğin türü, cevaplanacak sorular, başarı ölçütü,
 * tanımdan bilinenler, salt okumada yapılamayanlar ve iş kalemleri. Her kalemin kaynağı tanım (platform okuması),
 * ekran (tarayıcı) ya da ikisidir; ekran kalemleri bir sayfaya bağlıdır.
 */
export type StrategyKind = 'arayuz' | 'kural' | 'akis' | 'karisik'
export type ItemSource = 'tanim' | 'ekran' | 'ikisi'

export interface StrategyItem {
  title: string
  goal: string
  source: ItemSource
  /** Ekran ve ikisi kalemlerinde test edilen sayfa (katalogdaki slug); tanım kaleminde null. */
  page: string | null
  /** Sayfanın tamamı taransın mı (planlayıcı sayfanın görevlerini kendisi çıkarır); değilse kalem tek görevdir. */
  fullScan: boolean
  /** Tanım kalemi kendi verisini kurup siliyor, başka kalemin sonucunu kullanmıyor: paralel yürüyebilir. */
  independent: boolean
  /** Yeniden doğrulanan kayıtlı vakanın sorun anahtarı. */
  caseKey?: string
}

/**
 * İsteğin kapsamı (planlayıcı seçer): neyin test edileceğini daraltır, nasıl test edileceğini değil. Süre ya da vaka
 * sayısı sınırı yoktur (zaman baskısı modeli yüzeyselleştirir); dar kapsamda sorulan şey eksiksiz cevaplanır, modülün
 * geri kalanına bakılmaz ve kapsam raporunda "bakılmayan" olarak yazılır.
 */
export const RUN_SCOPES = ['soru', 'degisiklik', 'musteri', 'tam'] as const
export type RunScope = (typeof RUN_SCOPES)[number]
export const SCOPE_LABELS: Record<RunScope, string> = {
  soru: 'Soru',
  degisiklik: 'Değişiklik testi',
  musteri: 'Müşteri bulgusu',
  tam: 'Tam test',
}

export interface RunStrategy {
  kind: StrategyKind
  /** İsteğin kapsamı: vaka sayısı, ekran ve gözetmen turu buna göre. */
  scope: RunScope
  /** Test edilecek kapsam (modül, sayfa, konu, işleyiş), kendi cümlesiyle. */
  understood: string
  /** Test senaryoları: her biri durum + beklenen davranış + bakılacak tutarsızlık. */
  scenarios: string[]
  /** Kapsam ne olunca tamam sayılır. */
  doneWhen: string
  known: string[]
  infeasible: string[]
  items: StrategyItem[]
  /** Bu koşu için seçilen test yöntemleri (`memory/test/` kimlikleri); `arayuz` seçildiyse ekranları göz de inceler. */
  guides: string[]
}

/**
 * Girdili koşunun kapsam raporu (gözetmen, `server/src/agent/supervisor.ts`). Argus bulgu uygulamasıdır: koşunun
 * çıktısı bulgulardır; bu rapor yalnız istenen kapsamın ne kadarının test edildiğini, neyin edilemediğini ve nedenini
 * söyler.
 */
export type CoverageStatus = 'tam' | 'kismen' | 'eksik'

export interface RunCoverage {
  status: CoverageStatus
  summary: string
  tested: string[]
  /** Test edilemeyenler, her biri nedeniyle (ör. "aşama ilerletmek veri yazar"). */
  untested: string[]
  /** İsteğin kapsamı dışında kaldığı için bakılmayan alanlar (dar kapsam); eski koşularda yoktur. */
  outOfScope?: string[]
}

export interface PlatformRead {
  tool: string
  input: string
  result: string
  /** Platforma yazma (development'ta veri ya da çalıştırma); yoksa okuma. */
  write?: boolean
  /** Adımın sade dille işi ("Test sorusu oluşturma"); izleme tuvalinde kart başlığı. Eski koşularda yoktur. */
  label?: string
}

/** Tanım kalemlerinin akıştaki sayfası (katalog slug'ı olamaz: '@' içerir). */
export const DEFINITION_PAGE = '@tanimlar'

export type RunEventBody =
  | { type: 'kosu-basladi'; pages: string[] }
  | { type: 'strateji'; strategy: RunStrategy }
  | { type: 'kapsam'; coverage: RunCoverage }
  | { type: 'kosu-bitti'; status: RunStatus; usage: Usage; error?: string }
  | { type: 'sayfa-basladi'; url: string }
  | { type: 'sayfa-bitti'; summary: string }
  | {
      type: 'arastirma'
      tooltips: number
      eyeFindings: number
      requests: number
      shot: string | null
      rules: { used: number; dropped: number; tokens: number }
    }
  | { type: 'plan'; summary: string; tasks: Array<{ title: string; goal: string }> }
  | { type: 'gorev-basladi'; index: number; title: string }
  | { type: 'gorev-bitti'; index: number; summary: string }
  | {
      type: 'adim'
      /** Adımın görevi (paralel tanım kalemlerinde); yoksa sayfanın son başlayan görevi. */
      task?: number
      tool: string
      reason: string | null
      outcome: string
      /** Monitör karesi (yalnız diske; modele gitmez). Etkileşimde işlemden önce, diğerlerinde sonra alınır. */
      shot: string | null
      target: StepTarget | null
      /** İşlemin yapıldığı an (epoch ms): kayıttan izlemede imleç bu ana varır, tıklama halkası burada çıkar. */
      actAt?: number
      /** Adımda açılan tarayıcı penceresinin metni ve kontrolcünün yanıtı (kabul / iptal). */
      dialog?: string
      /** Platform okuması (tanım): araç, girdi ve sonucun başı; izleme ekranının sahnesinde gösterilir. */
      platform?: PlatformRead
    }
  | { type: 'ag'; requests: NetworkEntry[] }
  | {
      type: 'bulgu'
      issueId: string
      occurrenceId: string
      key: string
      title: string
      kind: FindingKind
      severity: Severity
      outcome: OccurrenceOutcome
      reason: string | null
      shot: string | null
    }
  | { type: 'sorun-durumu'; key: string; state: 'var' | 'yok'; note: string }
  | { type: 'yonlendirme'; message: string }
  | { type: 'maliyet'; usage: Usage }
  | { type: 'bilgi'; message: string }
  | { type: 'hata'; message: string }

export type RunEvent = RunEventBody & { runId: string; seq: number; at: string; page: string | null }

/** Canlı tarayıcı karesi (base64 JPEG); aynısı koşu klasörüne `kare/<at>.jpg` olarak da yazılır. */
export interface LiveFrame {
  type: 'kare'
  runId: string
  data: string
  /** Karenin alındığı an (epoch ms). */
  at: number
}

/** Canlı imleç: işlemden hemen önce hedef öğe; saklanmaz (kayıtta adımın `actAt` + `target`'ı aynı işi görür). */
export interface PointerIntent {
  type: 'imlec'
  runId: string
  tool: string
  target: StepTarget
  at: number
}

export type StreamMessage =
  | RunEvent
  | LiveFrame
  | PointerIntent
  | { type: 'kosu-guncellendi'; run: RunInfo }
  | { type: 'calisma-alani'; state: WorkspaceState }

export interface CatalogProject {
  id: string
  slug: string
  name: string
}

export interface CatalogApplication {
  id: string
  slug: string
  name: string
}

export interface CatalogEnvironment {
  name: string
  slug: string
  state: string
}

export interface CatalogPage {
  id: string
  slug: string
  name: string
}

export interface PageGroup {
  key: string
  pages: CatalogPage[]
}

export interface Occurrence {
  id: string
  issueId: string
  runId: string
  page: string
  kind: FindingKind
  severity: Severity
  outcome: OccurrenceOutcome
  scenario: string
  expected: string
  observed: string
  quote: string | null
  shot: string | null
  box: Box | null
  reason: string | null
  rules: string[]
  at: string
}

export interface IssueComment {
  author: string
  text: string
  at: string
}

export interface IssueHistoryEntry {
  from: IssueStatus | null
  to: IssueStatus
  author: string
  note: string | null
  at: string
}

export interface Issue {
  id: string
  project: string
  application: string
  key: string
  title: string
  kind: FindingKind
  /** Görünümlerin en ağırı. */
  severity: Severity
  status: IssueStatus
  /** İki insanın son hükümleri zıt: bastırılmaz, öğrenmeye girmez. */
  contested: boolean
  source: 'goz' | 'yz'
  firstSeen: string
  lastSeen: string
  seenCount: number
  pages: string[]
  lastShot: string | null
}

/** Takım arkadaşının makinesinde görülen (Git'teki `findings/<yazar>.md`'den okunan) son görünüm; görüntüsü yoktur. */
export interface SharedSighting {
  author: string
  page: string
  scenario: string
  expected: string
  observed: string
  quote: string | null
  lastSeen: string
  seenCount: number
}

export interface IssueDetail extends Issue {
  occurrences: Occurrence[]
  comments: IssueComment[]
  history: IssueHistoryEntry[]
  /** Başka makinelerde görülenler (bu makinede hiç görülmemiş olabilir). */
  elsewhere: SharedSighting[]
}

export type ProposalAction = 'ekle' | 'guncelle' | 'birlestir' | 'emekli'

export interface Proposal {
  id: string
  project: string
  application: string
  action: ProposalAction
  rule: Pick<Rule, 'id' | 'scope' | 'type' | 'text'> & { pattern?: string }
  related: string[]
  reason: string
  sources: string[]
  origin: 'ders' | 'bakim' | 'musteri'
  status: 'bekliyor' | 'kabul' | 'ret' | 'otomatik'
  createdAt: string
}

export interface MemoryBudget {
  scope: string
  tokens: number
  limit: number
  rules: number
}

/** Yerel verinin (Git'e girmeyen `data/`) bayt olarak dağılımı; bkz. `server/src/runs/storage.ts`. */
export interface StorageUsage {
  recordings: number
  evidence: number
  attachments: number
  database: number
  total: number
}

export interface StorageStatus {
  usage: StorageUsage
  limitBytes: number
  /** Temizliğin indirdiği düzey (sınırın %70'i): temizlikten hemen sonra yeniden uyarı çıkmasın. */
  targetBytes: number
  over: boolean
}

export interface StorageCleanup {
  recordingsDropped: number
  evidenceFilesDropped: number
  attachmentsDropped: number
  freedBytes: number
}

export interface Settings {
  /**
   * Rol başına model. Ucuz model son kararı vermez: gezginin bildirdiğini yargıç onaylar, ekranın içeriğini göz
   * (Opus) inceler.
   */
  /** Model sağlayıcısı: Claude hesabı (abonelik) ya da API anahtarı. */
  provider: ModelProvider
  models: Record<ModelRole, string>
  /** Gezgin takılınca ya da görevi eksik bırakınca bir üst modele geçsin (Haiku → Sonnet → Opus). */
  escalate: boolean
  /** Gezginin ulaştığı her yeni ekran durumunu Göz modeli ayrıca incelesin. */
  inspector: boolean
  effort: 'low' | 'medium' | 'high'
  /** Kurallara ayrılan token bütçesi (sayfa başına istemde). */
  ruleBudget: number
  /** "Sorun ara" kuralları onaysız devreye girsin mi. "Sorun sayma" kuralları her zaman onay ister. */
  autoApproveFindingRules: boolean
  /** Bu kadar yeni karar birikince koşu sonunda ders çıkarıcı kendiliğinden çalışır (0: kapalı). */
  learnAfterDecisions: number
  /** Yerel verinin üst sınırı (GB). Aşılınca üç günde bir kez bildirim çıkar; silme yalnız kullanıcı isteyince yapılır. */
  storageLimitGb: number
}

export interface AppUserSetting {
  project: string
  application: string
  identifier: string
  hasPassword: boolean
  /** Koşuda kullanıcı seçilmezse bu hesapla girilir; uygulama başına bir tane. */
  isDefault: boolean
}

export interface ProbeLine {
  status: 'ok' | 'fail' | 'skip'
  label: string
  detail?: string
}

export const STATUS_LABELS: Record<IssueStatus, string> = {
  acik: 'Açık',
  duzeltilecek: 'Düzeltilecek',
  'bulgu-degil': 'Bulgu değil',
  duzeldi: 'Düzeldi',
}

export const KIND_LABELS: Record<FindingKind, string> = {
  kesin: 'Kesin',
  tutarsizlik: 'Tutarsızlık',
  not: 'Not',
}

/** Sayfa slug'ının öneki modül sayılır (`pf-donem-liste` → `pf`); platformda modül kavramı yoktur. */
export function moduleOf(slug: string): string {
  const dash = slug.indexOf('-')
  return dash > 0 ? slug.slice(0, dash) : slug
}

export function groupPages(pages: CatalogPage[]): PageGroup[] {
  const groups = new Map<string, CatalogPage[]>()
  for (const page of pages) {
    const key = page.slug.includes('-') ? moduleOf(page.slug) : '—'
    groups.set(key, [...(groups.get(key) ?? []), page])
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, pages: list.sort((a, b) => a.slug.localeCompare(b.slug, 'tr')) }))
    .sort((a, b) => (a.key === '—' ? 1 : b.key === '—' ? -1 : a.key.localeCompare(b.key, 'tr')))
}
