<script lang="ts">
  import type { Snippet } from 'svelte'
  import * as Card from '$lib/components/ui/card/index.js'
  import { cn } from '$lib/utils'

  /**
   * Bölüm kartı: başlık çubuğu (başlık, kısa açıklama, sağda eylem) ve içerik. Tablo gibi kenara dayanan içerik için
   * `flush` iç boşluğu kaldırır. Sayfadaki her bölüm bu kartla çizilir.
   */
  let {
    title,
    description,
    actions,
    flush = false,
    class: className,
    children,
  }: {
    title: string
    description?: string
    actions?: Snippet
    flush?: boolean
    class?: string
    children: Snippet
  } = $props()
</script>

<Card.Root class={cn('gap-0 py-0', className)}>
  <div class="flex min-h-14 items-center justify-between gap-3 border-b px-6 py-3">
    <div class="min-w-0">
      <h2 class="text-sm font-semibold">{title}</h2>
      {#if description}<p class="text-muted-foreground truncate text-[12.5px] leading-[18px]">
          {description}
        </p>{/if}
    </div>
    {#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
  </div>
  <div class={cn('flex-1', !flush && 'px-6 py-5')}>{@render children()}</div>
</Card.Root>
