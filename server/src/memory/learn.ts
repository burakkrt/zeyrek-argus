import { RULE_TYPES, type AppRef, type Proposal, type Rule, type RuleType, type Settings } from '@argus/shared'
import { now, type Database } from '../db/database.ts'
import { ArgusError } from '../errors.ts'
import type { IssueService } from '../issues/issues.ts'
import { jsonOf, type CreateMessage, type UsageMeter } from '../agent/model.ts'
import { getProposal, listProposals, saveProposal, setProposalStatus } from './proposals.ts'
import { ruleStats } from './stats.ts'
import { isRuleScope, slugify, type CustomerRow, type MemoryStore } from './store.ts'

/**
 * Öğrenme motoru. Ham bilgi (kararlar, müşteri satırları) isteme hiç girmez; burada kısa kurallara damıtılır.
 *
 * Güven politikası asimetriktir: bir şeyi ARAMAYI öğrenmek ucuzdur (en kötü ihtimalle fazladan bir bulgu gelir,
 * insan yoksayar), bir şeyi GÖRMEZDEN GELMEYİ öğrenmek tehlikelidir (yanlış ders sorunu kalıcı olarak gizler).
 * Bu yüzden "sorun" ve "bilgi" kuralları ayara göre kendiliğinden devreye girebilir; "sorun sayma" kuralı ve
 * onaylı bir kuralı değiştiren her öneri insan onayı bekler. Her kural kaynağını taşır; emekliye ayrılınca
 * bastırdıkları yeniden görünür.
 */

const TEACHER = `Sen bir yazılım kalite kontrolcüsünün öğretmenisin. Kontrolcü bir iş uygulamasını gezip sorun buluyor; insan bulgulara "düzeltilecek", "bulgu değil" ya da "düzeldi" diyor ve yorum yazıyor. Görevin bu kararlardan kontrolcünün bir dahaki sefere kullanacağı kısa ve doğru kurallar çıkarmak.

Kurallar:
- Her kural tek cümle, en çok 220 karakter, Türkçe ve uygulanabilir olsun (ne aranır / ne bulgu sayılmaz).
- tur: "sorun" (bunu ara, bulursan bildir), "sorun-degil" (bunu bulgu sayma), "bilgi" (uygulama hakkında bağlam).
- kapsam: doğru olan en dar kapsam: "sayfa:<slug>", "modul:<önek>" (slug'ın ilk tireye kadar olan kısmı), "uygulama" ya da yalnız bütün Zeyrek uygulamalarında geçerli genel bir ilkeyse "platform".
- desen: yalnız ekrandaki metinde basit ve güvenilir bir düzenli ifadeyle yakalanabiliyorsa (ör. şapkalı harf için [âîûÂÎÛ]); değilse boş bırak.
- Tek bir "bulgu değil" kararından genel "sorun-degil" kuralı çıkarma; insanın yorumu genel bir ilke söylüyorsa çıkar.
- Var olan bir kuralı tekrar etme. Var olan kural yanlış ya da eksikse islem "guncelle" (aynı id). İki kural aynı şeyi söylüyorsa "birlestir" (id: kalacak olan, ilgili: emekliye ayrılacaklar). Karar bir kuralın yanlış olduğunu gösteriyorsa "emekli".
- kaynak: dayandığın karar anahtarları ya da müşteri satır kaynakları.
- Çıkarılacak ders yoksa boş liste döndür. Az ama doğru kural, çok ama gürültülü kuraldan iyidir.`

const PROPOSAL_ITEM = {
  type: 'object',
  properties: {
    islem: { type: 'string', enum: ['ekle', 'guncelle', 'birlestir', 'emekli'] },
    id: { type: 'string' },
    kapsam: { type: 'string' },
    tur: { type: 'string', enum: [...RULE_TYPES] },
    metin: { type: 'string' },
    desen: { type: 'string' },
    ilgili: { type: 'array', items: { type: 'string' } },
    gerekce: { type: 'string' },
    kaynak: { type: 'array', items: { type: 'string' } },
  },
  required: ['islem', 'id', 'kapsam', 'tur', 'metin', 'desen', 'ilgili', 'gerekce', 'kaynak'],
  additionalProperties: false,
} as const

