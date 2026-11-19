<script lang="ts">
  import { flip } from 'svelte/animate'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import Icon from '$lib/components/Icon.svelte'
  import type { Notice, NoticeTone } from '$lib/notices'
  import { notify } from '$lib/notify.svelte'

  /**
   * Bildirimler: sayfa başlığının hemen altında, sağda (eylem düğmelerinin altı) üst üste en çok üç kart.
   * - Görünüm: simgesiz kart; ton yalnız zeminin çok hafif renginde ve onunla uyumlu kenarda (başarı yeşil, bilgi
   *   mavi, uyarı amber, hata kırmızı; açık sayfa zemininden ayrılsın diye beyaz değil). Başlık 14/600 koyu (#101828),
   *   açıklama 13/19 ikincil (#475467); sağda kapat. Alttaki geri sayım çizgisi nötr gridir.
   * - Sayfa değişince hepsi kapanır (`App.svelte` → `notify.clear()`).
   * - Hareket: sağ kenardan kayarak girer, sağa kayarak çıkar; diğer kartlar yerlerine yumuşakça kayar (flip).
   *   Aynı bildirim tekrar gelirse kart yerinde kalır (yeniden çizilmez, sıçramaz): "×n" artar, kısa bir vurgu yapar,
   *   sayaç baştan başlar.
   * - Üzerine gelince sayaç durur, ayrılınca kalan süreden sürer. Hata ve uyarı ekran okuyucuya hemen (`alert`),
   *   diğerleri sırası gelince (`status`) okunur.
   */
  const TONES: Record<NoticeTone, { label: string; bg: string; border: string }> = {
    success: { label: 'Başarılı', bg: '#F3FAF6', border: '#C9E7D6' },
    info: { label: 'Bilgi', bg: '#F3F7FD', border: '#CCDDF5' },
    warning: { label: 'Uyarı', bg: '#FFFAF0', border: '#F4DDB0' },
    error: { label: 'Hata', bg: '#FEF6F5', border: '#F5CFCB' },
  }

  /** Kartın sayacı: başlar, üzerine gelince durur, kalan süreden sürer; aynı bildirim tekrar gelince baştan başlar. */
  function countdown(node: HTMLElement, notice: Notice) {
    let current = notice
    let remaining = 0
    let startedAt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      clearTimeout(timer)
      if (!current.duration) return
      startedAt = Date.now()
      timer = setTimeout(() => notify.dismiss(current.id), remaining)
    }
    const reset = () => {
      remaining = current.duration
      run()
    }
    const pause = () => {
      clearTimeout(timer)
      remaining -= Date.now() - startedAt
    }
    node.addEventListener('mouseenter', pause)
    node.addEventListener('mouseleave', run)
    reset()
    return {
      update(next: Notice) {
        const repeated = next.key !== current.key
        current = next
        if (repeated) reset()
      },
      destroy() {
        clearTimeout(timer)
        node.removeEventListener('mouseenter', pause)
        node.removeEventListener('mouseleave', run)
      },
    }
  }
</script>

<div class="pointer-events-none flex w-[400px] max-w-[calc(100vw-32px)] flex-col gap-2.5">
  {#each notify.items as notice (notice.id)}
    {@const tone = TONES[notice.tone]}
    <div
      role={notice.tone === 'error' || notice.tone === 'warning' ? 'alert' : 'status'}
      aria-label={tone.label}
      class="group pointer-events-auto relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-[10px] border py-3 pr-3 pl-4 shadow-[0_12px_32px_-12px_rgba(16,24,40,0.28),0_2px_6px_rgba(16,24,40,0.06)]"
      style="background: {tone.bg}; border-color: {tone.border}"
      in:fly={{ x: 40, duration: 260, easing: cubicOut }}
      out:fly={{ x: 40, duration: 200, easing: cubicOut }}
      animate:flip={{ duration: 220, easing: cubicOut }}
      use:countdown={notice}
    >
      {#key notice.key}
        {#if notice.count > 1}<span
            class="notice-bump absolute inset-0 rounded-[inherit]"
            style="--bump: {tone.border}"
          ></span>{/if}
      {/key}
      <div class="relative flex min-w-0 flex-col gap-0.5 text-left">
        <p class="flex items-baseline gap-2 text-sm leading-5 font-semibold text-[#101828]">
          {notice.title}
          {#if notice.count > 1}
            <span class="rounded-full bg-black/[0.06] px-1.5 text-xs font-semibold text-[#344054]">×{notice.count}</span>
          {/if}
        </p>
        {#if notice.message}
          <p class="text-[13px] leading-[19px] break-words text-[#475467]">{notice.message}</p>
        {/if}
      </div>
      <button
        type="button"
        aria-label="Bildirimi kapat"
        title="Kapat"
        class="relative grid size-6 place-items-center rounded-md text-[#52525B] transition-colors hover:bg-black/[0.06] hover:text-[#18181B]"
        onclick={() => notify.dismiss(notice.id)}
      >
        <Icon name="close" class="size-4" />
      </button>
      {#if notice.duration}
        {#key notice.key}
          <span
            class="notice-progress absolute bottom-0 left-0 h-[2px] w-full origin-left bg-black/15 group-hover:[animation-play-state:paused]"
            style="animation-duration: {notice.duration}ms"
          ></span>
        {/key}
      {/if}
    </div>
  {/each}
</div>

<style>
  .notice-progress {
    animation-name: notice-countdown;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes notice-countdown {
    from {
      transform: scaleX(1);
    }
    to {
      transform: scaleX(0);
    }
  }

  /* Tekrar gelen bildirimin kısa vurgusu: kart yerinde kalır, kenarı bir an tonun rengiyle parlar. */
  .notice-bump {
    pointer-events: none;
    box-shadow: inset 0 0 0 1.5px var(--bump), 0 0 0 1px var(--bump);
    opacity: 0;
    animation: notice-bump 600ms ease-out;
  }

  @keyframes notice-bump {
    0%,
    30% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
</style>
