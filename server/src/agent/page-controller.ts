import type { Box, FindingKind, RunEventBody, Settings } from '@argus/shared'
import type { Locator } from 'playwright'
import { captureEvidence, captureStep } from '../browser/evidence.ts'
import { describeHit, runEyes, type EyeHit, type PatternRule } from '../browser/eyes.ts'
import { isUnsafeLabel } from '../browser/guard.ts'
import { ariaTree, harvestTooltips, visibleText } from '../browser/research.ts'
import type { BrowserSession, Problem } from '../browser/session.ts'
import { compressSnapshot } from '../browser/snapshot.ts'
import type { RecordResult } from '../issues/issues.ts'
import {
  describeModelError,
  jsonOf,
  textOf,
  type ContentBlock,
  type CreateMessage,
  type MessageParam,
  type MessageParams,
  type UsageMeter,
} from './model.ts'
import { pageFacts, type PageFacts } from './prompts.ts'
import { PLAN_SCHEMA, TASK_TOOLS } from './tools.ts'

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
  record(draft: FindingDraft): RecordResult
  retract(key: string): boolean
  markFixed(key: string, note: string): boolean
  closeVanishedEyeIssues(foundKeys: Set<string>): string[]
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
  facts: Omit<PageFacts, 'tooltips' | 'eyeFindings' | 'problems' | 'page' | 'url'>
  patterns: PatternRule[]
  system: MessageParams['system']
  createMessage: CreateMessage
  meter: UsageMeter
  settings: Pick<Settings, 'model' | 'effort'>
  maxTasks: number
  maxSteps: number
  ruleStats: { used: number; dropped: number; tokens: number }
  hooks: PageHooks
}

