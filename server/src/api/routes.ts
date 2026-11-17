import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import {
  FINDING_KINDS,
  groupPages,
  ISSUE_STATUSES,
  MODEL_ROLES,
  RULE_TYPES,
  type AppRef,
  type FindingKind,
  type IssueStatus,
  type MemoryBudget,
  type RuleScope,
  type RunMode,
  type Settings,
  type StreamMessage,
} from '@argus/shared'
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../context.ts'
import { listEvents, listRuns, getRun, nextRunCode, recentWorkspaces } from '../db/runs.ts'
import {
  deleteAppUser,
  forgetAppSessions,
  getAppUser,
  getSavedWorkspace,
  getSettings,
  listAppUsers,
  saveAppUser,
  saveSettings,
  saveWorkspace,
} from '../db/settings.ts'
import { ArgusError } from '../errors.ts'
import { DEFAULT_FORMAT, issuesCsv, markdownZip } from '../memory/format.ts'
import { platformNotes } from '../memory/platform-notes.ts'
import { listProposals } from '../memory/proposals.ts'
import { estimateTokens, ruleApplies } from '../memory/select.ts'
import { ruleStats } from '../memory/stats.ts'
import { isRuleId, isRuleScope, slugify, type DecisionRecord } from '../memory/store.ts'
import { parseCustomerXlsx } from '../memory/xlsx.ts'
import { describeAccess } from '../platform/credentials.ts'
import { probe } from '../platform/probe.ts'
import { KNOWN_MODELS } from '../agent/model.ts'
import { confirmWorkspace, resolveWorkspace } from '../workspace/workspace.ts'
import { saveAttachment } from '../runs/attachments.ts'
import { claimStorageNotice, cleanStorage, RECORDING_DROPPED, storageStatus } from '../runs/storage.ts'

const bad = (message: string): never => {
  throw new ArgusError('BAD_REQUEST', message)
}

const str = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim()) bad(`${name} gerekli.`)
  return (value as string).trim()
}

function appOf(source: Record<string, unknown>): AppRef {
  return { project: str(source.proje, 'proje'), application: str(source.uygulama, 'uygulama') }
}

function queryApp(c: Context): AppRef | undefined {
  const project = c.req.query('proje')
  const application = c.req.query('uygulama')
  return project && application ? { project, application } : undefined
}

const csv = (value: string | undefined) =>
  value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : []

