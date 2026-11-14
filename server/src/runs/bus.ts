import { EventEmitter } from 'node:events'
import type {
  RunEvent,
  RunEventBody,
  RunInfo,
  StepTarget,
  StreamMessage,
  WorkspaceState,
} from '@argus/shared'
import type { Database } from '../db/database.ts'
import { appendEvent, lastEventSeq } from '../db/runs.ts'

/**
 * Olay yolu: koşunun her adımı saklanır (tekrar izleme için) ve arayüze SSE ile akar. Canlı tarayıcı kareleri ve
 * imleç burada saklanmaz, yalnız akar (kareleri koşu klasörüne yöneticinin kendisi yazar).
 */
export class EventBus {
  private readonly emitter = new EventEmitter()
  private readonly seqs = new Map<string, number>()

  constructor(private readonly db: Database) {
    this.emitter.setMaxListeners(100)
  }

  publish(runId: string, page: string | null, body: RunEventBody): RunEvent {
    const seq = (this.seqs.get(runId) ?? lastEventSeq(this.db, runId)) + 1
    this.seqs.set(runId, seq)
    const event = appendEvent(this.db, runId, seq, page, body)
    this.emitter.emit('message', event)
    return event
  }

  frame(runId: string, data: string, at: number): void {
    this.emitter.emit('message', { type: 'kare', runId, data, at } satisfies StreamMessage)
  }

  pointer(runId: string, tool: string, target: StepTarget, at: number): void {
    this.emitter.emit('message', { type: 'imlec', runId, tool, target, at } satisfies StreamMessage)
  }

  runUpdated(run: RunInfo): void {
    this.emitter.emit('message', { type: 'kosu-guncellendi', run } satisfies StreamMessage)
  }

  /** Çalışma alanı değişti: açık bütün sekmeler aynı seçime geçer. */
  workspaceChanged(state: WorkspaceState): void {
    this.emitter.emit('message', { type: 'calisma-alani', state } satisfies StreamMessage)
  }

  subscribe(listener: (message: StreamMessage) => void): () => void {
    this.emitter.on('message', listener)
    return () => this.emitter.off('message', listener)
  }
}
