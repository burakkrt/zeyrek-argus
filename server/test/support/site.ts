import { createServer, type IncomingMessage } from 'node:http'

/**
 * Sahte Studio: platform jeton ucu, `/dev/<proje>/<uyg>/<sayfa>` ve `/branch/<slug>/…` rotaları, veri uçları.
 * Sayfalar bilerek kusurludur; her kusur bir göz ya da kontrolcü davranışını sınar.
 */

export const TEST_USER = { username: 'test-kullanici', password: 'test-parola', token: 'test-jeton' }
export const BRANCH = { name: 'feature/yeni-ekran', slug: 'feature-yeni-ekran' }

const page = (title: string, body: string) =>
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font:14px system-ui;margin:24px} .kesik{display:inline-block;width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  input.dar{width:40px;padding:2px} [role=tooltip]{position:absolute;background:#222;color:#fff;padding:4px}</style></head><body>${body}</body></html>`

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

export async function startSite(): Promise<{ url: string; writes: string[]; close(): Promise<void> }> {
  const writes: string[] = []
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://site').pathname
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
    close: () => new Promise((done) => server.close(() => done())),
  }
}
