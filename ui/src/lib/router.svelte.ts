import { HOME } from './nav'
import { pageLoad } from './page-load'

/** Karma (#) yönlendirici: `#/monitor/<id>` → parts = ['monitor', '<id>']. */
export const route = $state({ parts: [] as string[] })

function parse() {
  const hash = location.hash.replace(/^#\/?/, '')
  const parts = (hash || HOME).split('?')[0]!.split('/').filter(Boolean).map(decodeURIComponent)
  // Yalnız sayfa değişimi yükleme açar; aynı sayfada seçim değişimi (`#/bulgular/<id>`) içeriği gizlemez.
  if (parts[0] !== route.parts[0]) pageLoad.begin()
  route.parts = parts
}

window.addEventListener('hashchange', parse)
parse()

export function go(path: string) {
  location.hash = path.startsWith('/') ? path : `/${path}`
}
