<script lang="ts">
  import { untrack } from 'svelte'
  import { SEVERITY } from '$lib/format'
  import type { MonitorFinding } from '$lib/monitor'

  /**
   * Bulgunun anını duyuran küçük kart: oynatma (canlı ya da kayıt) bulgunun anına gelince sahnenin sağ üstünde belirir (ortadaki akışı kapatmaz), DURATION
   * boyunca kalır, kalan süreyi ince bir çubuk gösterir. Bulgu küçük bir elmas olarak kolayca kaçıyordu; izleyen kişi
   * "burada bunu buldu" anını açıkça görmeli. Karta tıklayınca bulgunun ayrıntısı açılır.
   */
  let {
    finding,
    caseLabel,
    age,
    duration,
    onopen,
  }: {
    finding: MonitorFinding
    caseLabel: string | null
    /** Bulgunun üstünden geçen süre (ms): kart sonradan açılırsa çubuk kaldığı yerden başlar. */
    age: number
    duration: number
    onopen: () => void
  } = $props()

  const HEADLINE = {
    kesin: 'Bulgu bulundu',
    tutarsizlik: 'Tutarsızlık bulundu',
    not: 'Şüphe not edildi',
  } as const
  /** Tuvalin koyu dilinde: renk yalnız tür etiketinde ve geri sayım çizgisinde. */
  const TONE = { kesin: '#ff7b72', tutarsizlik: '#f2b866', not: '#9aa4b4' } as const
  const tone = $derived(TONE[finding.event.kind])
  // Çubuk yalnız ilk açılışta konumlanır, sonra CSS ile akar (her karede yeniden çizilmez).
  const startAge = untrack(() => age)
</script>

<button
  type="button"
  onclick={onopen}
  title="Ayrıntıyı aç"
  class="toast pointer-events-auto absolute top-3 right-3 z-20 grid w-[min(300px,calc(100%-24px))] gap-1 overflow-hidden rounded-lg bg-[#1a202b]/95 px-3 pt-2 pb-2.5 text-left shadow-[0_10px_28px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.06]"
  style={`--bar:${tone}`}
>
  <span class="flex items-center gap-1.5 text-[10px] font-bold tracking-[.08em] uppercase">
    <span style={`color:${tone}`}>{HEADLINE[finding.event.kind]}</span>
    <span
      class="font-medium tracking-normal text-[#7d8698] normal-case"
      title={SEVERITY[finding.event.severity].hint}
      >· {finding.event.severity}{#if caseLabel}
        · {caseLabel}{/if}</span
    >
  </span>
  <span class="line-clamp-2 text-[12.5px] leading-[17px] font-semibold text-[#eef1f6]"
    >{finding.event.title}</span
  >
  <span class="absolute inset-x-0 bottom-0 block h-[2px] bg-white/[0.06]">
    <span
      class="countdown block h-full"
      style={`animation-duration:${duration}ms; animation-delay:-${startAge}ms`}
    ></span>
  </span>
</button>

<style>
  .toast {
    animation: drop 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes drop {
    from {
      opacity: 0;
      translate: 10px 0;
    }
  }
  .countdown {
    background: var(--bar);
    transform-origin: left center;
    animation-name: countdown;
    animation-timing-function: linear;
    animation-fill-mode: both;
  }
  @keyframes countdown {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast,
    .countdown {
      animation: none;
    }
  }
</style>
