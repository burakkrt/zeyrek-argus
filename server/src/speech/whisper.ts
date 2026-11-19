import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { ArgusError } from '../errors.ts'

/**
 * Sesli yazım motoru: konuşulanı canlı olarak yazıya çevirir. Ses bilgisayardan çıkmaz: tarayıcı cümle cümle 16 kHz
 * WAV gönderir, yerel whisper.cpp sunucuları (`whisper-server`, yalnız 127.0.0.1) Türkçe çevirir.
 *
 * İki model: kesin çeviri hep doğru olan large-v3-turbo ile yapılır. Geçici çeviri (konuşurken alana düşen metin)
 * turbo bu bilgisayarda yeterince hızlıysa onunla, değilse küçük ve hızlı base modeliyle yapılır; karar ölçülen hıza
 * göre kendiliğinden verilir (`nextPace`). Ölçüm (2026-11-19, 4 sn'lik cümle, 2 iş parçacığı): turbo 3,3-5,5 sn,
 * base 0,17 sn; bellek turbo ~730 MB, base ~170 MB.
 *
 * Zayıf bilgisayar için ayrıca:
 * - Motorlar ilk kullanımda açılır (Argus açılırken değil) ve 3 dk boşta kalınca kapanır: model belleği geri verilir.
 *   Base yalnız gerekince açılır.
 * - Kodlayıcı penceresi 10 sn'dir (`-ac 512`, cümle en çok 10 sn): Whisper kısa sesi 30 sn'ye tamamlıyordu, çeviriyi
 *   iki kattan fazla yavaşlatıyordu.
 * - Geçici istekler birikmez: model meşgulken gelen geçici istek beklemeden boş döner; kesin çeviri sıraya girer.
 * - İş parçacığı sayısı çekirdeklerin ikisini arayüze ve tarayıcıya bırakır (en az 2, en çok 8).
 *
 * Program ve modeller `data/whisper/` altındadır (git dışı): `bin/whisper-server(.exe)` + DLL'ler,
 * `ggml-large-v3-turbo-q5_0.bin` ve (isteğe bağlı) `ggml-base-q5_1.bin`. Kurulum README → Sesli yazım.
 */
const ACCURATE = 'ggml-large-v3-turbo-q5_0.bin'
const QUICK = 'ggml-base-q5_1.bin'
const IDLE_MS = 3 * 60_000
const START_MS = 90_000
const VAD = 'ggml-silero-v5.1.2.bin'
/**
 * Turbo, sesin bu oranından uzun sürüyorsa geçici çeviri küçük modelle yapılır. Doğruluk önce gelir: küçük model gerçek
 * mikrofonda Türkçeyi zayıf yazıyordu (2026-11-19 kullanıcı denemesi), bu yüzden yalnız turbonun yetişemediği gerçekten
 * yavaş bilgisayarda devreye girer.
 */
const SLOW_PACE = 0.8
/** Platformun sık terimleri: Whisper'a ilk istem olarak verilir, bu sözcükler doğru yazılır. */
const VOCABULARY = 'Zeyrek, Argus, performans dönemi, değerlendirme, kalibrasyon, yönetici atama, süzgeç, sayfa, koşu, bulgu.'
/**
 * Whisper'ın sessizlik ve gürültüde uydurduğu bilinen cümleler (Türkçe altyazılı videolardan öğrenilmiş kapanışlar);
 * konuşmanın parçası değildir.
 */
const HALLUCINATIONS = [
  // Türkçe büyük İ, büyük-küçük harf duyarsız eşleşmede i sayılmaz; ikisi de yazılır.
  /[iİ]zlediğiniz [iİ]çin teşekkür ederim\.?/giu,
  /altyazı m\.?k\.?/giu,
  /abone olmayı unutmayın!?/giu,
  /bir sonraki videoda görüşmek üzere\.?/giu,
]

/**
 * whisper çıktısı: satırlar tek metin; sessizlik ve ses etiketleri ([BLANK_AUDIO], (müzik), *gürültü*) ve bilinen
 * uydurma cümleler atılır.
 */
export function cleanTranscript(stdout: string): string {
  return HALLUCINATIONS.reduce((text, pattern) => text.replace(pattern, ' '), stdout)
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Turbonun hızı: çeviri süresinin ses süresine oranı, son ölçümlere ağırlık veren ortalama. İlk ölçüm doğrudan alınır.
 */
export function nextPace(previous: number | null, elapsedMs: number, audioMs: number): number {
  const pace = elapsedMs / Math.max(audioMs, 1)
  return previous === null ? pace : previous * 0.6 + pace * 0.4
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0))
    })
  })

/** Tek modelli whisper-server süreci: ilk istekte açılır, boşta kapanır. */
class WhisperProcess {
  private child: ChildProcess | null = null
  private port = 0
  private starting: Promise<void> | null = null
  private idle: ReturnType<typeof setTimeout> | undefined
  busy = false

