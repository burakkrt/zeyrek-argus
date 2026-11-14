import type { Workspace, WorkspaceState } from '@argus/shared'
import { api, put } from './api'
import { pageLoad } from './page-load'
import { subscribe } from './stream.svelte'

/**
 * Çalışma alanı: arayüzün odaklandığı tek proje · uygulama · dal. Açılışta sunucu son seçimi (ya da tahminini)
 * verir; kullanıcı yalnız hiçbir yoldan çıkarılamazsa bir kez seçer. Değişince `key` artar: sayfa ağacı baştan
 * kurulur, her sayfa verisini yeni seçimle çeker, bu sırada sayfa yükleyicisi döner. Başka sekmedeki değişiklik
 * sunucu olayıyla buraya da gelir.
 */
export const workspace = $state({
  ready: false,
  current: null as Workspace | null,
  labels: null as WorkspaceState['labels'],
  notice: null as string | null,
  key: 0,
})

const same = (a: Workspace | null, b: Workspace | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.project === b.project &&
    a.application === b.application &&
    a.environment === b.environment)

function apply(state: WorkspaceState) {
  const changed = workspace.ready && !same(state.workspace, workspace.current)
  // İlk açılışta da: sayfalar çalışma alanı gelince kurulur, açılış istekleri yükleyiciye sayılsın.
  if (changed || !workspace.ready) pageLoad.begin()
  workspace.current = state.workspace
  workspace.labels = state.labels
  workspace.notice = state.notice
  workspace.ready = true
  if (changed) workspace.key += 1
}

export async function loadWorkspace(): Promise<void> {
  subscribe((message) => {
    if (message.type === 'calisma-alani') apply(message.state)
  })
  apply(await api<WorkspaceState>('/calisma-alani'))
}

export async function changeWorkspace(next: Workspace): Promise<void> {
  apply(
    await put<WorkspaceState>('/calisma-alani', {
      proje: next.project,
      uygulama: next.application,
      ortam: next.environment,
    }),
  )
}

/** Sunucu sorgusunun çalışma alanı kısmı (`qs` ile): uygulamaya göre süzülen uçlar için. */
export const appQuery = () =>
  workspace.current ? { proje: workspace.current.project, uygulama: workspace.current.application } : {}

/** Koşu uçları dala göre de süzülür. */
export const runQuery = () =>
  workspace.current ? { ...appQuery(), ortam: workspace.current.environment } : {}
