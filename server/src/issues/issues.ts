import type {
  AppRef,
  Box,
  FindingKind,
  Issue,
  IssueDetail,
  IssueStatus,
  Occurrence,
  OccurrenceOutcome,
  SharedSighting,
} from '@argus/shared'
import { DEFINITION_PAGE } from '@argus/shared'
import { ArgusError } from '../errors.ts'
import { json, newId, now, transaction, type Database } from '../db/database.ts'
import { authorSlug, type SharedFinding } from '../memory/shared.ts'
import type { DecisionRecord, MemoryStore } from '../memory/store.ts'

export interface OccurrenceInput {
  app: AppRef
  runId: string
  page: string
  /** Açılışta (sayfa yüklenince) mı, görev sırasında (etkileşimle) mı görüldü. */
  phase: 'acilis' | 'gorev'
  key: string
  title: string
  kind: FindingKind
  source: 'goz' | 'yz'
  scenario: string
  expected: string
  observed: string
  quote: string | null
  shot: string | null
  box: Box | null
  rules: string[]
  verified: boolean
  /** "Sorun sayma" kuralı gereği kayda alınıp bastırılan görünüm. */
  suppressedByRule: string | null
}

export interface RecordResult {
  issue: Issue
  occurrence: Occurrence
  outcome: OccurrenceOutcome
  reason: string | null
  /** Aynı koşuda aynı sayfada zaten görünümü vardı: yeni görünüm yazılmadı, akışa yeniden düşmez. */
  duplicate?: boolean
}

interface IssueRow {
  id: string
  project: string
  application: string
  key: string
  title: string
  kind: FindingKind
  status: IssueStatus
  source: 'goz' | 'yz'
  suppressed_by: string | null
  first_seen: string
  last_seen: string
  seen_count: number
  last_shot: string | null
}

const KIND_RANK: Record<FindingKind, number> = { not: 0, tutarsizlik: 1, kesin: 2 }

export interface IssueFilter {
  app?: AppRef
  statuses?: IssueStatus[]
  kinds?: FindingKind[]
  query?: string
  runId?: string
  includeSuppressed?: boolean
}

/**
 * Sorunlar kök nedene göre tek kayıttır (uygulama + anahtar); her görüldüğü yer bir görünümdür. Paylaşım:
 * - İnsanın kararı ve yorumu Git'teki karar dosyasına yazılır; Argus'un kendi verdiği durumlar (düzeldi, yeniden
 *   açıldı) bu makinenin gözlemidir, dosyaya yazılmaz (iki makine aynı dosyayı değiştirmesin).
 * - Açık kesin/tutarsızlık bulguları kişinin kendi `findings/<yazar>.md` dosyasına son görünümüyle yazılır; takım
 *   arkadaşlarınınki eşitlemede "başka makinelerde görüldü" olarak alınır (görüntüsü yok, alıntısı var).
 */
export class IssueService {
  constructor(
    private readonly db: Database,
    private readonly memory: MemoryStore,
  ) {}

  private pages(issueId: string): string[] {
    const local = (
      this.db.prepare('select distinct page from occurrences where issue_id = ?').all(issueId) as Array<{
        page: string
      }>
    ).map((r) => r.page)
    const shared = (
      this.db.prepare('select pages from shared_sightings where issue_id = ?').all(issueId) as Array<{
        pages: string
      }>
    ).flatMap((r) => json<string[]>(r.pages, []))
    return [...new Set([...local, ...shared])].sort()
  }

  private toIssue(row: IssueRow): Issue {
    return {
      id: row.id,
      project: row.project,
      application: row.application,
      key: row.key,
      title: row.title,
      kind: row.kind,
      status: row.status,
      source: row.source,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      seenCount: row.seen_count,
      pages: this.pages(row.id),
      lastShot: row.last_shot,
    }
  }

  private row(id: string): IssueRow {
    const row = this.db.prepare('select * from issues where id = ?').get(id) as IssueRow | undefined
    if (!row) throw new ArgusError('ISSUE_NOT_FOUND', 'Sorun bulunamadı.')
    return row
  }

