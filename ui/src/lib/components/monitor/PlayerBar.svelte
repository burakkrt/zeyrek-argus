<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import type { IconName } from '$lib/icons'
  import { formatClock } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Oynatma çubuğu (videonun hemen altında, alçak): solda 10 sn geri · oynat/duraklat · 10 sn ileri ve süre, ortada o
   * anki eylem ("Tıkladı · “Vazgeç”" + neden), sağa yaslı kompakt araçlar: canlıya dönüş, yakınlaştırma, hız (yukarı
   * açılan küçük seçici), bu anın bağlantısı, tam ekran. Denetimler tek boyutta (32 px) ve tek ikon ailesinden. Dar
   * genişlikte ikincil düğmeler gizlenir.
   */
  let {
    playing,
    position,
    duration,
    action,
    running,
    live,
    speed,
    zoomed,
    fullscreen,
    copied,
    onplay,
    onseekby,
    onlive,
    onspeed,
    onzoom,
    oncopy,
    onfullscreen,
  }: {
    playing: boolean
    position: number
    duration: number
    /** O anki eylem; `tone` ikonun rengini verir. */
    action: { icon: IconName; title: string; detail: string; tone: 'eylem' | 'bekliyor' | 'bulgu' | 'hata' }
    running: boolean
    live: boolean
    speed: number
    zoomed: boolean
    fullscreen: boolean
    copied: boolean
    onplay: () => void
    onseekby: (delta: number) => void
    onlive: () => void
    onspeed: (speed: number) => void
    onzoom: () => void
    oncopy: () => void
    onfullscreen: () => void
  } = $props()

  const SPEEDS = [4, 2, 1.5, 1, 0.5]
  const TONE = {
    eylem: 'text-brand',
    bekliyor: 'text-muted-foreground',
    bulgu: 'text-destructive',
    hata: 'text-destructive',
  }
  const control =
    'group text-foreground/75 hover:bg-black/[0.05] hover:text-foreground relative grid size-8 shrink-0 place-items-center rounded-lg transition-colors'

  let speedOpen = $state(false)
  let speedBox = $state<HTMLDivElement | null>(null)
</script>