const LEARN_SCHEMA = {
  type: 'object',
  properties: { oneriler: { type: 'array', items: PROPOSAL_ITEM } },
  required: ['oneriler'],
  additionalProperties: false,
} as const

const CUSTOMER_SCHEMA = {
  type: 'object',
  properties: {
    siniflar: {
      type: 'object',
      properties: { istek: { type: 'integer' }, veri: { type: 'integer' }, hata: { type: 'integer' } },
      required: ['istek', 'veri', 'hata'],
      additionalProperties: false,
    },
    oneriler: { type: 'array', items: PROPOSAL_ITEM },
  },
  required: ['siniflar', 'oneriler'],
  additionalProperties: false,
} as const

interface RawProposal {
  islem: Proposal['action']
  id: string
  kapsam: string
  tur: string
  metin: string
  desen: string
  ilgili: string[]
  gerekce: string
  kaynak: string[]
}

export interface LearnDeps {
  db: Database
  memory: MemoryStore
  issues: IssueService
  model: () => CreateMessage
  settings: () => Settings
}

const STATUS_TEXT: Record<string, string> = { duzeltilecek: 'düzeltilecek (gerçek sorun)', 'bulgu-degil': 'bulgu değil', duzeldi: 'düzeldi' }

export class Learner {
  constructor(private readonly deps: LearnDeps) {}

  private rulesText(app: AppRef): string {
    const rules = this.deps.memory.rules(app).filter((r) => r.state !== 'emekli')
    return rules.length
      ? rules.map((r) => `- ${r.id} | ${r.scope} | ${r.type} | ${r.state} | ${r.text.replace(/\s+/g, ' ')}`).join('\n')
      : '(henüz kural yok)'
  }

  private async ask<T>(prompt: string, schema: object, meter?: UsageMeter): Promise<T> {
    const settings = this.deps.settings()
    const message = await this.deps.model()({
      model: settings.models.teacher,
      max_tokens: 16_000,
      system: TEACHER,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
    })
    meter?.add(settings.models.teacher, message, 'teacher')
    const parsed = jsonOf<T>(message)
    if (!parsed) throw new ArgusError('LEARN', 'Ders çıkarıcının yanıtı okunamadı.')
    return parsed
  }

  private learnedAt(app: AppRef): string | null {
    const row = this.deps.db
      .prepare('select learned_at from learn_state where project = ? and application = ?')
      .get(app.project, app.application) as { learned_at: string } | undefined
    return row?.learned_at ?? null
  }

  private markLearned(app: AppRef): void {
    this.deps.db
      .prepare(
        `insert into learn_state (project, application, learned_at) values (?, ?, ?)
         on conflict(project, application) do update set learned_at = excluded.learned_at`,
      )
      .run(app.project, app.application, now())
  }

  pendingDecisions(app: AppRef): number {
    return this.deps.issues.decisionsSince(app, this.learnedAt(app)).length
  }

  /** Son öğrenmeden bu yana verilen kararlardan ders çıkarır. */
  async learnFromDecisions(app: AppRef, author: string, meter?: UsageMeter): Promise<Proposal[]> {
    const decisions = this.deps.issues.decisionsSince(app, this.learnedAt(app))
    if (!decisions.length) return []
    const prompt = [
      `Uygulama: ${app.project}/${app.application}`,
      `Var olan kurallar (id | kapsam | tür | durum | metin):\n${this.rulesText(app)}`,
      `Yeni kararlar:\n${decisions
        .map((d) => `- [${d.key}] ${d.title} → ${STATUS_TEXT[d.status] ?? d.status}${d.note ? ` · insanın yorumu: ${d.note}` : ''}${d.example ? ` · örnek: ${d.example}` : ''}`)
        .join('\n')}`,
    ].join('\n\n')
    const result = await this.ask<{ oneriler: RawProposal[] }>(prompt, LEARN_SCHEMA, meter)
    this.markLearned(app)
    return this.propose(app, 'ders', result.oneriler, author)
  }

