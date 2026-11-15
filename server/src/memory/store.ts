import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  FINDING_KINDS,
  ISSUE_STATUSES,
  RULE_STATES,
  RULE_TYPES,
  type AppRef,
  type FindingKind,
  type IssueComment,
  type IssueHistoryEntry,
  type IssueStatus,
  type Rule,
  type RuleScope,
  type RuleState,
  type RuleType,
} from '@argus/shared'
import { ArgusError } from '../errors.ts'
import { asList, asString, parseDocument, serializeDocument } from './frontmatter.ts'
import { authorSlug, parseFindings, serializeFindings, type SharedFinding } from './shared.ts'

/**
 * Git'te paylaşılan hafıza. Dosya düzeni:
 *   platform/rules/<id>.md                      bütün Zeyrek uygulamalarına ortak kurallar
 *   formats/<ad>.md                             çıktı biçimleri
 *   apps/<proje>/<uygulama>/app.md              uygulama notları
 *   apps/<proje>/<uygulama>/rules/<id>.md       uygulamaya özel kurallar
 *   apps/<proje>/<uygulama>/decisions/<..>.md   sorun başına insan kararı, tarihçe, yorumlar
 *   apps/<proje>/<uygulama>/findings/<yazar>.md kişinin açık bulguları ve son görünümleri (tek yazarlı)
 *   apps/<proje>/<uygulama>/pages/<sayfa>/<yazar>.md  sayfa bilgisi (tek yazarlı, en yenisi kullanılır)
 *   apps/<proje>/<uygulama>/screens/<sayfa>/<yazar>.json  ekran haritası (tek yazarlı, birleşik okunur)
 *   apps/<proje>/<uygulama>/customer/<..>.md    içe aktarılan müşteri bulguları (isteme girmez)
 */

export interface DecisionRecord {
  key: string
  title: string
  kind: FindingKind
  status: IssueStatus
  updatedAt: string
  example: { page: string; scenario: string; expected: string; observed: string } | null
  history: IssueHistoryEntry[]
  comments: IssueComment[]
}

/** Sayfa bilgisi dosyası: gövde (isteme girer), yazar, güncelleme anı ve yazıldığı andaki sayfa izi. */
export interface PageKnowledgeFile {
  body: string
  author: string
  updatedAt: string
  print: { ui: string; api: string; studio: string | null } | null
}

export interface CustomerRow {
  ref: string
  module: string | null
  area: string | null
  text: string
  status: string | null
  note: string | null
}

export interface MemoryFile {
  path: string
  size: number
}

const RULE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/

export const isRuleId = (id: string) => RULE_ID.test(id)

export function isRuleScope(value: string): value is RuleScope {
  return value === 'platform' || value === 'uygulama' || /^modul:[\w-]+$/.test(value) || /^sayfa:[\w-]+$/.test(value)
}

const TR_MAP: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

export function slugify(value: string, max = 60): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (c) => TR_MAP[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

/** Sorun anahtarından dosya adı: okunur kısım + kısa özet (iki anahtar aynı ada düşmesin). */
export function decisionFileName(key: string): string {
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 6)
  return `${slugify(key.replace(/:/g, '-'), 50) || 'sorun'}-${hash}.md`
}

const oneLine = (text: string) => text.replace(/\r?\n/g, ' ').trim()

export class MemoryStore {
  constructor(readonly root: string) {}

  private abs(rel: string): string {
    const full = resolve(this.root, rel)
    if (full !== resolve(this.root) && !full.startsWith(resolve(this.root) + sep)) {
      throw new ArgusError('MEMORY_PATH', `Hafıza dışına çıkılamaz: ${rel}`)
    }
    return full
  }

  private appDir(app: AppRef): string {
    if (!/^[\w-]+$/.test(app.project) || !/^[\w-]+$/.test(app.application)) {
      throw new ArgusError('MEMORY_PATH', `Geçersiz uygulama adı: ${app.project}/${app.application}`)
    }
    return join('apps', app.project, app.application)
  }

  private read(rel: string): string | null {
    const full = this.abs(rel)
    return existsSync(full) ? readFileSync(full, 'utf8') : null
  }