<!-- Açık renkli ipucu: üzerine gelince kısa gecikmeyle düğmenin üstünde (sağ uçtakiler sağa yaslı). -->
{#snippet hint(text: string, edge = false)}
  <span
    class={cn(
      'text-foreground pointer-events-none absolute bottom-[calc(100%+8px)] z-30 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-normal whitespace-nowrap opacity-0 shadow-[0_4px_12px_rgb(16_24_40/0.10)] transition-opacity delay-300 duration-150 group-hover:opacity-100',
      edge ? 'right-0' : 'left-1/2 -translate-x-1/2',
    )}>{text}</span
  >
{/snippet}

<svelte:window
  onpointerdown={(e) => speedOpen && !speedBox?.contains(e.target as Node) && (speedOpen = false)}
/>

<div class="@container bg-surface-alt flex h-12 items-center gap-1 border-t px-2.5">
  <button type="button" class={control} aria-label="10 sn geri" onclick={() => onseekby(-10_000)}>
    <Icon name="mediaBack" class="size-5" />
    {@render hint('10 sn geri (J)')}
  </button>
  <button
    type="button"
    class="group bg-brand hover:bg-brand-strong relative grid size-9 shrink-0 place-items-center rounded-full text-white transition-colors"
    aria-label={playing ? 'Duraklat' : 'Oynat'}
    onclick={onplay}
  >
    <Icon name={playing ? 'mediaPause' : 'mediaPlay'} class={cn('size-[22px]', !playing && 'ml-0.5')} />
    {@render hint(playing ? 'Duraklat (Boşluk)' : 'Oynat (Boşluk)')}
  </button>
  <button type="button" class={control} aria-label="10 sn ileri" onclick={() => onseekby(10_000)}>
    <Icon name="mediaForward" class="size-5" />
    {@render hint('10 sn ileri (L)')}
  </button>
  <span class="tabular mx-2 shrink-0 text-[13px] whitespace-nowrap">
    <span class="font-semibold">{formatClock(position)}</span>
    <span class="text-muted-foreground"> / {formatClock(duration)}</span>
  </span>

  <div class="flex min-w-0 flex-1 items-center gap-2 border-l pl-3">
    {#if action.tone === 'bekliyor'}
      <span class="border-border border-t-muted-foreground size-4 shrink-0 animate-spin rounded-full border-2"
      ></span>
    {:else}
      <Icon name={action.icon} class={cn('size-[18px]', TONE[action.tone])} />
    {/if}
    <p class="min-w-0 truncate text-[13px] leading-5">
      <span class="font-semibold">{action.title}</span>
      {#if action.detail}<span class="text-muted-foreground"> · {action.detail}</span>{/if}
    </p>
  </div>

  <div class="flex shrink-0 items-center gap-0.5 pl-2">
    {#if running}
      <button
        type="button"
        disabled={live}
        class={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium',
          live ? 'border-success/30 bg-success/10 text-success' : 'hover:bg-black/[0.05]',
        )}
        onclick={onlive}
      >
        <span class={cn('size-1.5 rounded-full', live ? 'bg-success animate-pulse' : 'bg-muted-foreground')}
        ></span>
        Canlı
      </button>
    {/if}
    <button
      type="button"
      class={cn(control, zoomed && 'bg-brand/10 text-brand hover:bg-brand/[0.14] hover:text-brand')}
      aria-label={zoomed ? 'Otomatik yakınlaştırmayı kapat' : 'Otomatik yakınlaştırmayı aç'}
      aria-pressed={zoomed}
      onclick={onzoom}
    >
      <Icon name="mediaZoom" class="size-5" />
      {@render hint('Otomatik yakınlaştırma')}
    </button>

    <div bind:this={speedBox} class="relative hidden shrink-0 @[720px]:block">
      <button
        type="button"
        class={cn(
          control,
          'tabular text-[12px] font-semibold',
          speedOpen && 'text-foreground bg-black/[0.05]',
        )}
        aria-label="Oynatma hızı"
        aria-expanded={speedOpen}
        onclick={() => (speedOpen = !speedOpen)}
        >{speed.toLocaleString('tr')}×{#if !speedOpen}{@render hint('Oynatma hızı')}{/if}</button
      >
      {#if speedOpen}
        <div
          class="bg-popover animate-in fade-in-0 slide-in-from-bottom-1 absolute bottom-[calc(100%+6px)] left-1/2 z-20 grid w-12 -translate-x-1/2 gap-0.5 rounded-lg border p-1 shadow-md"
          role="menu"
        >
          {#each SPEEDS as option (option)}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={option === speed}
              class={cn(
                'tabular h-7 rounded-md text-[12.5px]',
                option === speed ? 'bg-brand-soft text-brand-strong font-semibold' : 'hover:bg-zinc-100',
              )}
              onclick={() => {
                onspeed(option)
                speedOpen = false
              }}>{option.toLocaleString('tr')}×</button
            >
          {/each}
        </div>
      {/if}
    </div>

    <button
      type="button"
      class={cn(control, 'hidden @[720px]:grid', copied && 'text-success')}
      aria-label={copied ? 'Bağlantı kopyalandı' : 'Bu anın bağlantısını kopyala'}
      onclick={oncopy}
    >
      <Icon name={copied ? 'check' : 'mediaLink'} class="size-5" />
      {@render hint('Bu anın bağlantısını kopyala')}
    </button>
    <button
      type="button"
      class={control}
      aria-label={fullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
      onclick={onfullscreen}
    >
      <Icon name={fullscreen ? 'mediaFullExit' : 'mediaFull'} class="size-5" />
      {@render hint('Tam ekran (F)', true)}
    </button>
  </div>
</div>
