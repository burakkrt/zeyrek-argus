import type { RunInfo, StreamMessage } from '@argus/shared'

/** Sunucunun canlı akışı (SSE): olaylar, koşu güncellemeleri, canlı tarayıcı kareleri. Tek bağlantı, çok dinleyici. */
export const live = $state({ connected: false, runs: {} as Record<string, RunInfo> })

type Listener = (message: StreamMessage) => void
const listeners = new Set<Listener>()
let source: EventSource | null = null

export function connect() {
  if (source) return
  source = new EventSource('/api/akis')
  source.addEventListener('hazir', () => (live.connected = true))
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