  constructor(
    private readonly binary: string,
    readonly model: string,
    private readonly vad: string,
  ) {}

  async infer(wav: Uint8Array): Promise<string> {
    this.busy = true
    clearTimeout(this.idle)
    try {
      await this.start()
      const form = new FormData()
      form.append('file', new Blob([wav.slice()], { type: 'audio/wav' }), 'kayit.wav')
      form.append('response_format', 'json')
      form.append('temperature', '0')
      const response = await fetch(`http://127.0.0.1:${this.port}/inference`, { method: 'POST', body: form })
      if (!response.ok) throw new ArgusError('SES_CEVRILEMEDI', `Ses yazıya çevrilemedi (${response.status}).`)
      const { text } = (await response.json()) as { text?: string }
      return cleanTranscript(text ?? '')
    } finally {
      this.busy = false
      this.idle = setTimeout(() => this.stop(), IDLE_MS)
    }
  }

  private start(): Promise<void> {
    if (this.child && this.child.exitCode === null) return Promise.resolve()
    this.starting ??= (async () => {
      this.port = await freePort()
      const threads = String(Math.max(2, Math.min(8, cpus().length - 2)))
      const child = spawn(
        this.binary,
        [
          ...['-m', this.model, '--host', '127.0.0.1', '--port', String(this.port)],
          ...['-l', 'tr', '-nt', '-ac', '512', '-t', threads, '-sns', '--prompt', VOCABULARY],
          // Silero VAD: konuşma olmayan kısımlar modele gitmez (gürültüde uydurma cümle üretiyordu).
          ...(existsSync(this.vad) ? ['--vad', '-vm', this.vad] : []),
        ],
        { windowsHide: true, stdio: 'ignore' },
      )
      this.child = child
      child.once('exit', () => {
        if (this.child === child) this.child = null
      })
      const deadline = Date.now() + START_MS
      while (Date.now() < deadline && child.exitCode === null) {
        const up = await fetch(`http://127.0.0.1:${this.port}/`).then(
          (r) => r.ok,
          () => false,
        )
        if (up) return
        await new Promise((r) => setTimeout(r, 250))
      }
      this.stop()
      throw new ArgusError('SES_BASLAMADI', 'Sesli yazım motoru açılamadı; data/whisper kurulumunu denetleyin.')
    })().finally(() => (this.starting = null))
    return this.starting
  }

  stop(): void {
    clearTimeout(this.idle)
    this.child?.kill()
    this.child = null
  }
}

export class SpeechEngine {
  private readonly accurate: WhisperProcess
  private readonly quick: WhisperProcess
  private queue: Promise<unknown> = Promise.resolve()
  /** Turbonun ölçülen hızı (çeviri süresi / ses süresi); ölçülmeden null. */
  private pace: number | null = null

  constructor(private readonly dataDir: string) {
    const binary = join(dataDir, 'whisper', 'bin', process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server')
    const vad = join(dataDir, 'whisper', VAD)
    this.accurate = new WhisperProcess(binary, join(dataDir, 'whisper', ACCURATE), vad)
    this.quick = new WhisperProcess(binary, join(dataDir, 'whisper', QUICK), vad)
  }

  private get binary() {
    return join(this.dataDir, 'whisper', 'bin', process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server')
  }

  /** Program ve doğru model yerinde mi (küçük model isteğe bağlıdır). */
  ready(): boolean {
    return existsSync(this.binary) && existsSync(this.accurate.model)
  }

  /**
   * Cümleyi çevirir. Geçici istek: turbo yavaşsa (ya da hızı henüz ölçülmediyse ve bilgisayar zayıfsa) küçük modelle;
   * seçilen model meşgulse beklemeden null döner. Kesin istek turboyla, sırasını bekleyerek.
   */
  async transcribe(wav: Uint8Array, interim: boolean): Promise<string | null> {
    if (!this.ready())
      throw new ArgusError('SES_KURULU_DEGIL', 'Sesli yazım kurulu değil: data/whisper altında program ya da model yok.')
    if (interim) {
      const slow = this.pace !== null && this.pace > SLOW_PACE
      const target = slow && existsSync(this.quick.model) ? this.quick : this.accurate
      return target.busy ? null : target.infer(wav)
    }
    const job = this.queue.then(async () => {
      const started = Date.now()
      const text = await this.accurate.infer(wav)
      // Ses süresi: 44 baytlık başlıktan sonra 16 kHz, 16 bit tek kanal (32 bayt/ms).
      this.pace = nextPace(this.pace, Date.now() - started, (wav.length - 44) / 32)
      return text
    })
    this.queue = job.catch(() => undefined)
    return job
  }

  /** Motorları kapatır (Argus kapanırken). */
  stop(): void {
    this.accurate.stop()
    this.quick.stop()
  }
}