export function createApi(ctx: AppContext): Hono {
  const api = new Hono()

  api.onError((error, c) => {
    if (error instanceof ArgusError) return c.json({ hata: error.message, kod: error.code }, 400)
    console.error(error)
    return c.json({ hata: error instanceof Error ? error.message : String(error) }, 500)
  })

  // --- durum ve ayarlar ---

  // Yerel veri (Git dışı): disk kullanımı ve saklama politikasını hemen uygulama.
  // Yerel depolama: tek koşul toplam boyut; silme yalnız kullanıcı isteyince (bkz. runs/storage.ts).
  const storage = () => storageStatus(ctx.config.dataDir, getSettings(ctx.db).storageLimitGb)
  api.get('/depolama', (c) => c.json(storage()))
  /** Uygulama açılışında sorulur: sınır aşıldıysa üç günde en çok bir kez `notify: true` döner. */
  api.post('/depolama/bildirim', (c) => {
    const status = storage()
    return c.json({ notify: claimStorageNotice(ctx.db, status), status })
  })
  api.post('/depolama/temizle', (c) => {
    const result = cleanStorage(ctx.db, ctx.config.dataDir, getSettings(ctx.db).storageLimitGb)
    return c.json({ result, status: storage() })
  })

  api.get('/durum', (c) => {
    let mcp: { ok: boolean; detail: string }
    try {
      const d = describeAccess(ctx.platform.access())
      mcp = { ok: true, detail: `${d.host} · ${d.organization}` }
    } catch (error) {
      mcp = { ok: false, detail: error instanceof Error ? error.message : String(error) }
    }
    const key = ctx.config.anthropicApiKey
    return c.json({
      zeyrekAppDir: ctx.config.zeyrekAppDir,
      mcp,
      anthropic: {
        set: Boolean(key),
        source: ctx.config.anthropicKeySource,
        hint: key ? `…${key.slice(-4)}` : null,
      },
      memoryDir: ctx.config.memoryDir,
      dataDir: ctx.config.dataDir,
      activeRunId: ctx.runs.activeRunId,
      provider: getSettings(ctx.db).provider,
      author: ctx.author(),
      models: KNOWN_MODELS,
    })
  })

  /**
   * Seçili model sağlayıcısını tek kısa çağrıyla denetler (Claude hesabı: Claude Code oturumu açık mı; API: anahtar
   * geçerli mi). Hata, kullanıcının yapacağı işi söyler.
   */
  api.post('/saglayici/denetle', async (c) => {
    const settings = getSettings(ctx.db)
    try {
      await ctx.model()(
        {
          model: settings.models.explorer,
          max_tokens: 50,
          system: 'Kısa yanıt ver.',
          messages: [{ role: 'user', content: 'Yalnız "tamam" yaz.' }],
        },
        'explorer',
      )
      return c.json({
        ok: true,
        detail: settings.provider === 'abonelik' ? 'Claude hesabı hazır (abonelik).' : 'API anahtarı hazır.',
      })
    } catch (error) {
      return c.json({ ok: false, detail: error instanceof Error ? error.message : String(error) })
    }
  })

  api.get('/ayarlar', (c) => c.json({ settings: getSettings(ctx.db), appUsers: listAppUsers(ctx.db) }))

  // Koşunun kimlik seçenekleri: uygulamanın hesapları ve (süper giriş tanımlıysa) geçilebilecek kişiler.
  // Koşunun kimliği (Yeni koşu özetinde): uygulamanın hesapları; koşu varsayılan hesapla girer. Kimlik Ayarlar'dan yönetilir.
  api.get('/kimlik', (c) => {
    const app = queryApp(c) ?? bad('proje ve uygulama gerekli.')
    return c.json({ accounts: listAppUsers(ctx.db, app) })
  })

  api.put('/ayarlar', async (c) => {
    const body = (await c.req.json()) as Partial<Settings>
    const patch: Partial<Settings> = {}
    if (body.models && typeof body.models === 'object') {
      const models = { ...getSettings(ctx.db).models }
      for (const role of MODEL_ROLES) {
        const value = (body.models as Record<string, unknown>)[role]
        if (typeof value === 'string' && value.trim()) models[role] = value.trim()
      }
      patch.models = models
    }
    if (body.provider === 'abonelik' || body.provider === 'api') patch.provider = body.provider
    if (typeof body.escalate === 'boolean') patch.escalate = body.escalate
    if (typeof body.inspector === 'boolean') patch.inspector = body.inspector
    if (body.effort === 'low' || body.effort === 'medium' || body.effort === 'high')
      patch.effort = body.effort
    if (Number.isFinite(body.ruleBudget))
      patch.ruleBudget = Math.min(Math.max(Number(body.ruleBudget), 200), 8000)
    if (typeof body.autoApproveFindingRules === 'boolean')
      patch.autoApproveFindingRules = body.autoApproveFindingRules
    if (Number.isFinite(body.learnAfterDecisions))
      patch.learnAfterDecisions = Math.min(Math.max(Number(body.learnAfterDecisions), 0), 100)
    if (Number.isFinite(body.storageLimitGb))
      patch.storageLimitGb = Math.min(Math.max(Number(body.storageLimitGb), 1), 1000)
    return c.json({ settings: saveSettings(ctx.db, patch) })
  })

  api.put('/ayarlar/uygulama-kullanicisi', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const app = appOf(body)
    const identifier = str(body.kullanici, 'kullanici')
    const password = typeof body.parola === 'string' && body.parola !== '' ? body.parola : null
    saveAppUser(ctx.db, app, identifier, password, body.varsayilan === true)
    // Parola değişince saklanan oturum eskir; yalnız varsayılan değiştiyse oturum geçerli kalır.
    if (password !== null) forgetAppSessions(ctx.config.dataDir, app, identifier)
    return c.json({ appUsers: listAppUsers(ctx.db) })
  })

  api.delete('/ayarlar/uygulama-kullanicisi', (c) => {
    const app = queryApp(c) ?? bad('proje ve uygulama gerekli.')
    const identifier = c.req.query('kullanici') ?? bad('kullanici gerekli.')
    deleteAppUser(ctx.db, app, identifier)
    forgetAppSessions(ctx.config.dataDir, app, identifier)
    return c.json({ appUsers: listAppUsers(ctx.db) })
  })

  api.post('/denetle', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const app = appOf(body)
    await ctx.platform.reset()
    const lines = await probe(ctx.platform, {
      ...app,
      environment: str(body.ortam, 'ortam'),
      appUser: getAppUser(ctx.db, app),
    })
    return c.json({ lines })
  })

  // --- katalog ---

  api.get('/katalog/projeler', async (c) => c.json(await ctx.platform.catalog.projects()))
  api.get('/katalog/uygulamalar', async (c) =>
    c.json(await ctx.platform.catalog.applications(str(c.req.query('proje'), 'proje'))),
  )
  api.get('/katalog/ortamlar', async (c) =>
    c.json(await ctx.platform.catalog.environments(str(c.req.query('proje'), 'proje'))),
  )
  api.get('/katalog/sayfalar', async (c) => {
    const pages = await ctx.platform.catalog.pages(
      str(c.req.query('proje'), 'proje'),
      str(c.req.query('uygulama'), 'uygulama'),
      str(c.req.query('ortam'), 'ortam'),
    )
    return c.json(groupPages(pages))
  })

  // --- çalışma alanı ---

  api.get('/calisma-alani', async (c) => {
    const saved = getSavedWorkspace(ctx.db)
    const state = await resolveWorkspace(ctx.platform.catalog, saved, recentWorkspaces(ctx.db))
    // Tahmin edilen ya da geçersizin yerine açılan seçim kaydedilir: sonraki açılış aynı yerde, uyarısız başlar.
    if (state.workspace && JSON.stringify(state.workspace) !== JSON.stringify(saved))
      saveWorkspace(ctx.db, state.workspace)
    return c.json(state)
  })

  api.put('/calisma-alani', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const state = await confirmWorkspace(ctx.platform.catalog, {
      ...appOf(body),
      environment: str(body.ortam, 'ortam'),
    })
    saveWorkspace(ctx.db, state.workspace!)
    ctx.bus.workspaceChanged(state)
    return c.json(state)
  })

  // --- koşular ---

  api.get('/kosular', (c) => {
    const app = queryApp(c)
    const environment = c.req.query('ortam')
    return c.json(listRuns(ctx.db, 100, app && environment ? { ...app, environment } : undefined))
  })

  // Yeni koşu ekranının önizlediği kod: hesaplanır, ayrılmaz (koşu başlatılınca atanır).
  api.get('/kosular/siradaki-kod', (c) => c.json({ code: nextRunCode(ctx.db) }))

  api.post('/kosular', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const pages = Array.isArray(body.sayfalar)
      ? body.sayfalar.filter((p): p is string => typeof p === 'string')
      : []
    const options = (body.secenekler ?? {}) as {
      user?: string | null
      brief?: string | null
      attachments?: string[]
      mode?: RunMode
    }
    const run = ctx.runs.create({ ...appOf(body), environment: str(body.ortam, 'ortam'), pages, options })
    return c.json(run)
  })

  /** Talimata eklenen dosya (çok parçalı `dosya`); kimliği döner, koşu oluşturulurken `secenekler.attachments`e yazılır. */
  api.post('/ekler', async (c) => {
    const form = await c.req.formData()
    const file = form.get('dosya')
    if (!(file instanceof File)) bad('dosya gerekli.')
    const upload = file as File
    const bytes = new Uint8Array(await upload.arrayBuffer())
    return c.json({ id: saveAttachment(ctx.config.dataDir, bytes, upload.name, upload.type) })
  })

  api.get('/kosular/:id', (c) => {
    const run = getRun(ctx.db, c.req.param('id'))
    return run ? c.json(run) : c.json({ hata: 'Koşu bulunamadı.' }, 404)
  })

  api.get('/kosular/:id/olaylar', (c) => c.json(listEvents(ctx.db, c.req.param('id'))))

  api.post('/kosular/:id/durdur', (c) => {
    ctx.runs.stop(c.req.param('id'))
    return c.json({ ok: true })
  })

  api.post('/kosular/:id/yonlendir', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    ctx.runs.steer(c.req.param('id'), str(body.mesaj, 'mesaj'))
    return c.json({ ok: true })
  })

  /**
   * Koşunun kayıt kareleri: alındıkları anlar (epoch ms), sıralı. Kayıt yoksa (eski koşu) boş; `dropped` kaydın
   * yerel temizlikte silindiğini söyler (adım görüntüleri de gitmiştir).
   */
  api.get('/kosular/:id/kareler', (c) => {
    const id = c.req.param('id')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ hata: 'Geçersiz koşu.' }, 400)
    const base = resolve(ctx.config.dataDir, 'runs', id)
    const dir = resolve(base, 'kare')
    const frames = existsSync(dir)
      ? readdirSync(dir)
          .map((name) => /^(\d+)\.jpg$/.exec(name)?.[1])
          .filter((t): t is string => t !== undefined)
          .map(Number)
          .sort((a, b) => a - b)
      : []
    return c.json({ frames, dropped: existsSync(resolve(base, RECORDING_DROPPED)) })
  })

  api.get('/kosular/:id/dosya/*', (c) => {
    const id = c.req.param('id')
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ hata: 'Geçersiz koşu.' }, 400)
    const rel = decodeURIComponent(c.req.path.split('/dosya/')[1] ?? '')
    const base = resolve(ctx.config.dataDir, 'runs', id)
    const file = resolve(base, rel)
    if (!file.startsWith(base + sep) || !existsSync(file)) return c.json({ hata: 'Dosya yok.' }, 404)
    return c.body(readFileSync(file), 200, {
      'content-type': file.endsWith('.png') ? 'image/png' : 'image/jpeg',
      'cache-control': 'max-age=86400',
    })
  })

  // --- canlı akış ---

  api.get('/akis', (c) =>
    streamSSE(c, async (stream) => {
      const queue: StreamMessage[] = []
      let wake: (() => void) | null = null
      const unsubscribe = ctx.bus.subscribe((message) => {
        // Kare birikmesin: sırada eski kare varsa yenisiyle değiştir.
        // (Atlanan kare kayıttan izlemede diskte durur; canlıda en yenisi yeter.)
        if (message.type === 'kare') {
          const old = queue.findIndex((m) => m.type === 'kare' && m.runId === message.runId)
          if (old >= 0) queue.splice(old, 1)
        }
        queue.push(message)
        wake?.()
      })
      stream.onAbort(() => {
        unsubscribe()
        wake?.()
      })
      await stream.writeSSE({ event: 'hazir', data: '{}' })
      while (!stream.aborted) {
        while (queue.length && !stream.aborted) await stream.writeSSE({ data: JSON.stringify(queue.shift()) })
        await new Promise<void>((done) => {
          wake = done
          setTimeout(done, 15_000)
        })
        wake = null
        if (!queue.length && !stream.aborted) await stream.writeSSE({ event: 'nabiz', data: '{}' })
      }
    }),
  )

  // --- sorunlar ---

  const issueFilter = (c: Context) => {
    const statuses = csv(c.req.query('durum')).filter((s): s is IssueStatus =>
      (ISSUE_STATUSES as readonly string[]).includes(s),
    )
    const kinds = csv(c.req.query('tur')).filter((k): k is FindingKind =>
      (FINDING_KINDS as readonly string[]).includes(k),
    )
    const app = queryApp(c)
    return {
      ...(app ? { app } : {}),
      ...(statuses.length ? { statuses } : {}),
      ...(kinds.length ? { kinds } : {}),
      ...(c.req.query('q') ? { query: c.req.query('q')! } : {}),
      ...(c.req.query('kosu') ? { runId: c.req.query('kosu')! } : {}),
      includeSuppressed: c.req.query('bastirilan') === '1',
    }
  }

  api.get('/sorunlar', (c) => c.json(ctx.issues.list(issueFilter(c))))
  api.get('/sorunlar/:id', (c) => c.json(ctx.issues.detail(c.req.param('id'))))

  api.post('/sorunlar/:id/karar', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const status = str(body.durum, 'durum') as IssueStatus
    if (!ISSUE_STATUSES.includes(status)) bad('durum geçersiz.')
    const note = typeof body.not === 'string' && body.not.trim() ? body.not.trim() : null
    return c.json(ctx.issues.decide(c.req.param('id'), status, ctx.author().name, note))
  })

  api.post('/sorunlar/:id/yorum', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    return c.json(ctx.issues.comment(c.req.param('id'), ctx.author().name, str(body.metin, 'metin')))
  })

  api.get('/disa-aktar', (c) => {
    const format = c.req.query('bicim') ?? 'md'
    const details = ctx.issues.list(issueFilter(c)).map((i) => ctx.issues.detail(i.id))
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    if (format === 'json') {
      return c.body(JSON.stringify({ argus: 2, issues: details }, null, 2), 200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="argus-bulgular-${stamp}.json"`,
      })
    }
    if (format === 'csv') {
      return c.body(issuesCsv(details), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="argus-bulgular-${stamp}.csv"`,
      })
    }
    const name = c.req.query('sablon') ?? 'bulgu'
    const template = ctx.memory.formats().find((f) => f.name === name)?.content ?? DEFAULT_FORMAT
    const zip = markdownZip(
      details,
      template.replace(/^---[\s\S]*?---\n?/, ''),
      ctx.config.dataDir,
      'Argus bulgu raporu',
    )
    return c.body(new Uint8Array(zip), 200, {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="argus-rapor-${stamp}.zip"`,
    })
  })

  /** Takım arkadaşının dışa aktardığı JSON: kararlar ve yorumlar hafızaya karar dosyası olarak işlenir. */
  api.post('/ice-aktar', async (c) => {
    const body = (await c.req.json()) as { issues?: Array<Record<string, unknown>> }
    if (!Array.isArray(body.issues)) bad('issues listesi bekleniyor (Argus JSON dışa aktarımı).')
    const apps = new Set<string>()
    let count = 0
    for (const item of body.issues!) {
      const app = { project: String(item.project ?? ''), application: String(item.application ?? '') }
      const key = String(item.key ?? '')
      const status = String(item.status ?? 'acik') as IssueStatus
      if (!app.project || !app.application || !key || !ISSUE_STATUSES.includes(status)) continue
      const existing = ctx.memory.decision(app, key)
      const record: DecisionRecord = {
        key,
        title: String(item.title ?? key),
        kind: (FINDING_KINDS as readonly string[]).includes(String(item.kind))
          ? (item.kind as FindingKind)
          : 'kesin',
        status,
        updatedAt: new Date().toISOString(),
        decisionPrint: existing?.decisionPrint ?? null,
        example: existing?.example ?? null,
        history: [
          ...(existing?.history ?? []),
          ...((item.history as DecisionRecord['history']) ?? []),
        ].filter((h, i, all) => all.findIndex((x) => x.at === h.at && x.to === h.to) === i),
        comments: [
          ...(existing?.comments ?? []),
          ...((item.comments as DecisionRecord['comments']) ?? []),
        ].filter((h, i, all) => all.findIndex((x) => x.at === h.at && x.text === h.text) === i),
      }
      ctx.memory.writeDecision(app, record)
      apps.add(`${app.project}/${app.application}`)
      count += 1
    }
    for (const a of apps) {
      const [project, application] = a.split('/') as [string, string]
      ctx.issues.syncFromMemory({ project, application }, ctx.author())
    }
    return c.json({ imported: count })
  })

  // --- hafıza ---

  // Platform köprüsü: ai-notlari'ye konacak içeriğin önizlemesi. Aktarma kararlaştırılana kadar hiçbir yere yazılmaz.
  api.get('/hafiza/platform-notu', (c) => {
    const app = queryApp(c) ?? bad('proje ve uygulama gerekli.')
    return c.json(platformNotes(app, ctx.memory.rules(app)))
  })

  api.get('/hafiza/kurallar', (c) => {
    const app = queryApp(c) ?? null
    const rules = ctx.memory.rules(app)
    const stats = ruleStats(ctx.db)
    const settings = getSettings(ctx.db)
    const budgets: MemoryBudget[] = []
    if (app) {
      const scopes = new Set<string>(['uygulama', ...rules.filter((r) => r.app).map((r) => r.scope)])
      for (const scope of scopes) {
        const page = scope.startsWith('sayfa:')
          ? scope.slice(6)
          : scope.startsWith('modul:')
            ? `${scope.slice(6)}-x`
            : null
        const applicable = rules.filter((r) => !r.pattern && ruleApplies(r, app, page))
        budgets.push({
          scope,
          tokens: applicable.reduce((sum, r) => sum + estimateTokens(r.text) + 8, 0),
          limit: settings.ruleBudget,
          rules: applicable.length,
        })
      }
    }
    return c.json({
      rules: rules.map((r) => ({
        ...r,
        stats: stats.get(r.id) ?? { uses: 0, eligible: 0, misled: 0, lastUsed: null },
      })),
      budgets,
      pendingDecisions: app ? ctx.learner.pendingDecisions(app) : 0,
    })
  })

  api.post('/hafiza/kurallar', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const scope = str(body.kapsam, 'kapsam')
    if (!isRuleScope(scope)) bad('kapsam: platform | uygulama | modul:<önek> | sayfa:<slug>')
    const type = str(body.tur, 'tur')
    if (!(RULE_TYPES as readonly string[]).includes(type)) bad('tur: sorun | sorun-degil | bilgi')
    const text = str(body.metin, 'metin')
    const id = typeof body.id === 'string' && isRuleId(body.id) ? body.id : slugify(text, 50)
    const pattern = typeof body.desen === 'string' && body.desen.trim() ? body.desen.trim() : undefined
    if (pattern) {
      try {
        new RegExp(pattern, 'u')
      } catch {
        bad('desen geçerli bir düzenli ifade değil.')
      }
    }
    const app = scope === 'platform' ? null : appOf(body)
    const rule = ctx.memory.writeRule({
      id,
      scope: scope as RuleScope,
      type: type as never,
      state: 'onayli',
      text,
      ...(pattern ? { pattern } : {}),
      sources: [`insan:${ctx.author().name}`],
      author: ctx.author().name,
      date: new Date().toISOString().slice(0, 10),
      app,
    })
    return c.json(rule)
  })

  api.post('/hafiza/kurallar/durum', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const state = str(body.durum, 'durum')
    if (state !== 'onayli' && state !== 'emekli' && state !== 'aday') bad('durum: aday | onayli | emekli')
    const app = typeof body.proje === 'string' && typeof body.uygulama === 'string' ? appOf(body) : null
    return c.json(ctx.learner.setRuleState(app, str(body.id, 'id'), state as never))
  })

  api.get('/hafiza/oneriler', (c) => {
    const status = c.req.query('durum')
    const app = queryApp(c)
    return c.json(
      listProposals(ctx.db, { ...(app ? { app } : {}), ...(status ? { status: status as never } : {}) }),
    )
  })

  api.post('/hafiza/oneriler/:id/kabul', (c) =>
    c.json(ctx.learner.accept(c.req.param('id'), ctx.author().name)),
  )
  api.post('/hafiza/oneriler/:id/ret', (c) => c.json(ctx.learner.reject(c.req.param('id'))))

  api.post('/hafiza/ogren', async (c) => {
    const app = appOf((await c.req.json()) as Record<string, unknown>)
    ctx.issues.syncFromMemory(app, ctx.author())
    return c.json(await ctx.learner.learnFromDecisions(app, ctx.author().name))
  })

  api.post('/hafiza/bakim', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const app = appOf(body)
    const proposals = ctx.learner.hygiene(app, ctx.author().name)
    if (body.model === true) proposals.push(...(await ctx.learner.consolidate(app, ctx.author().name)))
    return c.json(proposals)
  })

  api.post('/hafiza/musteri', async (c) => {
    const form = await c.req.formData()
    const file = form.get('dosya')
    if (!(file instanceof File)) bad('dosya gerekli (.xlsx).')
    const app = appOf({ proje: form.get('proje'), uygulama: form.get('uygulama') })
    const xlsx = file as File
    const rows = parseCustomerXlsx(new Uint8Array(await xlsx.arrayBuffer()), xlsx.name)
    const saved = ctx.memory.writeCustomer(app, xlsx.name, rows)
    const learn = form.get('ogren') !== '0'
    const result = learn
      ? await ctx.learner.learnFromCustomer(app, rows, ctx.author().name)
      : { proposals: [], classes: null }
    return c.json({ rows: rows.length, file: saved, ...result })
  })

  api.get('/hafiza/dosyalar', (c) => c.json(ctx.memory.files()))
  api.get('/hafiza/dosya', (c) =>
    c.json({ path: c.req.query('yol'), content: ctx.memory.readFile(str(c.req.query('yol'), 'yol')) }),
  )
  api.put('/hafiza/dosya', async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>
    const path = str(body.yol, 'yol')
    ctx.memory.writeFile(path, typeof body.icerik === 'string' ? body.icerik : bad('icerik gerekli.'))
    const parts = path.split('/')
    if (parts[0] === 'apps' && parts[3] === 'decisions')
      ctx.issues.syncFromMemory({ project: parts[1]!, application: parts[2]! }, ctx.author())
    return c.json({ ok: true })
  })

  api.post('/hafiza/yenile', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    const apps = typeof body.proje === 'string' ? [appOf(body)] : ctx.memory.apps()
    const counts = apps.map((app) => ({ ...app, decisions: ctx.issues.syncFromMemory(app, ctx.author()) }))
    return c.json(counts)
  })

  api.get('/hafiza/bicimler', (c) => {
    const formats = ctx.memory.formats()
    return c.json(formats.length ? formats : [{ name: 'bulgu', content: DEFAULT_FORMAT }])
  })

  api.get('/hafiza/kanit/:runId/*', (c) =>
    c.redirect(
      `/api/kosular/${c.req.param('runId')}/dosya/${c.req.path.split('/kanit/')[1]?.split('/').slice(1).join('/')}`,
    ),
  )

  return api
}

export function staticRoot(rootDir: string): string | null {
  const dist = join(rootDir, 'ui', 'dist')
  return existsSync(join(dist, 'index.html')) ? dist : null
}