  private write(rel: string, content: string): void {
    const full = this.abs(rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content.replace(/\r\n/g, '\n'))
  }

  private list(relDir: string): string[] {
    const full = this.abs(relDir)
    if (!existsSync(full)) return []
    return readdirSync(full)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => join(relDir, name))
  }

  // --- uygulamalar ---

  apps(): AppRef[] {
    const appsDir = this.abs('apps')
    if (!existsSync(appsDir)) return []
    return readdirSync(appsDir).flatMap((project) => {
      const projectDir = join(appsDir, project)
      if (!statSync(projectDir).isDirectory()) return []
      return readdirSync(projectDir)
        .filter((application) => statSync(join(projectDir, application)).isDirectory())
        .map((application) => ({ project, application }))
    })
  }

  // --- kurallar ---

  private parseRule(rel: string, app: AppRef | null): Rule | null {
    const text = this.read(rel)
    if (text === null) return null
    const { data, body } = parseDocument(text)
    const id = asString(data.id) || rel.split(/[\\/]/).pop()!.replace(/\.md$/, '')
    const scope = asString(data.kapsam, app ? 'uygulama' : 'platform')
    const type = asString(data.tur, 'sorun')
    const state = asString(data.durum, 'aday')
    if (!isRuleScope(scope) || !RULE_TYPES.includes(type as RuleType) || !RULE_STATES.includes(state as RuleState)) {
      throw new ArgusError('RULE_FORMAT', `${rel}: kapsam/tür/durum geçersiz (${scope} / ${type} / ${state}).`)
    }
    const pattern = asString(data.desen)
    return {
      id,
      scope: app ? scope : 'platform',
      type: type as RuleType,
      state: state as RuleState,
      text: body,
      ...(pattern ? { pattern } : {}),
      sources: asList(data.kaynak),
      author: asString(data.olusturan),
      date: asString(data.tarih),
      file: rel.split(sep).join('/'),
      app,
    }
  }

  /** Platform kuralları + (verildiyse) uygulamanın kuralları; bütün durumlar. Bozuk dosya atlanmaz, hata verir. */
  rules(app: AppRef | null): Rule[] {
    const platform = this.list(join('platform', 'rules')).flatMap((rel) => this.parseRule(rel, null) ?? [])
    if (!app) return platform
    const own = this.list(join(this.appDir(app), 'rules')).flatMap((rel) => this.parseRule(rel, app) ?? [])
    return [...platform, ...own]
  }

  rule(app: AppRef | null, id: string): Rule | null {
    return this.rules(app).find((r) => r.id === id) ?? null
  }

  writeRule(rule: Omit<Rule, 'file'>): Rule {
    if (!isRuleId(rule.id)) throw new ArgusError('RULE_FORMAT', `Kural kimliği geçersiz: ${rule.id} (küçük harf, rakam, tire).`)
    if (!isRuleScope(rule.scope)) throw new ArgusError('RULE_FORMAT', `Kapsam geçersiz: ${rule.scope}`)
    const dir = rule.scope === 'platform' || !rule.app ? join('platform', 'rules') : join(this.appDir(rule.app), 'rules')
    const rel = join(dir, `${rule.id}.md`)
    const data: Record<string, string | string[]> = {
      id: rule.id,
      kapsam: rule.scope,
      tur: rule.type,
      durum: rule.state,
    }
    if (rule.pattern) data.desen = rule.pattern
    data.kaynak = rule.sources
    data.olusturan = rule.author
    data.tarih = rule.date
    this.write(rel, serializeDocument({ data, body: rule.text }))
    return { ...rule, app: rule.scope === 'platform' ? null : rule.app, file: rel.split(sep).join('/') }
  }

  // --- kararlar ---

  private decisionRel(app: AppRef, key: string): string {
    return join(this.appDir(app), 'decisions', decisionFileName(key))
  }

  decision(app: AppRef, key: string): DecisionRecord | null {
    const rel = this.decisionRel(app, key)
    const text = this.read(rel)
    return text === null ? null : parseDecision(text, rel)
  }

  decisions(app: AppRef): DecisionRecord[] {
    return this.list(join(this.appDir(app), 'decisions')).flatMap((rel) => {
      const text = this.read(rel)
      return text === null ? [] : [parseDecision(text, rel)]
    })
  }

  writeDecision(app: AppRef, record: DecisionRecord): string {
    const rel = this.decisionRel(app, record.key)
    this.write(rel, serializeDecision(record))
    return rel.split(sep).join('/')
  }

  // --- uygulama notları, biçimler, müşteri ---

  appNotes(app: AppRef): string {
    const text = this.read(join(this.appDir(app), 'app.md'))
    return text === null ? '' : parseDocument(text).body
  }

  /**
   * Sayfa bilgisi: ajanın sayfa için damıttığı amaç, beklentiler, kapsam ve tuhaflıklar
   * (`apps/<p>/<u>/pages/<sayfa>/<yazar>.md`; kimin yazdığından bağımsız en yenisi). Sabit bütçelidir; koşu sonunda
   * yazarın kendi dosyasına baştan yazılır. Yoksa null.
   */
  pageKnowledge(app: AppRef, page: string): PageKnowledgeFile | null {
    const files = this.list(this.pageDir(app, page)).flatMap((rel) => {
      const text = this.read(rel)
      if (text === null) return []
      const { data, body } = parseDocument(text)
      return [
        {
          body,
          author: asString(data.yazar),
          updatedAt: asString(data.guncelleme),
          print: asString(data.iz_arayuz)
            ? { ui: asString(data.iz_arayuz), api: asString(data.iz_veri), studio: asString(data.iz_studio) || null }
            : null,
        },
      ]
    })
    // Her kişi kendi dosyasını yazar (çakışma olmaz); isteme en son yazılan girer.
    return files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  }

  writePageKnowledge(app: AppRef, page: string, author: string, content: string): string {
    const rel = join(this.pageDir(app, page), `${authorSlug(author)}.md`)
    this.write(rel, content)
    return rel.split(sep).join('/')
  }

  /** Ekran haritasının klasörü (`screens/<sayfa>/<yazar>.json`); `ScreenMemory` okur ve yazar. */
  screenDir(app: AppRef, page: string): string {
    return this.abs(join(this.appDir(app), 'screens', this.pageName(page)))
  }

  private pageDir(app: AppRef, page: string): string {
    return join(this.appDir(app), 'pages', this.pageName(page))
  }

  private pageName(page: string): string {
    if (!/^[\p{L}\p{N}_-]+$/u.test(page)) throw new ArgusError('MEMORY_PATH', `Geçersiz sayfa adı: ${page}`)
    return page
  }

  // --- paylaşılan bulgular (kişi başına dosya) ---

  /** Herkesin açık bulgu dosyası (`findings/<yazar>.md`); bozuk dosya atlanır. */
  sharedFindings(app: AppRef): Array<{ file: string; author: string; findings: SharedFinding[] }> {
    return this.list(join(this.appDir(app), 'findings')).flatMap((rel) => {
      const text = this.read(rel)
      if (text === null) return []
      const parsed = parseFindings(text)
      const file = rel.split(/[\\/]/).pop()!.replace(/\.md$/, '')
      return [{ file, author: parsed.author || file, findings: parsed.findings }]
    })
  }

  writeSharedFindings(app: AppRef, author: string, findings: SharedFinding[], at = new Date().toISOString()): string {
    const rel = join(this.appDir(app), 'findings', `${authorSlug(author)}.md`)
    this.write(rel, serializeFindings(author, at, findings))
    return rel.split(sep).join('/')
  }

  /** Uygulamanın kimlik bilgisi (`kimlik.md` ön bilgisi; ör. süper giriş uçları). İsteme girmez. Yoksa boş. */
  identity(app: AppRef): Record<string, string | string[]> {
    const text = this.read(join(this.appDir(app), 'kimlik.md'))
    return text === null ? {} : parseDocument(text).data
  }

  formats(): Array<{ name: string; content: string }> {
    return this.list('formats').map((rel) => ({
      name: rel.split(/[\\/]/).pop()!.replace(/\.md$/, ''),
      content: this.read(rel) ?? '',
    }))
  }

  writeCustomer(app: AppRef, source: string, rows: CustomerRow[]): string {
    const rel = join(this.appDir(app), 'customer', `${slugify(source.replace(/\.xlsx$/i, '')) || 'musteri'}.md`)
    const cell = (v: string | null) => (v ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim()
    const table = [
      '| Kaynak | Modül | Ekran | Bulgu | Durum | Geliştirici notu |',
      '|---|---|---|---|---|---|',
      ...rows.map((r) => `| ${cell(r.ref)} | ${cell(r.module)} | ${cell(r.area)} | ${cell(r.text)} | ${cell(r.status)} | ${cell(r.note)} |`),
    ].join('\n')
    this.write(rel, serializeDocument({ data: { kaynak: source, satir: String(rows.length), tarih: new Date().toISOString().slice(0, 10) }, body: table }))
    return rel.split(sep).join('/')
  }

  customerRows(app: AppRef): CustomerRow[] {
    return this.list(join(this.appDir(app), 'customer')).flatMap((rel) => {
      const body = parseDocument(this.read(rel) ?? '').body
      return body
        .split('\n')
        .slice(2)
        .flatMap((line) => {
          const cells = line.split('|').slice(1, -1).map((c) => c.trim())
          if (cells.length < 6 || !cells[3]) return []
          const v = (i: number) => (cells[i] ? cells[i]! : null)
          return [{ ref: cells[0]!, module: v(1), area: v(2), text: cells[3]!, status: v(4), note: v(5) }]
        })
    })
  }

  // --- düz dosya erişimi (arayüzdeki düzenleyici) ---

  files(): MemoryFile[] {
    const out: MemoryFile[] = []
    const walk = (rel: string) => {
      const full = this.abs(rel)
      if (!existsSync(full)) return
      for (const name of readdirSync(full).sort()) {
        const child = rel ? join(rel, name) : name
        const stat = statSync(this.abs(child))
        if (stat.isDirectory()) walk(child)
        else if (name.endsWith('.md')) out.push({ path: child.split(sep).join('/'), size: stat.size })
      }
    }
    walk('')
    return out
  }

  readFile(rel: string): string {
    const text = this.read(rel)
    if (text === null) throw new ArgusError('MEMORY_NOT_FOUND', `Dosya yok: ${rel}`)
    return text
  }

  /** Elle düzenlenen dosya: yalnız `.md`; kural ve karar dosyaları kaydedilmeden önce okunabilir mi denenir. */
  writeFile(rel: string, content: string): void {
    if (!rel.endsWith('.md')) throw new ArgusError('MEMORY_PATH', 'Yalnız .md dosyaları düzenlenebilir.')
    const parts = rel.split(/[\\/]/)
    if (parts.includes('rules')) {
      const app = parts[0] === 'apps' && parts.length >= 5 ? { project: parts[1]!, application: parts[2]! } : null
      const tmp = parseDocument(content)
      const scope = asString(tmp.data.kapsam, app ? 'uygulama' : 'platform')
      if (!isRuleScope(scope)) throw new ArgusError('RULE_FORMAT', `Kapsam geçersiz: ${scope}`)
      if (!RULE_TYPES.includes(asString(tmp.data.tur, 'sorun') as RuleType)) throw new ArgusError('RULE_FORMAT', 'tur: sorun | sorun-degil | bilgi')
      if (!RULE_STATES.includes(asString(tmp.data.durum, 'aday') as RuleState)) throw new ArgusError('RULE_FORMAT', 'durum: aday | onayli | emekli')
    }
    if (parts.includes('decisions')) parseDecision(content, rel)
    this.write(rel, content)
  }

  relative(full: string): string {
    return relative(this.root, full).split(sep).join('/')
  }
}

