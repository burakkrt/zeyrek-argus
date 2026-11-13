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

export interface SessionOptions {
  origin: string
  accessToken?: string
  headless?: boolean
  /** Canlı görüntü: CDP ekran yayınının JPEG kareleri (base64). */
  onFrame?: (data: string) => void
}

const SIGN_IN_BUTTON = /sign in|log ?in|giriş|oturum aç/i
const USER_FIELD =
  'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])'

/**
 * Kontrolcünün tarayıcısı. Türkçe ve İstanbul saatiyle açılır (1. sürümde İngilizce açıldığı için tarih kutuları
 * "mm/dd/yyyy" görünüp yanlış bulgu üretmişti). Ağ istekleri, konsol hataları ve engellenen yazmalar kayıt altında.
 */
export class BrowserSession {
  readonly guard: GuardState = { loadPosts: new Set(), loading: true, dirty: false }
  private network: NetworkEntry[] = []
  private problems: Problem[] = []
  private blocked: string[] = []
  private started = new WeakMap<object, number>()
  private cdp: CDPSession | null = null
  private lastFrameAt = 0

  private constructor(
    readonly browser: Browser,
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly origin: string,
  ) {}

  static async open(options: SessionOptions): Promise<BrowserSession> {
    const browser = await chromium.launch({ headless: options.headless ?? true })
    try {
      const context = await browser.newContext({
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
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

  private async startScreencast(onFrame: (data: string) => void): Promise<void> {
    this.cdp = await this.context.newCDPSession(this.page)
    this.cdp.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
      void this.cdp?.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => undefined)
      const at = Date.now()
      if (at - this.lastFrameAt < 200) return
      this.lastFrameAt = at
      onFrame(frame.data)
    })
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 55,
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

  async close(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => undefined)
    await this.browser.close().catch(() => undefined)
  }
}