  private byKey(app: AppRef, key: string): IssueRow | undefined {
    return this.db
      .prepare('select * from issues where project = ? and application = ? and key = ?')
      .get(app.project, app.application, key) as IssueRow | undefined
  }

  record(input: OccurrenceInput): RecordResult {
    return transaction(this.db, () => {
      const at = now()
      let row = this.byKey(input.app, input.key)
      let outcome: OccurrenceOutcome
      let reason: string | null = null
      const kind: FindingKind = input.verified ? input.kind : 'not'
      if (!row) {
        const id = newId()
        this.db
          .prepare(
            `insert into issues (id, project, application, key, title, kind, status, source, suppressed_by, first_seen, last_seen, seen_count)
             values (?, ?, ?, ?, ?, ?, 'acik', ?, ?, ?, ?, 0)`,
          )
          .run(
            id,
            input.app.project,
            input.app.application,
            input.key,
            input.title,
            kind,
            input.source,
            input.suppressedByRule,
            at,
            at,
          )
        row = this.row(id)
        outcome = 'yeni'
      } else if (row.status === 'bulgu-degil') {
        outcome = 'bastirildi'
        reason = 'İnsan kararı: bulgu değil'
      } else if (row.status === 'duzeldi') {
        this.setStatus(row, 'acik', 'Argus', 'Düzeldi denmişti, yeniden görüldü.', input.app)
        outcome = 'yeniden-acildi'
        reason = 'Düzeldi denmişti, yeniden görüldü'
      } else {
        outcome = 'tekrar'
      }
      if (input.suppressedByRule && outcome !== 'bastirildi') {
        outcome = 'bastirildi'
        reason = `Kural gereği: ${input.suppressedByRule}`
        this.db
          .prepare('update issues set suppressed_by = ? where id = ?')
          .run(input.suppressedByRule, row.id)
      }
      if (!input.verified && outcome !== 'bastirildi') {
        outcome = 'dogrulanamadi'
        reason = 'Alıntı ekranda bulunamadı; not olarak kaydedildi'
      }
      // Koşu içinde aynı sayfada ikinci kez bildirilen sorun yeni görünüm değildir (göz ve yargıç bilinen sorunu yeniden
      // bildiriyordu: aynı sorun koşuda 3 kez listelendi).
      if (outcome === 'tekrar' || outcome === 'dogrulanamadi') {
        const existing = this.db
          .prepare('select id from occurrences where issue_id = ? and run_id = ? and page = ? limit 1')
          .get(row.id, input.runId, input.page) as { id: string } | undefined
        const seen = existing ? this.detail(row.id).occurrences.find((o) => o.id === existing.id) : undefined
        if (seen)
          return {
            issue: this.toIssue(row),
            occurrence: seen,
            outcome: seen.outcome,
            reason: null,
            duplicate: true,
          }
      }
      const occurrence: Occurrence = {
        id: newId(),
        issueId: row.id,
        runId: input.runId,
        page: input.page,
        kind,
        outcome,
        scenario: input.scenario,
        expected: input.expected,
        observed: input.observed,
        quote: input.quote,
        shot: input.shot,
        box: input.box,
        reason,
        rules: input.rules,
        at,
      }
      this.db
        .prepare(
          `insert into occurrences (id, issue_id, run_id, page, phase, kind, outcome, scenario, expected, observed, quote, shot, box, reason, rules, at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          occurrence.id,
          row.id,
          input.runId,
          input.page,
          input.phase,
          kind,
          outcome,
          input.scenario,
          input.expected,
          input.observed,
          input.quote,
          input.shot,
          input.box ? JSON.stringify(input.box) : null,
          reason,
          JSON.stringify(input.rules),
          at,
        )
      const upgrade = KIND_RANK[kind] > KIND_RANK[row.kind] ? kind : row.kind
      this.db
        .prepare(
          `update issues set last_seen = ?, seen_count = seen_count + 1, kind = ?,
             last_shot = case when ? is not null and ? <> 'bastirildi' then ? else last_shot end where id = ?`,
        )
        .run(at, upgrade, input.shot, outcome, input.shot, row.id)
      return { issue: this.toIssue(this.row(row.id)), occurrence, outcome, reason }
    })
  }

  list(filter: IssueFilter = {}): Issue[] {
    const where: string[] = []
    const args: Array<string | number> = []
    if (filter.app) {
      where.push('project = ? and application = ?')
      args.push(filter.app.project, filter.app.application)
    }
    if (filter.statuses?.length) {
      where.push(`status in (${filter.statuses.map(() => '?').join(',')})`)
      args.push(...filter.statuses)
    }
    if (filter.kinds?.length) {
      where.push(`kind in (${filter.kinds.map(() => '?').join(',')})`)
      args.push(...filter.kinds)
    }
    if (!filter.includeSuppressed) where.push('suppressed_by is null')
    if (filter.query) {
      where.push('(title like ? or key like ?)')
      args.push(`%${filter.query}%`, `%${filter.query}%`)
    }
    if (filter.runId) {
      where.push('id in (select issue_id from occurrences where run_id = ?)')
      args.push(filter.runId)
    }
    const sql = `select * from issues ${where.length ? `where ${where.join(' and ')}` : ''} order by last_seen desc limit 500`
    return (this.db.prepare(sql).all(...args) as unknown as IssueRow[]).map((r) => this.toIssue(r))
  }

  detail(id: string): IssueDetail {
    const row = this.row(id)
    const occurrences = (
      this.db
        .prepare('select * from occurrences where issue_id = ? order by at desc limit 200')
        .all(id) as Array<Record<string, unknown>>
    ).map((o): Occurrence => ({
      id: o.id as string,
      issueId: id,
      runId: o.run_id as string,
      page: o.page as string,
      kind: o.kind as FindingKind,
      outcome: o.outcome as OccurrenceOutcome,
      scenario: o.scenario as string,
      expected: o.expected as string,
      observed: o.observed as string,
      quote: (o.quote as string | null) ?? null,
      shot: (o.shot as string | null) ?? null,
      box: json<Box | null>(o.box as string | null, null),
      reason: (o.reason as string | null) ?? null,
      rules: json<string[]>(o.rules as string, []),
      at: o.at as string,
    }))
    const comments = this.db
      .prepare('select author, text, at from comments where issue_id = ? order by at')
      .all(id) as Array<{
      author: string
      text: string
      at: string
    }>
    const history = (
      this.db
        .prepare(
          'select from_status, to_status, author, note, at from history where issue_id = ? order by at',
        )
        .all(id) as Array<{
        from_status: IssueStatus | null
        to_status: IssueStatus
        author: string
        note: string | null
        at: string
      }>
    ).map((h) => ({ from: h.from_status, to: h.to_status, author: h.author, note: h.note, at: h.at }))
    const elsewhere = (
      this.db
        .prepare(
          'select author, page, scenario, expected, observed, quote, last_seen, seen_count from shared_sightings where issue_id = ? order by last_seen desc',
        )
        .all(id) as Array<Record<string, unknown>>
    ).map((s): SharedSighting => ({
      author: s.author as string,
      page: s.page as string,
      scenario: s.scenario as string,
      expected: s.expected as string,
      observed: s.observed as string,
      quote: (s.quote as string | null) ?? null,
      lastSeen: s.last_seen as string,
      seenCount: s.seen_count as number,
    }))
    return { ...this.toIssue(row), occurrences, comments, history, elsewhere }
  }

  private record_(row: IssueRow): DecisionRecord {
    const detail = this.detail(row.id)
    const sample = detail.occurrences.find((o) => o.outcome !== 'dogrulanamadi') ?? detail.occurrences[0]
    return {
      key: row.key,
      title: row.title,
      kind: row.kind,
      status: row.status,
      updatedAt: now(),
      example: sample
        ? {
            page: sample.page,
            scenario: sample.scenario,
            expected: sample.expected,
            observed: sample.observed,
          }
        : null,
      history: detail.history,
      comments: detail.comments,
    }
  }

  private writeFile(row: IssueRow): void {
    this.memory.writeDecision(
      { project: row.project, application: row.application },
      this.record_(this.row(row.id)),
    )
  }

  private setStatus(
    row: IssueRow,
    status: IssueStatus,
    author: string,
    note: string | null,
    _app: AppRef,
  ): void {
    this.db.prepare('update issues set status = ? where id = ?').run(status, row.id)
    this.db
      .prepare(
        'insert into history (issue_id, from_status, to_status, author, note, at) values (?, ?, ?, ?, ?, ?)',
      )
      .run(row.id, row.status, status, author, note, now())
    // Argus'un kendi gözlemi (düzeldi, yeniden açıldı) bu makinede kalır; paylaşılan dosyaya yalnız insan yazar.
    if (author !== 'Argus') this.writeFile(this.row(row.id))
  }

  decide(id: string, status: IssueStatus, author: string, note: string | null): IssueDetail {
    const row = this.row(id)
    transaction(this.db, () => {
      if (note)
        this.db
          .prepare('insert into comments (issue_id, author, text, at) values (?, ?, ?, ?)')
          .run(id, author, note, now())
      if (row.status !== status)
        this.setStatus(row, status, author, note, { project: row.project, application: row.application })
      else this.writeFile(row)
    })
    return this.detail(id)
  }

  /** Kontrolcü yanlış bildirdiğini anlayıp geri aldı: bu koşu ve sayfadaki görünümler silinir; sorun yalnız bunlardan ibaretse o da. */
  retract(app: AppRef, runId: string, page: string, key: string): boolean {
    const row = this.byKey(app, key)
    if (!row) return false
    return transaction(this.db, () => {
      const removed = Number(
        this.db
          .prepare('delete from occurrences where issue_id = ? and run_id = ? and page = ?')
          .run(row.id, runId, page).changes,
      )
      if (!removed) return false
      const left = (
        this.db.prepare('select count(*) as n from occurrences where issue_id = ?').get(row.id) as {
          n: number
        }
      ).n
      const decided = (
        this.db.prepare('select count(*) as n from history where issue_id = ?').get(row.id) as { n: number }
      ).n
      const shared = (
        this.db.prepare('select count(*) as n from shared_sightings where issue_id = ?').get(row.id) as {
          n: number
        }
      ).n
      if (left === 0 && decided === 0 && shared === 0)
        this.db.prepare('delete from issues where id = ?').run(row.id)
      else
        this.db
          .prepare('update issues set seen_count = max(0, seen_count - ?) where id = ?')
          .run(removed, row.id)
      return true
    })
  }

  comment(id: string, author: string, text: string): IssueDetail {
    const row = this.row(id)
    this.db
      .prepare('insert into comments (issue_id, author, text, at) values (?, ?, ?, ?)')
      .run(id, author, text, now())
    this.writeFile(row)
    return this.detail(id)
  }

  /** Kontrolcü açık bir sorunun artık görünmediğini doğruladı. İnsan isterse yeniden açar. */
  markFixed(app: AppRef, key: string, note: string): boolean {
    const row = this.byKey(app, key)
    if (!row || (row.status !== 'acik' && row.status !== 'duzeltilecek')) return false
    this.setStatus(row, 'duzeldi', 'Argus', note, app)
    return true
  }

  /**
   * Göz sorunlarının otomatik kapanışı: daha önce bu sayfada açılışta görülen bir göz sorunu açılış taramasında
   * artık yoksa düzelmiştir (aynı belirlenimci denetim, aynı koşul). Etkileşimle görülenler kapatılmaz.
   */
  closeVanishedEyeIssues(app: AppRef, page: string, foundKeys: Set<string>): string[] {
    const rows = this.db
      .prepare(
        `select distinct i.* from issues i join occurrences o on o.issue_id = i.id
         where i.project = ? and i.application = ? and i.source = 'goz' and i.status in ('acik', 'duzeltilecek')
           and o.page = ? and o.phase = 'acilis'`,
      )
      .all(app.project, app.application, page) as unknown as IssueRow[]
    const closed: string[] = []
    for (const row of rows) {
      if (foundKeys.has(row.key)) continue
      this.setStatus(row, 'duzeldi', 'Argus', `${page} açılışında artık görünmüyor.`, app)
      closed.push(row.key)
    }
    return closed
  }

  /** Bu sayfada daha önce görülmüş, hâlâ açık sorunlar (kontrolcü yeniden bakar). */
  openOnPage(app: AppRef, page: string): Issue[] {
    // Takım arkadaşının bu sayfada gördüğü açık sorun da dahildir: alıntısı ekrandaysa model çağrılmadan doğrulanır.
    const rows = this.db
      .prepare(
        `select * from issues i
         where i.project = ? and i.application = ? and i.status in ('acik', 'duzeltilecek') and i.suppressed_by is null
           and (exists (select 1 from occurrences o where o.issue_id = i.id and o.page = ?)
             or exists (select 1 from shared_sightings s where s.issue_id = i.id and (s.page = ? or s.pages like ?)))
         order by i.last_seen desc limit 20`,
      )
      .all(app.project, app.application, page, page, `%"${page}"%`) as unknown as IssueRow[]
    return rows.map((r) => this.toIssue(r))
  }

  /** Koşuda bu sayfada görünümü kaydedilmiş sorunlar, anahtar → başlık (sayfa aynı koşuda yeniden açılabilir). */
  recordedInRun(runId: string, page: string): Map<string, string> {
    const rows = this.db
      .prepare(
        `select distinct i.key, i.title from occurrences o join issues i on i.id = o.issue_id where o.run_id = ? and o.page = ?`,
      )
      .all(runId, page) as Array<{ key: string; title: string }>
    return new Map(rows.map((r) => [r.key, r.title]))
  }

  /** Sorunun bu sayfadaki son doğrulanmış görünümü: alıntısı ekranda hâlâ varsa model çağırmadan doğrulanır. */
  lastSighting(
    issueId: string,
    page: string,
  ): { quote: string; scenario: string; expected: string; observed: string } | null {
    const row = this.db
      .prepare(
        `select quote, scenario, expected, observed from occurrences
         where issue_id = ? and page = ? and quote is not null and quote <> '' and outcome <> 'dogrulanamadi'
         order by at desc limit 1`,
      )
      .get(issueId, page) as
      { quote: string; scenario: string; expected: string; observed: string } | undefined
    if (row) return row
    const shared = this.db
      .prepare(
        `select quote, scenario, expected, observed from shared_sightings
         where issue_id = ? and page = ? and quote is not null and quote <> '' order by last_seen desc limit 1`,
      )
      .get(issueId, page) as
      { quote: string; scenario: string; expected: string; observed: string } | undefined
    return shared ?? null
  }

  /**
   * Modülde bilinen sorun anahtarları (tanım bulguları dahil): aynı sorun başka sayfada ya da ekranda görülürse aynı
   * anahtarla bildirilsin.
   */
  knownInModule(
    app: AppRef,
    modulePrefix: string,
    limit = 25,
  ): Array<Pick<Issue, 'key' | 'title' | 'status'>> {
    return this.db
      .prepare(
        `select i.key, i.title, i.status from issues i
         where i.project = ? and i.application = ? and i.source = 'yz'
           and (exists (select 1 from occurrences o where o.issue_id = i.id and (o.page = ? or o.page like ? or o.page = ?))
             or exists (select 1 from shared_sightings s where s.issue_id = i.id and (s.page = ? or s.page like ?)))
         order by i.last_seen desc limit ?`,
      )
      .all(
        app.project,
        app.application,
        modulePrefix,
        `${modulePrefix}-%`,
        DEFINITION_PAGE,
        modulePrefix,
        `${modulePrefix}-%`,
        limit,
      ) as Array<Pick<Issue, 'key' | 'title' | 'status'>>
  }

  /** "Bulgu değil" denmiş sorunlar: kontrolcü bunları yeniden getirmesin. */
  rejected(app: AppRef, limit = 30): Array<Pick<Issue, 'key' | 'title'>> {
    return this.db
      .prepare(
        `select key, title from issues where project = ? and application = ? and status = 'bulgu-degil' order by last_seen desc limit ?`,
      )
      .all(app.project, app.application, limit) as Array<Pick<Issue, 'key' | 'title'>>
  }

  /** Kural emekliye ayrılınca, o kural gereği bastırılan sorunlar yeniden görünür olur. */
  releaseRule(ruleId: string): number {
    return Number(
      this.db.prepare('update issues set suppressed_by = null where suppressed_by = ?').run(ruleId).changes,
    )
  }

  /**
   * Git'ten gelenleri yerel aynaya işler (pull sonrası, koşu başında):
   * - Karar dosyaları: tarihçe ve yorumlar yerelle birleştirilir (hiçbir taraf silinmez; Git'in union birleştirmesi
   *   iki kişinin satırlarını aynı dosyada bırakır). Dosya bu makinedeki son değişiklikten yeniyse durumu o belirler;
   *   değilse birleşik tarihçenin son geçişi (Argus'un bu makinedeki daha yeni gözlemi ezilmez). Bu makinede hiç
   *   görülmemiş sorun için de kayıt açılır ki karar uygulanabilsin.
   * - Takım arkadaşlarının bulgu dosyaları (`me` hariç): "başka makinelerde görüldü" olarak yeniden yüklenir. Artık
   *   hiçbir yerde görülmeyen, kararsız ve yorumsuz uzak kayıt silinir (arkadaş düzeldiğini gördüyse burada da kalmaz).
   * Dönen sayı işlenen karar dosyası sayısıdır.
   */
  syncFromMemory(app: AppRef, me: string): number {
    const records = this.memory.decisions(app)
    const others = this.memory.sharedFindings(app).filter((f) => f.file !== authorSlug(me))
    transaction(this.db, () => {
      for (const record of records) {
        let row = this.byKey(app, record.key)
        if (!row)
          row = this.insertRemote(
            app,
            record.key,
            record.title,
            record.kind,
            record.updatedAt || now(),
            record.status,
          )
        const local = this.db
          .prepare(
            'select max(at) as at from (select at from history where issue_id = ? union all select at from comments where issue_id = ?)',
          )
          .get(row.id, row.id) as { at: string | null }
        for (const c of record.comments)
          this.db
            .prepare(
              `insert into comments (issue_id, author, text, at) select ?, ?, ?, ?
               where not exists (select 1 from comments where issue_id = ? and at = ? and author = ? and text = ?)`,
            )
            .run(row.id, c.author, c.text, c.at, row.id, c.at, c.author, c.text)
        for (const h of record.history)
          this.db
            .prepare(
              `insert into history (issue_id, from_status, to_status, author, note, at) select ?, ?, ?, ?, ?, ?
               where not exists (select 1 from history where issue_id = ? and at = ? and author = ? and to_status = ?)`,
            )
            .run(row.id, h.from, h.to, h.author, h.note, h.at, row.id, h.at, h.author, h.to)
        // Dosya yeniyse durumu o belirler (elle düzenleme dahil); değilse birleşik tarihçenin son geçişi.
        const last = this.db
          .prepare('select to_status from history where issue_id = ? order by at desc limit 1')
          .get(row.id) as { to_status: IssueStatus } | undefined
        const status =
          !local.at || record.updatedAt > local.at ? record.status : (last?.to_status ?? record.status)
        this.db
          .prepare('update issues set status = ?, title = ? where id = ?')
          .run(status, record.title, row.id)
      }
      this.db
        .prepare(
          'delete from shared_sightings where issue_id in (select id from issues where project = ? and application = ?)',
        )
        .run(app.project, app.application)
      for (const file of others)
        for (const f of file.findings) {
          const row =
            this.byKey(app, f.key) ??
            this.insertRemote(app, f.key, f.title, f.kind, f.lastSeen || now(), 'acik')
          this.db
            .prepare(
              `insert or replace into shared_sightings (issue_id, author, pages, page, scenario, expected, observed, quote, first_seen, last_seen, seen_count)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              row.id,
              file.author,
              JSON.stringify(f.pages),
              f.page,
              f.scenario,
              f.expected,
              f.observed,
              f.quote,
              f.firstSeen || f.lastSeen,
              f.lastSeen,
              f.seenCount,
            )
        }
      this.db
        .prepare(
          `delete from issues where project = ? and application = ?
             and not exists (select 1 from occurrences o where o.issue_id = issues.id)
             and not exists (select 1 from shared_sightings s where s.issue_id = issues.id)
             and not exists (select 1 from history h where h.issue_id = issues.id)
             and not exists (select 1 from comments c where c.issue_id = issues.id)`,
        )
        .run(app.project, app.application)
    })
    return records.length
  }

  /** Git'ten gelen (bu makinede görülmemiş) sorun için yerel kayıt. */
  private insertRemote(
    app: AppRef,
    key: string,
    title: string,
    kind: FindingKind,
    at: string,
    status: IssueStatus,
  ): IssueRow {
    const id = newId()
    this.db
      .prepare(
        `insert into issues (id, project, application, key, title, kind, status, source, first_seen, last_seen, seen_count)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        id,
        app.project,
        app.application,
        key,
        title,
        kind,
        status,
        key.startsWith('goz:') ? 'goz' : 'yz',
        at,
        at,
      )
    return this.row(id)
  }

  /**
   * Bu makinenin paylaşılacak bulguları: burada görülmüş, açık (açık / düzeltilecek), bastırılmamış kesin ve tutarsızlık
   * bulguları ile son görünümleri (doğrulanmış görünüm öncelikli). "Not"lar paylaşılmaz (bulgu sayılmaz, takımı
   * gürültüye boğmasın). En yeni 300 sorun.
   */
  ownFindings(app: AppRef): SharedFinding[] {
    const rows = this.db
      .prepare(
        `select * from issues i where i.project = ? and i.application = ? and i.status in ('acik', 'duzeltilecek')
           and i.suppressed_by is null and i.kind in ('kesin', 'tutarsizlik')
           and exists (select 1 from occurrences o where o.issue_id = i.id)
         order by i.last_seen desc limit 300`,
      )
      .all(app.project, app.application) as unknown as IssueRow[]
    return rows.map((row) => {
      const sample = this.db
        .prepare(
          `select page, scenario, expected, observed, quote from occurrences where issue_id = ?
           order by (outcome = 'dogrulanamadi'), at desc limit 1`,
        )
        .get(row.id) as {
        page: string
        scenario: string
        expected: string
        observed: string
        quote: string | null
      }
      const pages = (
        this.db
          .prepare('select distinct page from occurrences where issue_id = ? order by page')
          .all(row.id) as Array<{
          page: string
        }>
      ).map((r) => r.page)
      return {
        key: row.key,
        title: row.title,
        kind: row.kind,
        pages,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        seenCount: row.seen_count,
        page: sample.page,
        scenario: sample.scenario,
        expected: sample.expected,
        observed: sample.observed,
        quote: sample.quote,
      }
    })
  }

  /** Ders çıkarıcı için: son öğrenmeden bu yana insanın verdiği kararlar (yorumlarıyla). */
  decisionsSince(
    app: AppRef,
    since: string | null,
  ): Array<{ key: string; title: string; status: IssueStatus; note: string; example: string }> {
    const rows = this.db
      .prepare(
        `select i.id, i.key, i.title, i.status from issues i
         where i.project = ? and i.application = ? and i.status <> 'acik'
           and exists (select 1 from history h where h.issue_id = i.id and h.author <> 'Argus' and (? is null or h.at > ?))`,
      )
      .all(app.project, app.application, since, since) as Array<{
      id: string
      key: string
      title: string
      status: IssueStatus
    }>
    return rows.map((r) => {
      const notes = (
        this.db.prepare('select text from comments where issue_id = ? order by at').all(r.id) as Array<{
          text: string
        }>
      ).map((c) => c.text)
      const sample = this.db
        .prepare(
          `select page, observed from occurrences where issue_id = ? and outcome <> 'dogrulanamadi' order by at desc limit 1`,
        )
        .get(r.id) as { page: string; observed: string } | undefined
      return {
        key: r.key,
        title: r.title,
        status: r.status,
        note: notes.join(' | '),
        example: sample ? `${sample.page}: ${sample.observed}` : '',
      }
    })
  }
}
