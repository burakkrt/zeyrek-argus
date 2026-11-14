/**
 * Sunucu ile arayüzün ortak dili. Değerler Türkçe (arayüzde ve hafıza dosyalarında görünür), adlar İngilizce.
 */

/** Kanıt türü: kesin (görüldü, tekrar üretildi), tutarsızlık (neyle çeliştiği yazılı), not (bulgu sayılmaz). */
export const FINDING_KINDS = ['kesin', 'tutarsizlik', 'not'] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

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
}

/**
 * Modelin işi: planlayıcı görev çıkarır, gezgin ekranı gezer, göz ulaşılan ekranı inceler, yargıç gezginin adayını
 * denetler, öğretmen ders çıkarır.
 */
export const MODEL_ROLES = ['planner', 'explorer', 'inspector', 'judge', 'teacher'] as const
export type ModelRole = (typeof MODEL_ROLES)[number]
export const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  planner: 'Planlayıcı',
  explorer: 'Gezgin',
  inspector: 'Göz',
  judge: 'Yargıç',
  teacher: 'Öğretmen',
}

export const RUN_STATUSES = ['sirada', 'calisiyor', 'bitti', 'hata', 'durduruldu'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export interface RunOptions {
  /** Sayfa başına en çok görev. */
  maxTasks: number
  /** Görev başına en çok adım. */
  maxSteps: number
  /** Koşunun kimliği: uygulama hesabının kullanıcı adı; boşsa varsayılan hesap (yoksa platform jetonu). */
  user?: string | null
  /** Kullanıcının talimatı: neye odaklanılsın, nerede sorun var (planlayıcı ve gezgin okur). */
  brief?: string | null
  /** Talimata eklenen görsellerin kimlikleri (`data/ekler/`); planlayıcı görür. */
  attachments?: string[]
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
export type RunEventBody =
  | { type: 'kosu-basladi'; pages: string[] }
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
      tool: string
      reason: string | null
      outcome: string
      /** Monitör karesi (yalnız diske; modele gitmez). Etkileşimde işlemden önce, diğerlerinde sonra alınır. */
      shot: string | null
      target: StepTarget | null
      /** İşlemin yapıldığı an (epoch ms): kayıttan izlemede imleç bu ana varır, tıklama halkası burada çıkar. */
      actAt?: number
      /** Adımda açılan tarayıcı penceresinin metni (onay, uyarı); kontrolcü iptal etti. */
      dialog?: string
    }
  | { type: 'ag'; requests: NetworkEntry[] }
  | {
      type: 'bulgu'
      issueId: string
      occurrenceId: string
      key: string
      title: string
      kind: FindingKind
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
  status: IssueStatus
  source: 'goz' | 'yz'
  firstSeen: string
  lastSeen: string
  seenCount: number
  pages: string[]
  lastShot: string | null
}

export interface IssueDetail extends Issue {
  occurrences: Occurrence[]
  comments: IssueComment[]
  history: IssueHistoryEntry[]
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

export interface Settings {
  /**
   * Rol başına model. Ucuz model son kararı vermez: gezginin bildirdiğini yargıç onaylar, ekranın içeriğini göz
   * (Opus) inceler.
   */
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
  defaultOptions: RunOptions
  author: string
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
