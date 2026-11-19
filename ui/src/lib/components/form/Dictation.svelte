<script lang="ts">
  import { onDestroy } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import { api } from '$lib/api'
  import { composeText, stripVoiceNote, Utterance, withVoiceNote } from '$lib/dictation'
  import { notify } from '$lib/notify.svelte'
  import { cn } from '$lib/utils'
  import { downsample, encodeWav, SPEECH_RATE } from '$lib/wav'

  /**
   * Konuşarak yazma (metin alanının altındaki şeridin sağı): mikrofona bas, konuştukça metin alana yazılır, bitir'e bas.
   * Konuşurken düğme sesin seviyesine göre hareket eden dalga çubuklarına döner (dinlendiği ve işlendiği görülür);
   * çubuklar saniyede ~16 kez güncellenir, ses verisi tutulmaz.
   * Ses bilgisayardan çıkmaz: mikrofon 16 kHz'te dinlenir, konuşma duraksamalardan cümlelere bölünür (`Utterance`) ve
   * cümleler Argus sunucusundaki yerel Whisper'a gider (`server/src/speech/whisper.ts`). Süren cümle sık sık geçici
   * olarak çevrilip alana yazılır; duraksayınca kesinleşir. Sessizlik gönderilmez.
   *
   * Zayıf bilgisayar için: aynı anda tek geçici istek uçar; yanıt gelmeden yenisi gönderilmez, yani güncelleme sıklığı
   * bilgisayarın hızına kendiliğinden uyar. Kesin çeviriler sırayla bekler, hiçbiri kaybolmaz. Kayıt sürerken alan salt
   * okunurdur (`onrecording`); kayıt bitince düzenlenebilir. Mikrofon izni yoksa ya da motor kurulu değilse nedeni
   * bildirim olur.
   */
  let {
    value,
    onupdate,
    onrecording,
  }: {
    /** Alanın kayıt başlarkenki metni; konuşulanlar bunun sonuna eklenir. */
    value: string
    /** Alanın yeni metni ve içindeki geçici (henüz kesinleşmemiş) kısım; görünüm onu italik ve soluk çizer. */
    onupdate: (text: string, interim: string) => void
    onrecording?: (recording: boolean) => void
  } = $props()

  const INTERIM_EVERY_MS = 900
  const MIN_INTERIM_MS = 800

  const BARS = 14
  let phase = $state<'hazir' | 'dinliyor' | 'bitiriyor'>('hazir')
  /** Dalga çubuklarının seviyeleri (0-1), en yenisi sağda. */
  let levels = $state<number[]>(Array(BARS).fill(0))
  let peak = 0
  let lastLevel = 0
  let seconds = $state(0)
  let stream: MediaStream | null = null
  let context: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  let utterance: Utterance | null = null
  let prefix = ''
  let committed: string[] = []
  let interim = ''
  let interimBusy = false
  let lastInterim = 0
  /** Geçici yanıtın ait olduğu cümle: cümle kesinleşince geç gelen geçici yanıt atılır. */
  let sentence = 0
  let finals: Promise<void> = Promise.resolve()

  // Sesle yazılan metnin sonuna not eklenir (`VOICE_NOTE`): çeviri hatalarını girdiyi okuyan modele söyler.
  const show = () => onupdate(withVoiceNote(composeText(prefix, committed, interim)), interim)

  /** Konuşma sürerken yapıştırılan metin: kesinleşen metnin sonuna, süren cümlenin önüne girer. */
  export function insert(text: string) {
    if (phase !== 'dinliyor' || !text.trim()) return
    committed = [...committed, text.trim()]
    show()
  }

  async function request(samples: Float32Array, rate: number, interimOnly: boolean): Promise<string | null> {
    const wav = encodeWav(downsample(samples, rate, SPEECH_RATE), SPEECH_RATE)
    const { metin } = await api<{ metin: string | null }>(`/ses${interimOnly ? '?asama=gecici' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: wav,
    })
    return metin
  }

  function finalize(rate: number) {
    if (!utterance) return
    const audio = utterance.audio()
    utterance.reset()
    sentence += 1
    if (audio.length < (rate * 300) / 1000) return
    finals = finals.then(async () => {
      const text = await request(audio, rate, false).catch((e: unknown) => {
        notify.error('Ses yazıya çevrilemedi', e instanceof Error ? e.message : String(e))
        return null
      })
      interim = ''
      if (text) committed = [...committed, text]
      show()
    })
  }

  function onAudio(chunk: Float32Array, rate: number) {
    if (!utterance) return
    let energy = 0
    for (const sample of chunk) energy += sample * sample
    peak = Math.max(peak, Math.sqrt(energy / chunk.length))
    if (performance.now() - lastLevel > 60) {
      lastLevel = performance.now()
      levels = [...levels.slice(1), Math.min(1, peak * 9)]
      peak = 0
    }
    const state = utterance.push(chunk)
    if (state === 'bitti') return finalize(rate)
    if (state !== 'suruyor' || interimBusy || Date.now() - lastInterim < INTERIM_EVERY_MS) return
    const audio = utterance.audio()
    if (audio.length < (rate * MIN_INTERIM_MS) / 1000) return
    interimBusy = true
    lastInterim = Date.now()
    const mine = sentence
    void request(audio, rate, true)
      .then((text) => {
        if (text && mine === sentence) {
          interim = text
          show()
        }
      })
      .catch(() => undefined)
      .finally(() => (interimBusy = false))
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
    } catch {
      return notify.error('Mikrofon açılamadı', 'Tarayıcıda bu sayfa için mikrofon iznini ver.')
    }
    // Tarayıcı sesi doğrudan 16 kHz verir (desteklemezse kendi hızında gelir, gönderirken düşürülür).
    context = new AudioContext({ sampleRate: SPEECH_RATE })
    const rate = context.sampleRate
    const worklet = URL.createObjectURL(
      new Blob(
        [
          `registerProcessor('argus-mic', class extends AudioWorkletProcessor {
            process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true }
          })`,
        ],
        { type: 'text/javascript' },
      ),
    )
    await context.audioWorklet.addModule(worklet)
    URL.revokeObjectURL(worklet)
    const node = new AudioWorkletNode(context, 'argus-mic')
    node.port.onmessage = (event: MessageEvent<Float32Array>) => onAudio(event.data, rate)
    context.createMediaStreamSource(stream).connect(node)
    prefix = stripVoiceNote(value)
    committed = []
    interim = ''
    sentence = 0
    utterance = new Utterance(rate)
    levels = Array(BARS).fill(0)
    phase = 'dinliyor'
    onrecording?.(true)
    seconds = 0
    timer = setInterval(() => (seconds += 1), 1000)
  }

  async function stop() {
    clearInterval(timer)
    phase = 'bitiriyor'
    const rate = context?.sampleRate ?? SPEECH_RATE
    stream?.getTracks().forEach((track) => track.stop())
    void context?.close()
    stream = null
    context = null
    finalize(rate)
    utterance = null
    await finals
    phase = 'hazir'
    onrecording?.(false)
  }

  function toggle() {
    if (phase === 'hazir') void start()
    else if (phase === 'dinliyor') void stop()
  }

  onDestroy(() => {
    clearInterval(timer)
    stream?.getTracks().forEach((track) => track.stop())
    void context?.close()
  })

  const time = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`)
