<script lang="ts">
  import { flip } from 'svelte/animate'
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'
  import Icon from '$lib/components/Icon.svelte'
  import type { IconName } from '$lib/icons'
  import type { Notice, NoticeTone } from '$lib/notices'
  import { notify } from '$lib/notify.svelte'

  /**
   * Bildirimler: sayfa başlığının hemen altında, sağda (eylem düğmelerinin altı) üst üste en çok üç kart.
   * - Görünüm: platformun "soft" toast'ı — tonun açık zemini ve renkli kenarı (beyaz sayfada belirgin), solda tonun
   *   ikonu, başlık (14/600) ve açıklama (13), sağda kapat; altta tonun renginde geri sayım çizgisi.
   * - Hareket: sağ kenardan kayarak girer, sağa kayarak çıkar; diğer kartlar yerlerine yumuşakça kayar (flip).
   *   Aynı bildirim tekrar gelirse kart yerinde kalır (yeniden çizilmez, sıçramaz): "×n" artar, kısa bir vurgu yapar,
   *   sayaç baştan başlar.
   * - Üzerine gelince sayaç durur, ayrılınca kalan süreden sürer. Hata ve uyarı ekran okuyucuya hemen (`alert`),
   *   diğerleri sırası gelince (`status`) okunur.
   */
  const TONES: Record<
    NoticeTone,
    { icon: IconName; label: string; color: string; bg: string; border: string; text: string }
  > = {
    success: {
      icon: 'checkCircle',
      label: 'Başarılı',
      color: '#16A34A',
      bg: '#F0FDF4',
      border: '#BBF7D0',
      text: '#14532D',
    },
    info: {
      icon: 'info',
      label: 'Bilgi',
      color: '#0C66E4',
      bg: '#EFF6FF',
      border: '#BFDBFE',
      text: '#0B3E99',
    },
    warning: {
      icon: 'warning',
      label: 'Uyarı',
      color: '#D97706',
      bg: '#FFFBEB',
      border: '#FCD34D',
      text: '#78350F',
    },
    error: {
      icon: 'error',
      label: 'Hata',
      color: '#DC2626',
      bg: '#FEF2F2',
      border: '#FECACA',
      text: '#7F1D1D',
    },
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

<div class="pointer-events-none flex w-[380px] max-w-[calc(100vw-32px)] flex-col gap-2">
  {#each notify.items as notice (notice.id)}
    {@const tone = TONES[notice.tone]}
    <div
      role={notice.tone === 'error' || notice.tone === 'warning' ? 'alert' : 'status'}
      aria-label={tone.label}
      class="group pointer-events-auto relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-lg border py-3 pr-2.5 pl-3.5 shadow-[0_10px_28px_-8px_rgba(15,23,42,0.22),0_2px_6px_rgba(15,23,42,0.08)]"
      style="background: {tone.bg}; border-color: {tone.border}"
      in:fly={{ x: 40, duration: 260, easing: cubicOut }}
      out:fly={{ x: 40, duration: 200, easing: cubicOut }}
      animate:flip={{ duration: 220, easing: cubicOut }}
      use:countdown={notice}
    >
      {#key notice.key}
        {#if notice.count > 1}<span
            class="notice-bump absolute inset-0 rounded-[inherit]"
            style="--bump: {tone.color}"
          ></span>{/if}
      {/key}
      <span class="relative mt-px flex" style="color: {tone.color}"
        ><Icon name={tone.icon} class="size-5" /></span
      >
      <div class="relative flex min-w-0 flex-col gap-0.5 text-left">
        <p class="flex items-baseline gap-2 text-sm leading-5 font-semibold" style="color: {tone.text}">
          {notice.title}
          {#if notice.count > 1}
            <span class="rounded-full px-1.5 text-xs font-semibold" style="background: {tone.border}"
              >×{notice.count}</span
            >
          {/if}
        </p>
        {#if notice.message}
          <p class="text-[13px] leading-[18px] break-words text-[#3F3F46]">{notice.message}</p>
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
            class="notice-progress absolute bottom-0 left-0 h-[3px] w-full origin-left opacity-70 group-hover:[animation-play-state:paused]"
            style="background: {tone.color}; animation-duration: {notice.duration}ms"
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
    box-shadow: inset 0 0 0 1.5px var(--bump);
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
