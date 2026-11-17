<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import * as Sheet from '$lib/components/ui/sheet/index.js'

  /**
   * Çekmece kalıbı; uygulamadaki her çekmece bununla açılır (paylaşılan `ui/sheet` üstünde, Modal'ın kardeşi).
   * Ayrıntıyı bağlamdan koparmadan gösterir: arkadaki ekran (monitörde akış) çalışmaya devam eder, hafif örtünün
   * ardından bulanıklaşmadan görünür (yalnız çok hafif karartma). Örtüye tıklamak, Esc ve × kapatır.
   *
   * - Sağdan açılır; genişlik 560 px (dar ekranda ekranın 16 px eksiği), tam yükseklik, sol kenarda ince çizgi ve
   *   belirgin gölge. Açılış 300 ms yumuşak kayma + soluklaşma, kapanış 200 ms.
   * - Başlık bölümü 64 px yükseklik, 24 px yan dolgu, içerik dikeyde ortalı: solda üst başlık (`eyebrow`) ve başlık
   *   16/600/24; sağda aynı 32 px yükseklikte isteğe bağlı eylem (`actions`) ve kapat düğmesi, aralarında 8 px ve ince
   *   bir ayraç. Gövde 24 px yan dolguyla kendi içinde kayar.
   */
  let {
    open,
    title,
    eyebrow,
    onclose,
    actions,
    children,
  }: {
    open: boolean
    title: string
    eyebrow?: string
    onclose: () => void
    actions?: Snippet
    children: Snippet
  } = $props()
</script>

<Sheet.Root {open} onOpenChange={(next) => !next && onclose()}>
  <Sheet.Content
    side="right"
    showCloseButton={false}
    overlayClass="bg-black/[0.08] supports-backdrop-filter:backdrop-blur-none"
    style="width: min(560px, calc(100vw - 16px)); max-width: none; box-shadow: -24px 0 60px -20px rgba(15, 23, 42, 0.35), -1px 0 0 rgba(15, 23, 42, 0.04)"
    class="gap-0 data-closed:duration-200 data-open:duration-300 data-open:ease-out data-[side=right]:data-closed:slide-out-to-right-1/3 data-[side=right]:data-open:slide-in-from-right-1/3"
  >
    <header class="flex h-16 shrink-0 items-center gap-3 border-b px-6">
      <div class="min-w-0 flex-1">
        {#if eyebrow}<p class="text-[11px] font-semibold tracking-[.06em] text-zinc-500 uppercase">
            {eyebrow}
          </p>{/if}
        <Sheet.Title class="text-base leading-6 font-semibold text-zinc-900">{title}</Sheet.Title>
      </div>
      {#if actions}<div class="flex h-8 items-center gap-2">
          {@render actions()}<span class="h-5 w-px bg-zinc-200"></span>
        </div>{/if}
      <Sheet.Close
        class="text-muted-foreground hover:bg-secondary hover:text-foreground -mr-1.5 grid size-8 shrink-0 place-items-center rounded-lg"
        aria-label="Kapat"
      >
        <Icon name="close" class="size-5" />
      </Sheet.Close>
    </header>
    <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">
      {@render children()}
    </div>
  </Sheet.Content>
</Sheet.Root>
