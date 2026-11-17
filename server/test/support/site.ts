import { createServer, type IncomingMessage } from 'node:http'

/**
 * Sahte Studio: platform jeton ucu, `/dev/<proje>/<uyg>/<sayfa>` ve `/branch/<slug>/…` rotaları, veri uçları.
 * Sayfalar bilerek kusurludur; her kusur bir göz ya da kontrolcü davranışını sınar.
 */

export const TEST_USER = { username: 'test-kullanici', password: 'test-parola', token: 'test-jeton' }

const page = (title: string, body: string) =>
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font:14px system-ui;margin:24px} .kesik{display:inline-block;width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  input.dar{width:40px;padding:2px} [role=tooltip]{position:absolute;background:#222;color:#fff;padding:4px}</style></head><body>${body}</body></html>`

/** Uygulamanın kendi kullanıcısı: `gizli` sayfası bu girişle açılan çerezi ister. */
export const APP_USER = { identifier: 'onur@ornek.test', password: 'uygulama-parola' }
const APP_COOKIE = 'SY_Token=gecerli'

const SIGN_IN_PAGE = page(
  'Giriş',
  `<h1>Giriş yap</h1><form id="f"><input name="u" placeholder="Kullanıcı adı"><input name="p" type="password">
  <button>Giriş yap</button></form>
  <script>document.getElementById('f').addEventListener('submit', async (e) => {
    e.preventDefault()
    const r = await fetch('/api/qm/web/giris', { method: 'POST', body: JSON.stringify({ u: e.target.u.value, p: e.target.p.value }) })
    if (r.ok) location.reload()
  })</script>`,
)
const PROTECTED_PAGE = page('Gizli', '<h1>Gizli liste</h1><p>Yalnız oturumla görünür.</p>')

/** Kusurlar: GUID, şapkalı harf, kesik etiket, dar yer tutucu, pencerede ham değer, sayı tutarsızlığı, yazma düğmeleri. */
const LIST_PAGE = page(
  'Eğitim listesi',
  `<h1>Eğitim listesi</h1>
  <p>Onaylı ölçüm <button id="yardim" aria-label="Açıklama">?</button></p>
  <div id="ipucu" role="tooltip" hidden>Onaylı ölçüm: yöneticinin onayladığı ölçüm sayısı.</div>
  <p id="toplam">Toplam: 5 kayıt</p>
  <table><tbody>
    <tr><td>Yangın eğitimi</td><td>Sorumlu: 01917edf-bf08-723a-b3ec-13ad41ea0bc8</td></tr>
    <tr><td>İlk yardım</td><td>Müşteri şikâyet oranı</td></tr>
    <tr><td>Kalite</td><td>Ayşe</td></tr>
  </tbody></table>
  <span class="kesik">Süreci devam eden dokümanlar</span>
  <input class="dar" placeholder="En çok">
  <input id="arama" placeholder="Ara">
  <button id="ara">Filtrele</button>
  <button id="detay">Ayrıntılar</button>
  <div id="pencere" role="dialog" aria-label="Eğitim ayrıntısı" hidden><p>Durum: undefined</p><button id="kapat">Kapat</button></div>
  <button id="sil">Sil</button>
  <button id="hizli">Hızlı ekle</button>
  <script>
    const el = (id) => document.getElementById(id)
    fetch('/api/qm/web/entities/e1/row/list', { method: 'POST', body: '{}' })
    el('yardim').onmouseenter = () => { el('ipucu').hidden = false }
    el('yardim').onmouseleave = () => { el('ipucu').hidden = true }
    el('detay').onclick = () => { el('pencere').hidden = false }
    el('kapat').onclick = () => { el('pencere').hidden = true }
    el('ara').onclick = () => fetch('/api/qm/web/entities/e1/row/list', { method: 'POST', body: JSON.stringify({ q: el('arama').value }) })
    el('sil').onclick = () => fetch('/api/qm/web/entities/e1/row/42', { method: 'DELETE' })
    el('hizli').onclick = () => fetch('/api/qm/web/entities/e1/row', { method: 'POST', body: '{}' }).catch(() => {})
  </script>`,
)

const BROKEN_PAGE = page(
  'Sorunlu',
  `<h1>Sorunlu sayfa</h1><script>console.error('Beklenmeyen veri: 42'); fetch('/api/qm/web/yok/7')</script>`,
)

const CLEAN_PAGE = page('Temiz', '<h1>Temiz sayfa</h1><p>Her şey yolunda.</p>')

export const PAGES: Record<string, string> = {
  'egt-liste': LIST_PAGE,
  'egt-sorunlu': BROKEN_PAGE,
  'egt-temiz': CLEAN_PAGE,
}

/** Testin değiştirebileceği sayfa içerikleri (ör. sorun düzeldi, yeniden bozuldu). */
export const overrides = new Map<string, string>()

const ROUTE = /^\/(?:dev|branch\/([^/]+))\/[^/]+\/[^/]+\/([^/]*)$/

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    req.on('end', () => resolve(body))
  })
}

