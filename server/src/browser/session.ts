import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { NetworkEntry } from '@argus/shared'
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright'
import { ArgusError } from '../errors.ts'
import { ACCESS_TOKEN_COOKIE } from '../platform/token.ts'
import { judgeRequest, type GuardState } from './guard.ts'

export interface Problem {
  kind: 'konsol' | 'istek' | 'sayfa'
  text: string
  /** İstek sorunlarında yöntem + yol (anahtar için); konsolda mesajın kendisi. */
  key: string
}

/** Sayfanın açtığı tarayıcı penceresi (alert, confirm, prompt, çıkış onayı). */
export interface BrowserDialog {
  type: string
  message: string
}

/** Ekran yayını karesi en sık bu aralıkla iletilir; aradaki kareler atlanır ama son kare hep iletilir. */
const FRAME_INTERVAL_MS = 100

export interface SessionOptions {
  origin: string
  accessToken?: string
  headless?: boolean
  /** Canlı görüntü: CDP ekran yayınının JPEG kareleri (base64) ve alındıkları an (epoch ms). */
  onFrame?: (data: string, at: number) => void
  /** Önceki koşudan saklanan uygulama oturumu (çerezler); varsa tarayıcı onunla açılır, yeniden giriş yapılmaz. */
  storageState?: string
}

/**
 * Saklanan oturum dosyası okunabilir mi; bozuksa (yarım yazılmış, elle değiştirilmiş) silinir ve tarayıcı temiz
 * açılır — koşu bu yüzden düşmez, gerekirse yeniden giriş yapılır.
 */
function readableState(file: string | undefined): file is string {
  if (!file || !existsSync(file)) return false
  try {
    const state = JSON.parse(readFileSync(file, 'utf8')) as { cookies?: unknown }
    if (Array.isArray(state.cookies)) return true
  } catch {
    /* bozuk dosya: aşağıda silinir */
  }
  rmSync(file, { force: true })
  return false
}

const SIGN_IN_BUTTON = /sign in|log ?in|giriş|oturum aç/i
const USER_FIELD =
  'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])'

/**
 * Kontrolcünün tarayıcısı. Türkçe ve İstanbul saatiyle açılır (1. sürümde İngilizce açıldığı için tarih kutuları
 * "mm/dd/yyyy" görünüp yanlış bulgu üretmişti). Ağ istekleri, konsol hataları ve engellenen yazmalar kayıt altında.
 */
export class BrowserSession {
  readonly guard: GuardState = {
    loadPosts: new Set(),
    loading: true,
    dirty: false,
    identity: false,
    reserved: new Set(),
  }
  private network: NetworkEntry[] = []
  private problems: Problem[] = []
  private blocked: string[] = []
  private started = new WeakMap<object, number>()
  private dialogs: BrowserDialog[] = []
  private cdp: CDPSession | null = null
  private lastFrameAt = 0
  private pendingFrame: ReturnType<typeof setTimeout> | null = null

  private constructor(
    readonly browser: Browser,
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly origin: string,
  ) {}

