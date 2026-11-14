<script lang="ts">
  import type { Snippet } from 'svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import { pageLoad } from '$lib/page-load'
  import { cn } from '$lib/utils'

  /**
   * Sayfa (Zeyrek kabuğu): üst çubuğun hemen altında yapışkan, kenardan kenara beyaz başlık şeridi (68 px; başlık
   * 22/600/28, açıklama 12.5/18 ikincil renk, aralarında 2 px; sağda 38 px eylem düğmeleri) ve altında içerik
   * kapsayıcısı (en çok 1480 px, 28 px yan, 24 px dikey boşluk, bölümler arası 20 px). `title` verilmezse şerit
   * çizilmez (henüz taşınmamış sayfalar). Sayfa kendi kenar boşluğunu yazmaz.
   *
   * Açılış yüklemesi sürerken (`page-load.ts`) içerik gizli kalır ve içerik alanının görünen kısmının tam ortasında
   * 28 px spinner döner (platformun sayfa kabı yükleniyor hâli); veri gelince içerik tek seferde görünür. Spinner kısa
   * yüklemede yanıp sönmesin diye 150 ms geç belirir.
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

{#if $pageLoad}
  <!-- İçerik alanının görünen kısmını doldurur: spinner üst çubuk ve şerit dışındaki alanın tam ortasında durur. -->
  <div
    class={cn(
      'animate-in fade-in-0 fill-mode-backwards grid place-items-center [animation-delay:150ms]',
      title ? 'h-[calc(100svh-124px)]' : 'h-[calc(100svh-56px)]',
    )}
  >
    <Spinner size="lg" />
  </div>
{/if}
<!-- Yüklenirken de bağlı kalır (sayfanın istekleri buradan başlar), yalnız gizlidir. -->
<div
  class={cn('mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-7 py-6', $pageLoad && 'hidden', className)}
  aria-busy={$pageLoad}
>
  {@render children()}
</div>
