/** Karma (#) yönlendirici: `#/monitor/<id>` → parts = ['monitor', '<id>']. */
export const route = $state({ parts: [] as string[] })

function parse() {
  const hash = location.hash.replace(/^#\/?/, '')
  route.parts = (hash || 'baslat').split('?')[0]!.split('/').filter(Boolean).map(decodeURIComponent)
}

window.addEventListener('hashchange', parse)
parse()

export function go(path: string) {
  location.hash = path.startsWith('/') ? path : `/${path}`
}