  /** Müşteri bulgularını türlere ayırır ve tekrarlayan hata türlerinden kural önerir. */
  async learnFromCustomer(app: AppRef, rows: CustomerRow[], author: string): Promise<{ proposals: Proposal[]; classes: { istek: number; veri: number; hata: number } }> {
    const classes = { istek: 0, veri: 0, hata: 0 }
    const proposals: Proposal[] = []
    for (let i = 0; i < rows.length; i += 40) {
      const chunk = rows.slice(i, i + 40)
      const prompt = [
        `Uygulama: ${app.project}/${app.application}`,
        `Var olan kurallar:\n${this.rulesText(app)}`,
        'Aşağıdaki satırlar müşterinin bildirdiği maddeler. Önce her satırı say: istek (yeni özellik, ürün kararı), veri (ortamda veri eksik), hata (gerçek kusur). ' +
          'Sonra yalnız hata türündekilerden, kontrolcünün başka sayfalarda da arayabileceği genel "sorun" kuralları öner (tek seferlik iş kuralları değil). Kapsam çoğunlukla "uygulama" olur.',
        chunk.map((r) => `- (${r.ref}) [${[r.module, r.area].filter(Boolean).join(' / ')}] ${r.text}${r.note ? ` · geliştirici: ${r.note}` : ''}`).join('\n'),
      ].join('\n\n')
      const result = await this.ask<{ siniflar: typeof classes; oneriler: RawProposal[] }>(prompt, CUSTOMER_SCHEMA)
      classes.istek += result.siniflar.istek
      classes.veri += result.siniflar.veri
      classes.hata += result.siniflar.hata
      proposals.push(...this.propose(app, 'musteri', result.oneriler, author))
    }
    return { proposals, classes }
  }

  /** Bakım (token harcamaz): aynı metinli kuralları birleştirmeyi, hiç kullanılmayanları emekliye önerir. */
  hygiene(app: AppRef, author: string): Proposal[] {
    const rules = this.deps.memory.rules(app).filter((r) => r.state === 'onayli')
    const out: RawProposal[] = []
    const groups = new Map<string, Rule[]>()
    for (const rule of rules) {
      const norm = `${rule.scope}|${rule.type}|${rule.text.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`
      groups.set(norm, [...(groups.get(norm) ?? []), rule])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const [keep, ...rest] = group
      out.push({
        islem: 'birlestir',
        id: keep!.id,
        kapsam: keep!.scope,
        tur: keep!.type,
        metin: keep!.text,
        desen: keep!.pattern ?? '',
        ilgili: rest.map((r) => r.id),
        gerekce: 'Aynı metinli kurallar; biri yeter.',
        kaynak: group.flatMap((r) => r.sources),
      })
    }
    const stats = ruleStats(this.deps.db)
    for (const rule of rules) {
      const s = stats.get(rule.id)
      if (rule.type !== 'bilgi' && !rule.pattern && s && s.eligible >= 30 && s.uses === 0) {
        out.push({
          islem: 'emekli',
          id: rule.id,
          kapsam: rule.scope,
          tur: rule.type,
          metin: rule.text,
          desen: '',
          ilgili: [],
          gerekce: `${s.eligible} sayfada isteme girdi, hiçbir bulgu ona dayanmadı; bağlamı boşuna şişiriyor olabilir.`,
          kaynak: rule.sources,
        })
      }
    }
    const pending = new Set(listProposals(this.deps.db, { app, status: 'bekliyor' }).map((p) => `${p.action}:${p.rule.id}`))
    return this.propose(app, 'bakim', out.filter((p) => !pending.has(`${p.islem}:${p.id}`)), author)
  }

  /** Bakım (model): benzer kuralları birleştirmeyi, uzunları kısaltmayı önerir. Hepsi onay bekler. */
  async consolidate(app: AppRef, author: string): Promise<Proposal[]> {
    const prompt = [
      `Uygulama: ${app.project}/${app.application}`,
      `Kurallar:\n${this.rulesText(app)}`,
      'Yalnız bakım yap: anlamca aynı kuralları birleştir, 220 karakteri aşanları kısalt (guncelle), birbiriyle çelişenleri emekli öner. Yeni kural ekleme.',
    ].join('\n\n')
    const result = await this.ask<{ oneriler: RawProposal[] }>(prompt, LEARN_SCHEMA)
    return this.propose(
      app,
      'bakim',
      result.oneriler.filter((p) => p.islem !== 'ekle'),
      author,
    )
  }