const text = (value: string): ContentBlock => ({ type: 'text', text: value })
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
  private readonly reported = new Set<string>()
  private readonly eyeFindings: Array<{ key: string; title: string }> = []

  constructor(private readonly input: PageInput) {}

  private get page() {
    return this.input.session.page
  }

  private async step(tool: string, reason: string | null, outcome: string, withShot = true): Promise<void> {
    let shot: string | null = null
    if (withShot) {
      const file = this.input.hooks.file('adim')
      await captureStep(this.page, file.abs)
        .then(() => (shot = file.rel))
        .catch(() => undefined)
    }
    this.input.hooks.emit({ type: 'adim', tool, reason, outcome, shot })
    const requests = this.input.session.drainNetwork()
    if (requests.length) this.input.hooks.emit({ type: 'ag', requests: requests.slice(0, 40) })
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
  private async screen(withImage: boolean, fresh: string[] = []): Promise<ContentBlock[]> {
    const tree = compressSnapshot(await ariaTree(this.page))
    const blocked = this.input.session.drainBlocked()
    const header = [`Adres: ${this.page.url()}`]
    if (fresh.length)
      header.push(`Gözlerin yeni bulduğu (bildirme, kaydedildi):\n${fresh.map((f) => `- ${f}`).join('\n')}`)
    if (blocked.length) header.push(`Engellenen yazma istekleri (bulgu değil): ${blocked.join(', ')}`)
    const blocks: ContentBlock[] = [text(`${header.join('\n')}\n\nSayfa ağacı:\n${tree}`)]
    if (withImage) {
      const image = await this.page.screenshot({ type: 'jpeg', quality: 70 }).catch(() => null)
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

  private call(params: Omit<MessageParams, 'model' | 'system' | 'max_tokens'>) {
    return this.input
      .createMessage({
        model: this.input.settings.model,
        max_tokens: 16_000,
        system: this.input.system,
        cache_control: { type: 'ephemeral' },
        ...params,
        output_config: { effort: this.input.settings.effort, ...(params.output_config ?? {}) },
      })
      .then((message) => {
        this.input.meter.add(this.input.settings.model, message)
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
    const tooltips = await harvestTooltips(this.page)
    const hits = await runEyes(this.page, this.input.patterns)
    const network = this.input.session.drainNetwork()
    const problems = this.input.session.drainProblems()
    const shotFile = hooks.file('adim')
    await captureStep(this.page, shotFile.abs).catch(() => undefined)
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
    hooks.emit({
      type: 'arastirma',
      tooltips: tooltips.length,
      eyeFindings: this.eyeFindings.length,
      requests: network.length,
      shot: shotFile.rel,
      rules: this.input.ruleStats,
    })
    if (network.length) hooks.emit({ type: 'ag', requests: network.slice(0, 40) })

    const facts = (): string =>
      pageFacts({
        ...this.input.facts,
        page: this.input.page,
        url: this.input.url,
        tooltips,
        eyeFindings: this.eyeFindings,
        problems: problems.map((p) => p.text),
      })

    // 2. Plan: tek çağrı, yapılandırılmış çıktı.
    if (hooks.stopped()) return 'Durduruldu.'
    const planned = await this.plan(facts)
    const summary = planned.summary
    const tasks = planned.tasks.length
      ? planned.tasks
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
      const result = await this.runTask(task, notebook, facts).catch((error: unknown) => {
        hooks.emit({ type: 'hata', message: `Görev yarım kaldı: ${describeModelError(error)}` })
        return `Yarım kaldı: ${describeModelError(error)}`
      })
      notebook.push(`${index + 1}. ${task.baslik}: ${result}`)
      hooks.emit({ type: 'gorev-bitti', index, summary: result })
    }
    const pageSummary = [summary, ...notebook].filter(Boolean).join('\n')
    hooks.emit({ type: 'sayfa-bitti', summary: pageSummary })
    return pageSummary
  }

  private async plan(
    facts: () => string,
  ): Promise<{ summary: string; tasks: Array<{ baslik: string; amac: string }> }> {
    try {
      const message = await this.call({
        messages: [
          {
            role: 'user',
            content: [
              text(
                `${facts()}\n\nBu sayfayı test etmek için en çok ${this.input.maxTasks} görev planla. Görevler somut olsun (hangi alan, ne denenecek). ` +
                  'Açık sorunlar varsa ilk görev onları yeniden doğrulamak olsun. Liste/filtre/sıralama/sayfalama, "Yeni"/"Ekle" ile açılan formlar (kaydetmeden), ' +
                  'pencereler, sekmeler, menüler ve sayfa genelinde tutarlılığı kapsa. Ekranın ağacı ve görüntüsü aşağıda.',
              ),
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

  private async runTask(
    task: { baslik: string; amac: string },
    notebook: string[],
    facts: () => string,
  ): Promise<string> {
    const { hooks } = this.input
    const intro =
      `${facts()}\n\n` +
      (notebook.length ? `Bu sayfada önceki görevler:\n${notebook.join('\n')}\n\n` : '') +
      `GÖREV: ${task.baslik}\n${task.amac}\nEn çok ${this.input.maxSteps} adımın var. Ekranın şu anki hâli aşağıda.`
    const messages: MessageParam[] = [{ role: 'user', content: [text(intro), ...(await this.screen(false))] }]
    let steps = 0
    let finalRound = false
    for (let round = 0; round < this.input.maxSteps + 3; round += 1) {
      if (hooks.stopped()) return 'Durduruldu.'
      const last = messages[messages.length - 1]!
      for (const message of hooks.drainSteering()) {
        ;(last.content as ContentBlock[]).push(text(`KULLANICI YÖNLENDİRMESİ: ${message}`))
        hooks.emit({ type: 'yonlendirme', message })
      }
      const response = await this.call({ messages, tools: TASK_TOOLS })
      if (response.stop_reason === 'refusal') return 'Model bu adımı yanıtlamadı.'
      messages.push({ role: 'assistant', content: response.content })
      const uses = response.content.filter((b) => b.type === 'tool_use')
      if (!uses.length) return textOf(response).slice(0, 400) || 'Görev bitti.'
      const results: ContentBlock[] = []
      let summary: string | null = null
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
            summary = field(use.input, 'ozet')
            reply('Tamam.')
            continue
          }
          if (use.name === 'bulgu_bildir') {
            reply(await this.report(use.input))
            continue
          }
          if (use.name === 'bulgu_geri_al') {
            const key = field(use.input, 'anahtar')
            const ok = hooks.retract(this.normalizeKey(key))
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
            reply('Adım sınırı doldu. Bulgularını bildir ve gorevi_bitir çağır.', true)
            continue
          }
          reply(await this.act(use.name, use.input))
        } catch (error) {
          reply(`Hata: ${firstLine(describeModelError(error))}`, true)
        }
      }
      if (summary !== null) return summary || 'Görev bitti.'
      if (steps >= this.input.maxSteps && !finalRound) {
        finalRound = true
        results.push(
          text(
            'Adım sınırı doldu. Gördüğün sorunları bulgu_bildir ile bildir ve gorevi_bitir çağır; başka işlem yapma.',
          ),
        )
      } else if (finalRound) {
        return 'Adım sınırı doldu.'
      }
      messages.push({ role: 'user', content: results })
    }
    return 'Adım sınırı doldu.'
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
            }
          })
          .catch(() => null)
        if (!target) return `'${ref}' bulunamadı; ekran değişmiş olabilir, ekrana_bak ile yeniden bak.`
        if (isUnsafeLabel(target.label) || target.submit) {
          await this.step(name, reason, `Salt okuma: "${target.label}" basılmadı.`, false)
          return `Salt okuma: "${target.label}" yazma işi yapabilir, basılmadı. Başka bir şey dene.`
        }
        await this.locate(ref).click({ timeout: 5_000 })
        const fresh = await this.afterAction()
        await this.step(name, reason, `Tıklandı: "${target.label}"`)
        return [text(`Tıklandı: "${target.label}".`), ...(await this.screen(false, fresh))]
      }
      case 'uzerine_gel': {
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
        await this.step(name, reason, tip ? `İpucu: ${tip.slice(0, 120)}` : 'Üstüne gelindi')
        return [text(tip ? `Açılan ipucu: ${tip}` : 'İpucu açılmadı.'), ...(await this.screen(false, fresh))]
      }
      case 'yaz': {
        const value = field(input, 'metin')
        this.input.session.guard.dirty = true
        await this.locate(ref).fill(value, { timeout: 5_000 })
        const fresh = await this.afterAction()
        await this.step(name, reason, `Yazıldı: "${value.slice(0, 60)}"`)
        return [text(`Yazıldı.`), ...(await this.screen(false, fresh))]
      }
      case 'tus': {
        const key = field(input, 'tus')
        await this.page.keyboard.press(key)
        const fresh = await this.afterAction()
        await this.step(name, reason, `Tuş: ${key}`)
        return [text(`${key} basıldı.`), ...(await this.screen(false, fresh))]
      }
      case 'kaydir': {
        await this.page.mouse.wheel(0, field(input, 'yon') === 'yukari' ? -600 : 600)
        const fresh = await this.afterAction()
        await this.step(
          name,
          reason,
          field(input, 'yon') === 'yukari' ? 'Yukarı kaydırıldı' : 'Aşağı kaydırıldı',
        )
        return [text('Kaydırıldı.'), ...(await this.screen(false, fresh))]
      }
      case 'ekrana_bak': {
        const withImage = (input as { goruntu?: unknown } | null)?.goruntu === true
        await this.input.session.settle(3_000)
        await this.step(name, reason, withImage ? 'Ekrana bakıldı (görüntüyle)' : 'Ekrana bakıldı')
        return this.screen(withImage)
      }
      case 'bastan_ac': {
        await this.input.session.open(this.input.url)
        const fresh = await this.recordDeterministic(
          await runEyes(this.page, this.input.patterns),
          this.input.session.drainProblems(),
          'gorev',
        )
        await this.step(name, reason, 'Sayfa baştan açıldı')
        return this.screen(false, fresh)
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
    const title = field(input, 'baslik').trim() || key
    const file = hooks.file('kanit')
    const { box } = await captureEvidence(this.page, file.abs, {
      ...(ref ? { locator: this.locate(ref) } : {}),
      label: title,
    }).catch(() => ({ box: null }))
    const kind = (FINDING_KIND_SET.has(field(input, 'tur')) ? field(input, 'tur') : 'not') as FindingKind
    const rules = Array.isArray((input as { kurallar?: unknown }).kurallar)
      ? ((input as { kurallar: unknown[] }).kurallar.filter((r) => typeof r === 'string') as string[])
      : []
    const suppressedBy = field(input, 'bastiran_kural').trim() || null
    const result = hooks.record({
      key,
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
    this.reported.add(key)
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
