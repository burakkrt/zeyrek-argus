<script lang="ts">
  import type { FindingKind, PlatformRead, StepTarget } from '@argus/shared'
  import { fade } from 'svelte/transition'
  import Icon from '$lib/components/Icon.svelte'
  import PlatformPanel from '$lib/components/monitor/PlatformPanel.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { FINDING_TONE, type PointerState, type ZoomState } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Sahne: kayıt (16:10) gri tuvalin üstünde bir pencere gibi durur (ince kenar, yumuşak gölge) ve tuvale iki yönde
   * de sığar (kabın `container-type: size` olmalı); kayıttaki sayfa ne renkte olursa olsun çevreden ayrışır. YouTube gibi: tek tık anında oynat/duraklat
   * (duraklatılınca ortada sade oynat düğmesi), sağ ya da sol yarıya çift tık 10 sn ileri/geri (kenardan gradyanla
   * geri bildirim, art arda tıklar birikir). Kare kanvasa çizilir; yeni kare yüklenmeden eskisi silinmez (görüntü
   * yanıp sönmez). İmleç, hedef çerçevesi, tıklama halkası ve yakınlaştırma (`pointerAt`, `zoomAt`) hesaptır; burada
   * yalnız çizilir. Görüntü ve imleç aynı "kamera" katmanında büyür, imleç ters ölçeklenir. Durum katmanları: bekleme
   * durumu (düşünüyor / plan), tarayıcı penceresi, seçili bulgunun yeri, duraklatma ve koşunun bitiş kartı.
   */
  let {
    src,
    prefetch = [],
    pointer,
    zoom,
    dialog,
    platform = null,
    status,
    chip,
    finding,
    paused,
    ending,
    placeholder,
    ontoggle,
    onseekby,
    onrestart,
  }: {
    src: string | null
    /** Sırada gösterilecek kareler: önceden indirilir ki oynatma takılmasın. */
    prefetch?: string[]
    pointer: PointerState | null
    zoom: ZoomState
    /** Bu anda açılan tarayıcı penceresinin metni ve kontrolcünün yanıtı. */
    dialog: string | null
    /** O anki adım platform okumasıysa: kare yerine okunan tanım gösterilir. */
    platform?: { read: PlatformRead; failed: boolean } | null
    /** Ekran durgunken ne olduğu ("Yapay zekâ sonraki adımı seçiyor · 6 sn"). */
    status: string | null
    /** Sol üstte bilgi rozeti (ör. eski koşunun adım görüntüleri). */
    chip: string | null
    /** Seçili bulgunun ekrandaki yeri (görünüm alanına oranla). */
    finding: { box: StepTarget | null; kind: FindingKind; title: string } | null
    paused: boolean
    /** Koşu yarıda kaldıysa kaydın sonunda gösterilen kart. */
    ending: { title: string; message: string } | null
    placeholder: string
    ontoggle: () => void
    /** Göreli sarma (ms; eksi geri). */
    onseekby: (delta: number) => void
    onrestart: () => void
  } = $props()

  const WIDTH = 1280
  const HEIGHT = 800
  const CACHE = 240
  const SEEK_MS = 10_000

  let canvas = $state<HTMLCanvasElement | null>(null)
  let frame = $state<HTMLDivElement | null>(null)
  let seek = $state<{ forward: boolean; seconds: number; key: number } | null>(null)
  let seekTimer: ReturnType<typeof setTimeout> | undefined

  // Tık beklemeden işler (gecikme yok). Çift tıkın ilk tıkı oynat/duraklat yapmıştır: çift tıkta geri alınır, durum
  // değişmeden sarılır. Art arda çift tıklar birikir (+10, +20, +30 sn).
  function onClick(event: MouseEvent) {
    if (ending || event.detail > 1) return
    ontoggle()
  }

  function onDoubleClick(event: MouseEvent) {
    if (ending) return
    ontoggle()
    // Konum görüntü kutusunun kendisinden ölçülür (aktarılan olayda currentTarget bu kutu olmayabilir).
    if (!frame) return
    const box = frame.getBoundingClientRect()
    const forward = event.clientX - box.left > box.width / 2
    const seconds = seek?.forward === forward ? seek.seconds + SEEK_MS / 1000 : SEEK_MS / 1000
    seek = { forward, seconds, key: Date.now() }
    clearTimeout(seekTimer)
    seekTimer = setTimeout(() => (seek = null), 650)
    onseekby(forward ? SEEK_MS : -SEEK_MS)
  }
  let drawn = $state(false)
  const cache = new Map<string, HTMLImageElement>()
  let wanted: string | null = null

  function image(url: string): HTMLImageElement {
    let img = cache.get(url)
    if (img) {
      // Son kullanılan sona: önbellek dolunca en eski kare atılır.
      cache.delete(url)
      cache.set(url, img)
      return img
    }
    img = new Image()
    img.decoding = 'async'
    img.src = url
    cache.set(url, img)
    if (cache.size > CACHE) cache.delete(cache.keys().next().value!)
    return img
  }

  function draw(img: HTMLImageElement) {
    const context = canvas?.getContext('2d')
    if (!context) return
    context.drawImage(img, 0, 0, WIDTH, HEIGHT)
    drawn = true
  }

  $effect(() => {
    wanted = src
    if (!src || !canvas) return
    const url = src
    const img = image(url)
    if (img.complete && img.naturalWidth) draw(img)
    else img.onload = () => wanted === url && draw(img)
  })

  $effect(() => {
    for (const url of prefetch) image(url)
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="relative aspect-[16/10] w-[min(100cqw,calc(100cqh*1.6))] cursor-pointer overflow-hidden rounded-md bg-[#0b0f17] shadow-[0_0_0_1px_rgb(16_24_40/0.10),0_8px_24px_rgb(16_24_40/0.16)] select-none"
  bind:this={frame}
  onclick={onClick}
  ondblclick={onDoubleClick}
>
  <div
    class="absolute inset-0 will-change-transform"
    style={`transform:scale(${zoom.scale});transform-origin:${zoom.x * 100}% ${zoom.y * 100}%`}
  >
    <canvas
      bind:this={canvas}
      width={WIDTH}
      height={HEIGHT}
      class={cn('block size-full', !drawn && 'invisible', ending && 'brightness-50 saturate-50')}
    ></canvas>

    {#if finding?.box}
      {@const b = finding.box}
      <div
        class={cn(
          'pointer-events-none absolute rounded-[6px] border-2 border-dashed',
          FINDING_TONE[finding.kind].frame,
        )}
        style={`left:${b.x * 100}%;top:${b.y * 100}%;width:${b.width * 100}%;height:${b.height * 100}%`}
      >
        <span
          class={cn(
            'absolute right-[-2px] bottom-[calc(100%+6px)] max-w-[360px] truncate rounded-md px-2 py-0.5 text-xs font-medium text-white',
            FINDING_TONE[finding.kind].tag,
          )}
          style={`transform:scale(${1 / zoom.scale});transform-origin:100% 100%`}
          >{FINDING_TONE[finding.kind].label} · {finding.title}</span
        >
      </div>
    {/if}

    {#if pointer}
      {#if pointer.box}
        {@const b = pointer.box}
        <div
          class="border-brand/70 bg-brand/[0.06] pointer-events-none absolute rounded-[6px] border-[1.5px] shadow-[0_0_0_4px_rgb(12_102_228/0.10)]"
          style={`left:${b.x * 100}%;top:${b.y * 100}%;width:${b.width * 100}%;height:${b.height * 100}%;opacity:${pointer.boxOpacity}`}
        ></div>
      {/if}
      {#if pointer.ripple !== null}
        <span
          class="border-brand pointer-events-none absolute size-10 rounded-full border-2"
          style={`left:${pointer.x * 100}%;top:${pointer.y * 100}%;transform:translate(-50%,-50%) scale(${(0.35 + pointer.ripple * 1.1) / zoom.scale});opacity:${0.7 * (1 - pointer.ripple)}`}
        ></span>
      {/if}
      <svg
        class="pointer-events-none absolute size-6 drop-shadow-[0_2px_3px_rgb(16_24_40/0.35)]"
        style={`left:${pointer.x * 100}%;top:${pointer.y * 100}%;opacity:${pointer.opacity};transform:scale(${1 / zoom.scale}) translate(-3px,-2px);transform-origin:0 0`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M4 2.5 19.5 13l-6.6 1.1 3.9 7.4-2.6 1.3-3.8-7.4L5.6 20Z"
          fill="#111827"
          stroke="#fff"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
      </svg>
    {/if}
  </div>

  {#if platform}
    <PlatformPanel read={platform.read} failed={platform.failed} />
  {:else if !drawn}
    <div class="absolute inset-0 grid place-items-center text-sm text-white/70">{placeholder}</div>
  {/if}

  {#if dialog}
    <div
      class="bg-card animate-in fade-in-0 slide-in-from-top-2 absolute top-3 left-1/2 flex max-w-[70%] -translate-x-1/2 items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] shadow-lg"
    >
      <Icon name="info" class="text-brand mt-px size-4" />
      <div class="min-w-0">
        <p class="font-medium">Tarayıcı penceresi açıldı</p>
        <p class="text-muted-foreground truncate">{dialog}</p>
      </div>
    </div>
  {/if}

  {#if status}
    <span
      class="absolute bottom-4 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3.5 text-[12.5px] whitespace-nowrap text-white backdrop-blur"
    >
      <span class="size-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white"></span>{status}
    </span>
  {/if}

  {#if chip}
    <span
      class="pointer-events-none absolute top-2.5 left-2.5 inline-flex h-6 items-center rounded-full bg-black/55 px-2.5 text-[11.5px] text-white backdrop-blur"
      >{chip}</span
    >
  {/if}

  {#if paused && !ending}
    <div class="pointer-events-none absolute inset-0 grid place-items-center" in:fade={{ duration: 120 }}>
      <button
        type="button"
        aria-label="Oynat"
        class="pointer-events-auto grid size-14 place-items-center rounded-full bg-zinc-900/45 text-white shadow-[0_2px_10px_rgb(0_0_0/0.12)] ring-1 ring-white/35 backdrop-blur-md transition-[transform,background-color] duration-150 hover:scale-105 hover:bg-zinc-900/55"
        onclick={(e) => {
          e.stopPropagation()
          ontoggle()
        }}
      >
        <Icon name="mediaPlay" class="ml-0.5 size-8" />
      </button>
    </div>
  {/if}

  {#if seek}
    {#key seek.key}
      <div
        class={cn(
          'animate-out fade-out-0 fill-mode-forwards pointer-events-none absolute inset-y-0 flex w-2/5 items-center duration-[650ms] ease-in',
          seek.forward
            ? 'right-0 justify-end bg-gradient-to-l from-black/30 via-black/10 to-transparent pr-[8%]'
            : 'left-0 justify-start bg-gradient-to-r from-black/30 via-black/10 to-transparent pl-[8%]',
        )}
      >
        <span
          class="flex items-center gap-1.5 rounded-full bg-zinc-900/45 py-1.5 pr-3 pl-2 text-[13px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-md"
        >
          <Icon name={seek.forward ? 'mediaForward' : 'mediaBack'} class="size-5" />
          {seek.forward ? '+' : '−'}{seek.seconds} sn
        </span>
      </div>
    {/key}
  {/if}

  {#if ending}
    <div class="absolute inset-0 grid place-items-center p-6">
      <div class="bg-card grid max-w-[440px] gap-2 rounded-xl p-5 shadow-2xl">
        <p class="text-destructive flex items-center gap-2 text-[15px] font-semibold">
          <Icon name="error" class="size-5" />{ending.title}
        </p>
        <p class="text-muted-foreground text-[13px] leading-[19px]">{ending.message}</p>
        <div><Button variant="outline" onclick={onrestart}><Icon name="replay" />Baştan izle</Button></div>
      </div>
    </div>
  {/if}
</div>