  /** Öneriyi doğrular ve politikayı uygular: kendiliğinden devreye girebilecekse yazar, yoksa onaya bırakır. */
  private propose(app: AppRef, origin: Proposal['origin'], raw: RawProposal[], author: string): Proposal[] {
    const settings = this.deps.settings()
    const existing = new Set(this.deps.memory.rules(app).map((r) => r.id))
    const out: Proposal[] = []
    for (const item of raw) {
      const id = slugify(item.id || item.metin, 50)
      const scope = item.kapsam.trim()
      const type = item.tur as RuleType
      const text = item.metin.trim().slice(0, 400)
      if (!id || !isRuleScope(scope) || !RULE_TYPES.includes(type) || (!text && item.islem !== 'emekli')) continue
      if (item.desen) {
        try {
          new RegExp(item.desen, 'u')
        } catch {
          item.desen = ''
        }
      }
      const action: Proposal['action'] = item.islem === 'ekle' && existing.has(id) ? 'guncelle' : item.islem
      const auto = action === 'ekle' && type !== 'sorun-degil' && settings.autoApproveFindingRules
      const proposal = saveProposal(this.deps.db, app, {
        action,
        rule: { id, scope, type, text, ...(item.desen ? { pattern: item.desen } : {}) },
        related: item.ilgili.map((r) => slugify(r, 50)).filter(Boolean),
        reason: item.gerekce,
        sources: item.kaynak,
        origin,
        status: auto ? 'otomatik' : 'bekliyor',
      })
      if (auto) this.apply(proposal, author)
      out.push(proposal)
    }
    return out
  }

  private apply(proposal: Proposal, author: string): void {
    const app = { project: proposal.project, application: proposal.application }
    const current = this.deps.memory.rule(app, proposal.rule.id)
    const date = new Date().toISOString().slice(0, 10)
    const retire = (id: string) => {
      const rule = this.deps.memory.rule(app, id)
      if (!rule) return
      this.deps.memory.writeRule({ ...rule, state: 'emekli', date })
      this.deps.issues.releaseRule(id)
    }
    if (proposal.action === 'emekli') {
      retire(proposal.rule.id)
      return
    }
    const scope = proposal.rule.scope
    this.deps.memory.writeRule({
      id: proposal.rule.id,
      scope,
      type: proposal.rule.type,
      state: 'onayli',
      text: proposal.rule.text,
      ...(proposal.rule.pattern ? { pattern: proposal.rule.pattern } : {}),
      sources: [...new Set([...(current?.sources ?? []), ...proposal.sources])],
      author: current?.author || author,
      date,
      app: scope === 'platform' ? null : app,
    })
    if (proposal.action === 'birlestir') for (const id of proposal.related) if (id !== proposal.rule.id) retire(id)
  }

  accept(id: string, author: string): Proposal {
    const proposal = getProposal(this.deps.db, id)
    if (!proposal) throw new ArgusError('PROPOSAL_NOT_FOUND', 'Öneri bulunamadı.')
    if (proposal.status !== 'bekliyor') throw new ArgusError('PROPOSAL_DONE', 'Bu öneri zaten sonuçlanmış.')
    this.apply(proposal, author)
    setProposalStatus(this.deps.db, id, 'kabul')
    return getProposal(this.deps.db, id)!
  }

  reject(id: string): Proposal {
    const proposal = getProposal(this.deps.db, id)
    if (!proposal) throw new ArgusError('PROPOSAL_NOT_FOUND', 'Öneri bulunamadı.')
    if (proposal.status === 'otomatik') {
      // Kendiliğinden devreye girmiş kuralı geri almak: emekliye ayır, bastırdıklarını serbest bırak.
      this.apply({ ...proposal, action: 'emekli' }, '')
    }
    setProposalStatus(this.deps.db, id, 'ret')
    return getProposal(this.deps.db, id)!
  }

  /** Kural durumunu elle değiştirmek (Hafıza ekranı): onayla, emekliye ayır. */
  setRuleState(app: AppRef | null, id: string, state: Rule['state']): Rule {
    const rule = this.deps.memory.rule(app, id)
    if (!rule) throw new ArgusError('RULE_NOT_FOUND', `Kural yok: ${id}`)
    const written = this.deps.memory.writeRule({ ...rule, state, date: new Date().toISOString().slice(0, 10) })
    if (state === 'emekli') this.deps.issues.releaseRule(id)
    return written
  }
}
