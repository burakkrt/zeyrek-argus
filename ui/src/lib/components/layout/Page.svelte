<script lang="ts">
  import type { Snippet } from 'svelte'
  import { pageLoad } from '$lib/page-load'
  import { cn } from '$lib/utils'

  /**
   * Sayfa (Zeyrek kabuğu): üst çubuğun hemen altında yapışkan, kenardan kenara beyaz başlık şeridi (68 px; başlık
   * 22/600/28, açıklama 12.5/18 ikincil renk, aralarında 2 px; sağda 38 px eylem düğmeleri) ve altında içerik
   * kapsayıcısı (en çok 1480 px, 28 px yan, 24 px dikey boşluk, bölümler arası 20 px). `title` verilmezse şerit
   * çizilmez (henüz taşınmamış sayfalar). Sayfa kendi kenar boşluğunu yazmaz.
   *
   * Açılış yüklemesi sürerken (`page-load.ts`) içerik gizli kalır ve ortada spinner döner (platformun sayfa kabı
   * yükleniyor hâli); veri gelince içerik tek seferde görünür. Spinner kısa yüklemede yanıp sönmesin diye geç belirir.
   */
  let {
    title,
    description,
    actions,
    children,
    class: className,
  }: {
    title?: string
    description?: string
    actions?: Snippet
    children: Snippet
    class?: string
  } = $props()
</script>

{#if title}
  <div class="bg-card sticky top-14 z-20 flex h-[68px] items-center gap-6 border-b px-7">
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-[22px] leading-7 font-semibold tracking-[-0.11px]">{title}</h1>
      {#if description}
        <p class="text-muted-foreground mt-0.5 truncate text-[12.5px] leading-[18px] tracking-[0.16px]">
          {description}
        </p>
      {/if}
    </div>
    {#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
  </div>
{/if}

<div class="relative">
  {#if $pageLoad}
    <div
      class="animate-in fade-in-0 fill-mode-backwards absolute inset-x-0 top-0 grid h-60 place-items-center [animation-delay:150ms]"
      role="status"
      aria-label="Yükleniyor"
    >
      <span class="border-brand size-8 animate-spin rounded-full border-[3px] border-t-transparent"></span>
    </div>
  {/if}
  <div
    class={cn(
      'mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-7 py-6',
      $pageLoad && 'pointer-events-none max-h-60 overflow-hidden opacity-0',
      className,
    )}
    aria-busy={$pageLoad}
  >
    {@render children()}
  </div>
</div>