  static async open(options: SessionOptions): Promise<BrowserSession> {
    // Arayüz dili Türkçe: bağlamın `locale`'i yetmez, tarih kutusu gibi yerel denetimler Chromium'un arayüz dilini
    // izler (yoksa "mm/dd/yyyy" görünür ve uygulamanın hatası sanılır; ölçüldü 2026-11-15).
    const launch = { headless: options.headless ?? true, args: ['--lang=tr-TR'] }
    const browser = await chromium.launch(launch).catch((error: unknown) => {
      // Yeni klonda Playwright'ın tarayıcısı henüz indirilmemiş olabilir.
      if (error instanceof Error && /Executable doesn't exist|playwright install/i.test(error.message))
        throw new ArgusError(
          'BROWSER_MISSING',
          'Kontrolcünün tarayıcısı kurulu değil. Bir kez `pnpm browsers:install` çalıştırın.',
        )
      throw error
    })
    try {
      const context = await browser.newContext({
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
        ...(readableState(options.storageState) ? { storageState: options.storageState } : {}),
      })
      if (options.accessToken) {
        await context.addCookies([
          { name: ACCESS_TOKEN_COOKIE, value: options.accessToken, url: options.origin },
        ])
      }
      const page = await context.newPage()
      const session = new BrowserSession(browser, context, page, options.origin)
      await session.watch()
      if (options.onFrame) await session.startScreencast(options.onFrame)
      return session
    } catch (error) {
      await browser.close()
      throw error
    }
  }

  private async watch(): Promise<void> {
    const { page } = this
    page.on('pageerror', (error) =>
      this.problems.push({ kind: 'sayfa', text: `Yakalanmamış hata: ${error.message}`, key: error.message }),
    )
    page.on('console', (message) => {
      const text = message.text()
      // Bizim engellediğimiz yazma isteği ve başarısız istek (ayrıca "istek" olarak kaydediliyor) konsol bulgusu değildir.
      if (message.type() !== 'error' || /ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(text)) return
      this.problems.push({ kind: 'konsol', text, key: text })
    })
    // Pencere kaydedilir ve modele söylenir (dinleyici yoksa Playwright sessizce kapatır, düğme "tepkisiz" görünür).
    // Yalnız "Tamam"ı olan uyarı kabul edilir; onay ve çıkış onayı iptal edilir: sayfada kalınır, hiçbir şey silinmez.
    page.on('dialog', (dialog) => {
      this.dialogs.push({
        type: dialog.type(),
        message: dialog.message().replace(/\s+/g, ' ').trim().slice(0, 200),
      })
      void (dialog.type() === 'alert' ? dialog.accept() : dialog.dismiss()).catch(() => undefined)
    })
    page.on('request', (request) => this.started.set(request, Date.now()))
    page.on('response', (response) => {
      const request = response.request()
      const type = request.resourceType()
      const url = response.url()
      const status = response.status()
      if (type === 'fetch' || type === 'xhr') {
        this.network.push({
          method: request.method(),
          url,
          status,
          ms: Date.now() - (this.started.get(request) ?? Date.now()),
        })
      }
      if (status >= 400 && url.startsWith(this.origin)) {
        const path = new URL(url).pathname
        this.problems.push({
          kind: 'istek',
          text: `${status} yanıtı: ${request.method()} ${path}`,
          key: `${request.method()} ${path}:${status}`,
        })
      }
    })
    await page.route('**/*', async (route) => {
      const request = route.request()
      const verdict = judgeRequest(
        this.guard,
        request.method(),
        request.url(),
        request.url().startsWith(this.origin),
      )
      if (!verdict.allow) {
        this.network.push({ method: request.method(), url: request.url(), status: 0, ms: 0, blocked: true })
        this.blocked.push(`${request.method()} ${new URL(request.url()).pathname} (${verdict.reason})`)
        await route.abort('blockedbyclient')
        return
      }
      await route.continue()
    })
  }

  /**
   * Modele giden ekran görüntüsü: %60 ölçekte (768×480), JPEG. Görüntü tokenı piksel sayısıyla büyür; tam boyuta
   * göre yaklaşık üçte bir maliyet, metin hâlâ okunur. Kanıt görüntüleri tam boyutta alınır, modele gitmez.
   */
  async modelScreenshot(): Promise<Buffer> {
    this.cdp ??= await this.context.newCDPSession(this.page)
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 800 }
    const shot = (await this.cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 70,
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height, scale: 0.6 },
    })) as { data: string }
    return Buffer.from(shot.data, 'base64')
  }

  /**
   * Monitörün adım karesi: görünüm alanı tam boyut, JPEG %60 (~50 KB). Yalnız diske yazılır, modele gitmez; koşunun
   * kayıttan izlenmesi ve bulgunun "o anı" bununla gösterilir.
   */
  async stepFrame(): Promise<{ image: Buffer; viewport: { width: number; height: number } }> {
    this.cdp ??= await this.context.newCDPSession(this.page)
    const viewport = this.page.viewportSize() ?? { width: 1280, height: 800 }
    const shot = (await this.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 60 })) as {
      data: string
    }
    return { image: Buffer.from(shot.data, 'base64'), viewport }
  }

  /**
   * Ekran yayını: kareler en çok ~10/sn iletilir. Aralık dolmadan gelen kare atılmaz, bekletilir; yeni kare gelmezse
   * aralık sonunda iletilir — yoksa animasyonun son karesi düşer ve ekran ara bir hâlde donuk kalır.
   */
  private async startScreencast(onFrame: (data: string, at: number) => void): Promise<void> {
    this.cdp ??= await this.context.newCDPSession(this.page)
    let latest: string | null = null
    const flush = () => {
      this.pendingFrame = null
      if (latest === null) return
      this.lastFrameAt = Date.now()
      onFrame(latest, this.lastFrameAt)
      latest = null
    }
    this.cdp.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
      void this.cdp?.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined)
      latest = frame.data
      const wait = FRAME_INTERVAL_MS - (Date.now() - this.lastFrameAt)
      if (wait <= 0) flush()
      else this.pendingFrame ??= setTimeout(flush, wait)
    })
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 70,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    })
  }

  /** Sayfayı açar ve ağ susana kadar bekler. Açılış sırasında görülen POST uçları serbest listeye girer. */
  async open(url: string): Promise<void> {
    this.guard.loading = true
    this.guard.dirty = false
    try {
      await this.page.goto(url, { waitUntil: 'load', timeout: 45_000 })
      await this.settle(10_000)
    } finally {
      this.guard.loading = false
    }
  }

  /** Ağın susmasını ve kısa bir animasyon payını bekler; erken yargıyı önler. */
  async settle(timeout = 5_000): Promise<void> {
    await this.page.waitForLoadState('networkidle', { timeout }).catch(() => undefined)
    await this.page.waitForTimeout(400)
  }

  drainNetwork(): NetworkEntry[] {
    const out = this.network
    this.network = []
    return out
  }

  /** Son bakıştan beri engellenen yazma istekleri (modele söylenir ki aynı şeyi zorlamasın). */
  drainBlocked(): string[] {
    const out = this.blocked
    this.blocked = []
    return out
  }

  /** Son bakıştan beri açılan tarayıcı pencereleri. */
  drainDialogs(): BrowserDialog[] {
    const out = this.dialogs
    this.dialogs = []
    return out
  }

  drainProblems(): Problem[] {
    const out = this.problems
    this.problems = []
    return out
  }

  async isSignInScreen(): Promise<boolean> {
    return this.page
      .locator('input[type="password"]')
      .first()
      .isVisible()
      .catch(() => false)
  }

  /**
   * Uygulamanın kendi giriş ekranından girer (kompleks projeler). Giriş ekranı yoksa bir şey yapmaz. Bu, salt
   * okumanın tek istisnasıdır: giriş isteği yazma sayılmaz ve açılış sırasında yapılır.
   */
  async signIn(
    url: string,
    user: { identifier: string; password: string } | null,
  ): Promise<'gerekmedi' | 'girildi'> {
    await this.open(url)
    if (!(await this.isSignInScreen())) return 'gerekmedi'
    if (!user) {
      throw new ArgusError(
        'APP_SIGN_IN',
        'Uygulama giriş ekranı gösteriyor; Ayarlar → Uygulama kullanıcıları bölümünden kullanıcı ekleyin.',
      )
    }
    this.guard.loading = true
    try {
      const password = this.page.locator('input[type="password"]').first()
      const field = this.page.locator(USER_FIELD).first()
      if (!(await field.isVisible().catch(() => false)))
        throw new ArgusError('APP_SIGN_IN', 'Giriş ekranında kullanıcı adı alanı bulunamadı.')
      await field.fill(user.identifier)
      await password.fill(user.password)
      await password.press('Enter')
      let left = await password.waitFor({ state: 'hidden', timeout: 5_000 }).then(
        () => true,
        () => false,
      )
      if (!left) {
        const button = this.page.getByRole('button', { name: SIGN_IN_BUTTON }).first()
        if (await button.isVisible().catch(() => false)) await button.click()
        left = await password.waitFor({ state: 'hidden', timeout: 20_000 }).then(
          () => true,
          () => false,
        )
      }
      if (!left)
        throw new ArgusError(
          'APP_SIGN_IN',
          'Giriş ekranından çıkılamadı; uygulama kullanıcısı ve parolası doğru mu?',
        )
      await this.settle(10_000)
      return 'girildi'
    } finally {
      this.guard.loading = false
    }
  }

  /**
   * Uygulamanın oturum çerezinin değerini değiştirir (süper giriş jetonu); alan, yol ve güvenlik öznitelikleri mevcut
   * çerezden alınır. Çerez yoksa bir şey yapmaz ve `false` döner (oturum kurulmamış demektir).
   */
  async setCookieValue(name: string, value: string): Promise<boolean> {
    const current = (await this.context.cookies()).find((c) => c.name === name)
    if (!current) return false
    await this.context.addCookies([{ ...current, value }])
    return true
  }

  /**
   * Kimlik isteği (süper giriş, kullanıcı listesi): sayfanın içinden, oturum çerezleriyle JSON POST. Giriş gibi salt
   * okumanın bilinçli istisnasıdır; bu süre yazma korumasında `identity` açıktır, uç serbest listeye girmez.
   */
  async identityRequest(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; data: unknown }> {
    this.guard.identity = true
    try {
      return await this.page.evaluate(
        async ({ path, body, headers }) => {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify(body),
          })
          const data: unknown = await response.json().catch(() => null)
          return { status: response.status, data }
        },
        { path, body, headers },
      )
    } finally {
      this.guard.identity = false
    }
  }

  /**
   * Uygulama oturumunu (çerezler, yerel depo) sonraki koşular için diske yazar; dosya yalnız bu kullanıcıya okunur
   * (0600) ve `data/` altında durur (Git'e girmez). Platform jetonu yazılmaz: her koşuda taze alınır.
   */
  async saveState(file: string): Promise<void> {
    const state = await this.context.storageState()
    state.cookies = state.cookies.filter((c) => c.name !== ACCESS_TOKEN_COOKIE)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state), { mode: 0o600 })
  }

  async close(): Promise<void> {
    if (this.pendingFrame) clearTimeout(this.pendingFrame)
    await this.cdp?.send('Page.stopScreencast').catch(() => undefined)
    await this.browser.close().catch(() => undefined)
  }
}