// --- karar dosyası biçimi ---

const HISTORY_LINE = /^- (\S+) · (.+?) · (\S+|—) → (\S+)(?: · (.*))?$/
const COMMENT_LINE = /^- (\S+) · ([^:]+): (.*)$/

/**
 * Karar dosyasını birden çok insan yazar; `memory/.gitattributes` onu Git'in union sürücüsüyle birleştirir, çakışma
 * çıkmaz. Eşzamanlı iki yazımdan sonra ön bilgide iki `durum`/`guncelleme` satırı kalabilir: güncelleme en yenisi,
 * durum tarihçenin en son geçişidir. Tarihçe ve yorumlar zaman sırasına dizilir; sonraki yazım dosyayı yeniden düzenler.
 */
export function parseDecision(text: string, source: string): DecisionRecord {
  const { data, body } = parseDocument(text)
  const key = asString(data.anahtar)
  if (!key) throw new ArgusError('DECISION_FORMAT', `${source}: anahtar yok.`)
  const front = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? ''
  const values = (name: string) =>
    [...front.matchAll(new RegExp(`^${name}:\\s*(.+)$`, 'gm'))].map((m) => m[1]!.trim().replace(/^["']|["']$/g, ''))
  let status = asString(data.durum, 'acik') as IssueStatus
  if (!ISSUE_STATUSES.includes(status)) throw new ArgusError('DECISION_FORMAT', `${source}: durum geçersiz (${status}).`)
  const kind = asString(data.tur, 'kesin') as FindingKind
  const sections = new Map<string, string[]>()
  let current = ''
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      current = heading[1]!.trim().toLocaleLowerCase('tr')
      sections.set(current, [])
    } else if (current) sections.get(current)!.push(line)
  }
  const exampleLines = sections.get('örnek') ?? []
  const field = (label: string) =>
    exampleLines.find((l) => l.startsWith(`${label}:`))?.slice(label.length + 1).trim() ?? ''
  const example = exampleLines.length
    ? { page: field('Sayfa'), scenario: field('Senaryo'), expected: field('Beklenen'), observed: field('Gözlenen') }
    : null
  const history: IssueHistoryEntry[] = (sections.get('tarihçe') ?? []).flatMap((line) => {
    const m = HISTORY_LINE.exec(line.trim())
    if (!m) return []
    return [{ at: m[1]!, author: m[2]!, from: m[3] === '—' ? null : (m[3] as IssueStatus), to: m[4] as IssueStatus, note: m[5] ?? null }]
  })
  const comments: IssueComment[] = []
  for (const line of sections.get('yorumlar') ?? []) {
    const m = COMMENT_LINE.exec(line.trim())
    if (m) comments.push({ at: m[1]!, author: m[2]!.trim(), text: m[3]! })
    else if (line.startsWith('  ') && comments.length) comments[comments.length - 1]!.text += `\n${line.trim()}`
  }
  history.sort((a, b) => a.at.localeCompare(b.at))
  comments.sort((a, b) => a.at.localeCompare(b.at))
  if (new Set(values('durum')).size > 1 && history.length) status = history.at(-1)!.to
  return {
    key,
    title: asString(data.baslik, key),
    kind: FINDING_KINDS.includes(kind) ? kind : 'kesin',
    status,
    updatedAt: values('guncelleme').sort().at(-1) ?? '',
    example,
    history,
    comments,
  }
}

export function serializeDecision(record: DecisionRecord): string {
  const sections: string[] = []
  if (record.example) {
    sections.push(
      [
        '## Örnek',
        `Sayfa: ${oneLine(record.example.page)}`,
        `Senaryo: ${oneLine(record.example.scenario)}`,
        `Beklenen: ${oneLine(record.example.expected)}`,
        `Gözlenen: ${oneLine(record.example.observed)}`,
      ].join('\n'),
    )
  }
  sections.push(
    ['## Tarihçe', ...record.history.map((h) => `- ${h.at} · ${oneLine(h.author)} · ${h.from ?? '—'} → ${h.to}${h.note ? ` · ${oneLine(h.note)}` : ''}`)].join('\n'),
  )
  sections.push(
    ['## Yorumlar', ...record.comments.map((c) => `- ${c.at} · ${oneLine(c.author).replace(/:/g, '')}: ${c.text.split(/\r?\n/).join('\n  ')}`)].join('\n'),
  )
  return serializeDocument({
    data: { anahtar: record.key, baslik: record.title, tur: record.kind, durum: record.status, guncelleme: record.updatedAt },
    body: sections.join('\n\n'),
  })
}