export async function startSite(): Promise<{
  url: string
  writes: string[]
  /** Uygulama giriş ucuna gelen başarılı giriş sayısı. */
  signIns: () => number
  /** Süper giriş başlatma (hedef kimlikleri) ve sonlandırma kayıtları. */
  superStarts: string[]
  superStops: () => number
  /** `gizli` sayfasının hangi oturum jetonuyla görüldüğü (kimliğin gerçekten değiştiğini kanıtlar). */
  pageViews: string[]
  close(): Promise<void>
}> {
  const writes: string[] = []
  const superStarts: string[] = []
  const pageViews: string[] = []
  let signIns = 0
  let superStops = 0
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://site').pathname
    const cookie = req.headers.cookie ?? ''
    // Süper giriş jetonu `SY_Token=super-<kimlik>`; asıl oturum `SY_Token=gecerli`.
    const signedIn = cookie.includes(APP_COOKIE) || cookie.includes('SY_Token=super-')
    if (req.method === 'POST' && path === '/api/qm/web/giris') {
      const body = JSON.parse((await readBody(req)) || '{}') as { u?: string; p?: string }
      const ok = body.u === APP_USER.identifier && body.p === APP_USER.password
      if (ok) signIns += 1
      res.writeHead(ok ? 200 : 401, ok ? { 'set-cookie': `${APP_COOKIE}; Path=/; HttpOnly` } : {}).end()
      return
    }
    if (req.method === 'POST' && path === '/api/qm/connect-data/web/dashboard/sg_kullanici/options') {
      res
        .writeHead(signedIn ? 200 : 401, { 'content-type': 'application/json' })
        .end(JSON.stringify({ data: { data: [{ id: 'k1', full_name: 'Çetin Test' }] }, message: '' }))
      return
    }
    if (req.method === 'POST' && path === '/api/qm/m/web/sy-super-login-start') {
      const body = JSON.parse((await readBody(req)) || '{}') as { target_id?: string; page?: string }
      // Gerçekte olduğu gibi: çalışma anı başlıkları (ortam, sayfa) yoksa erişim denetimi reddeder.
      const context = req.headers['x-environment'] === 'development' && req.headers['x-page'] === 'dashboard'
      const ok =
        context && cookie.includes(APP_COOKIE) && body.target_id === 'k1' && body.page === 'dashboard'
      if (ok) superStarts.push(body.target_id!)
      // Gerçekte olduğu gibi: jeton gövdede döner, çerezi istemci yazar.
      res
        .writeHead(ok ? 200 : 403, { 'content-type': 'application/json' })
        .end(
          JSON.stringify(ok ? { token: 'super-k1', success: true, redirect_url: null } : { success: false }),
        )
      return
    }
    if (req.method === 'POST' && path === '/api/qm/m/web/sy-super-login-stop') {
      const open = cookie.includes('SY_Token=super-')
      if (open) superStops += 1
      res
        .writeHead(open ? 200 : 401, { 'content-type': 'application/json' })
        .end(JSON.stringify(open ? { token: 'gecerli', success: true } : { success: false }))
      return
    }
    if (ROUTE.exec(path)?.[2] === 'gizli') {
      pageViews.push(/SY_Token=([\w-]+)/.exec(cookie)?.[1] ?? '')
      res
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(signedIn ? PROTECTED_PAGE : SIGN_IN_PAGE)
      return
    }
    if (req.method === 'POST' && path === '/api/org/connect/token') {
      const form = new URLSearchParams(await readBody(req))
      const ok = form.get('Username') === TEST_USER.username && form.get('Password') === TEST_USER.password
      res
        .writeHead(ok ? 200 : 401, { 'content-type': 'application/json' })
        .end(ok ? JSON.stringify({ access_token: TEST_USER.token }) : '{}')
      return
    }
    if (path.startsWith('/api/qm/web/entities/')) {
      if (req.method !== 'GET' && !path.endsWith('/row/list')) writes.push(`${req.method} ${path}`)
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
      return
    }
    const match = ROUTE.exec(path)
    const slug = match?.[2] ?? ''
    const body = match
      ? (overrides.get(slug) ?? PAGES[slug] ?? (slug === '' ? CLEAN_PAGE : undefined))
      : undefined
    if (!body) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('bulunamadı')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    url: `http://127.0.0.1:${port}`,
    writes,
    signIns: () => signIns,
    superStarts,
    superStops: () => superStops,
    pageViews,
    close: () => new Promise((done) => server.close(() => done())),
  }
}
