/**
 * Canlı yazımın saf mantığı. Konuşma duraksamalardan cümlelere bölünür (`Utterance`): süren cümle sık sık geçici olarak
 * çevrilir, duraksayınca kesinleşir. Sessizlik çeviriye gitmez (zayıf bilgisayarda boşuna iş olmasın). Konuşma
 * eşiği ortamın gürültüsüne uyar: sessiz anların enerjisi taban olur, konuşma onun birkaç katıdır.
 */
const FRAME_MS = 30
/** Bu kadar sessizlik cümleyi bitirir. */
const PAUSE_MS = 700
/** Durmadan konuşulsa da cümle bu süreyi geçmez: çeviri kısa ve hızlı kalır. */
const MAX_MS = 10_000
/** Cümlenin başına eklenen önceki sessizlik (ilk hece kesilmesin). */
const LEAD_MS = 200
const MIN_THRESHOLD = 0.012

export type UtteranceState = 'bekliyor' | 'suruyor' | 'bitti'

export class Utterance {
  private readonly frame: number
  private chunks: Float32Array[] = []
  private lead: Float32Array[] = []
  private pending = new Float32Array(0)
  private speaking = false
  private silentFrames = 0
  private frames = 0
  private floor = 0.004

  constructor(private readonly rate: number) {
    this.frame = Math.round((rate * FRAME_MS) / 1000)
  }

  /** Yeni ses parçası; cümlenin durumunu döner. "bitti"den sonra `audio()` okunur, `reset()` ile yeni cümle başlar. */
  push(samples: Float32Array): UtteranceState {
    const all = new Float32Array(this.pending.length + samples.length)
    all.set(this.pending)
    all.set(samples, this.pending.length)
    let offset = 0
    let ended = false
    for (; offset + this.frame <= all.length && !ended; offset += this.frame) {
      const frame = all.subarray(offset, offset + this.frame)
      let energy = 0
      for (const s of frame) energy += s * s
      const rms = Math.sqrt(energy / frame.length)
      const loud = rms > Math.max(MIN_THRESHOLD, this.floor * 3)
      if (!loud) this.floor = this.floor * 0.95 + rms * 0.05
      if (!this.speaking) {
        this.lead.push(frame.slice())
        if (this.lead.length > LEAD_MS / FRAME_MS) this.lead.shift()
        if (!loud) continue
        this.speaking = true
        this.chunks = this.lead
        this.lead = []
        this.frames = this.chunks.length
        this.silentFrames = 0
        continue
      }
      this.chunks.push(frame.slice())
      this.frames += 1
      this.silentFrames = loud ? 0 : this.silentFrames + 1
      ended = this.silentFrames * FRAME_MS >= PAUSE_MS || this.frames * FRAME_MS >= MAX_MS
    }
    this.pending = all.slice(offset)
    return ended ? 'bitti' : this.speaking ? 'suruyor' : 'bekliyor'
  }

  /** Cümlenin sesi (başındaki kısa sessizlik dahil). */
  audio(): Float32Array {
    const out = new Float32Array(this.chunks.reduce((n, c) => n + c.length, 0))
    let at = 0
    for (const chunk of this.chunks) {
      out.set(chunk, at)
      at += chunk.length
    }
    return out
  }

  reset(): void {
    this.chunks = []
    this.lead = []
    this.speaking = false
    this.silentFrames = 0
    this.frames = 0
  }
}

/** Alanın metni: kayıt başlarkenki metin, kesinleşen cümleler ve geçici cümle, aralarında tek boşluk. */
export function composeText(prefix: string, committed: string[], interim: string): string {
  return [prefix.trim(), ...committed, interim].filter((part) => part.trim()).join(' ')
}

/**
 * Sesle yazılan girdinin sonuna kendiliğinden eklenen not: konuşmadan yazıya çeviri bazı sözcükleri yanlış yazabilir;
 * not, girdiyi okuyan modele bunu söyler ve anlamı bütünden çıkarmasını ister. Kullanıcı da alanda görür, isterse siler.
 */
export const VOICE_NOTE =
  '(Not: Bu girdi konuşularak yazıldı; bazı sözcükler yanlış ya da eksik çevrilmiş olabilir. Tek tek sözcüklere değil, cümlelerin bütün anlamına göre yorumla; belirsiz bir yer kalırsa en olası anlamı seç.)'

/** Metinden notu çıkarır (kayıt yeniden başlarken not metnin ortasında kalmasın). */
export const stripVoiceNote = (text: string): string => {
  const at = text.indexOf(VOICE_NOTE)
  if (at < 0) return text.trimEnd()
  const before = text.slice(0, at).trimEnd()
  const after = text.slice(at + VOICE_NOTE.length).trim()
  return [before, after].filter(Boolean).join(' ')
}

/** Notu metnin sonuna bir kez ekler; boş metne eklemez. */
export function withVoiceNote(text: string): string {
  const body = stripVoiceNote(text).trim()
  return body ? `${body}

${VOICE_NOTE}` : ''
}
