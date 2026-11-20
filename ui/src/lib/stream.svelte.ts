import type { RunInfo, StreamMessage } from '@argus/shared'

/**
 * Sunucunun canlı akışı (SSE): olaylar, koşu güncellemeleri, canlı tarayıcı kareleri. Tek bağlantı, çok dinleyici.
 * Bağlantı koparsa tarayıcı yeniden bağlanır ama aradaki mesajlar gelmez: yeniden bağlanınca bilinen koşular sunucudan
 * tazelenir ve `epoch` artar (sayfalar olay kaydını yeniden okur). Yoksa sayfa eski durumu gösterir (koşu sürerken
 * "Durduruldu").
 */
export const live = $state({ connected: false, epoch: 0, runs: {} as Record<string, RunInfo> })

type Listener = (message: StreamMessage) => void
const listeners = new Set<Listener>()
let source: EventSource | null = null
let opened = false

async function refreshRuns() {
  for (const id of Object.keys(live.runs)) {
    const response = await fetch(`/api/kosular/${id}`).catch(() => null)
    if (response?.ok) live.runs[id] = (await response.json()) as RunInfo
  }
}

export function connect() {
  if (source) return
  source = new EventSource('/api/akis')
  source.addEventListener('hazir', () => {
    live.connected = true
    if (opened) {
      live.epoch += 1
      void refreshRuns()
    }
    opened = true
  })
  source.onerror = () => (live.connected = false)
  source.onmessage = (event) => {
    const message = JSON.parse(event.data) as StreamMessage
    if (message.type === 'kosu-guncellendi') live.runs[message.run.id] = message.run
    for (const listener of listeners) listener(message)
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