</script>

{#if phase === 'hazir'}
  <button
    type="button"
    onclick={toggle}
    aria-label="Konuşarak yaz"
    title="Konuşarak yaz"
    class="grid size-8 place-items-center rounded-full bg-[#e9f2ff] text-[#0c66e4] transition-colors outline-none hover:bg-[#cce0ff] focus-visible:ring-2 focus-visible:ring-[#0c66e4]/30"
  >
    <Icon name="mic" class="size-[18px]" />
  </button>
{:else}
  <div
    class="inline-flex h-8 items-center gap-2 rounded-full bg-[#e9f2ff] pr-1 pl-3"
    role="status"
    aria-live="polite"
    aria-label={phase === 'dinliyor' ? 'Dinleniyor' : 'Yazıya çevriliyor'}
  >
    <span class="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {#each levels as level, i (i)}
        <span
          class={cn(
            'w-[3px] rounded-full transition-[height] duration-75',
            phase === 'dinliyor' ? 'bg-[#0c66e4]' : 'bg-[#0c66e4]/35',
          )}
          style="height: {Math.max(3, Math.round(level * 18))}px"
        ></span>
      {/each}
    </span>
    <span class="w-8 text-[12px] text-[#0055cc] tabular-nums">{time}</span>
    <button
      type="button"
      onclick={toggle}
      disabled={phase === 'bitiriyor'}
      aria-label="Konuşmayı bitir"
      title="Bitir"
      class="grid size-6 place-items-center rounded-full bg-[#0c66e4] text-white transition-opacity outline-none hover:bg-[#0055cc] focus-visible:ring-2 focus-visible:ring-[#0c66e4]/30 disabled:opacity-60"
    >
      {#if phase === 'bitiriyor'}
        <span class="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
      {:else}
        <span class="size-2 rounded-[2px] bg-current"></span>
      {/if}
    </button>
  </div>
{/if}
