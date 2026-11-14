<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '$lib/utils'

  /**
   * Bölüm ızgarası: sütun düzeni sabit seçeneklerden biridir, aralık her yerde aynıdır. Sayfa kendi ızgarasını
   * yazmaz; yeni bir düzen gerekirse buraya eklenir.
   */
  const LAYOUTS = {
    '2': 'grid-cols-2',
    '3': 'grid-cols-3',
    '4': 'grid-cols-4',
    '2-1': 'grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
    '1-2': 'grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
  } as const

  let { cols, children }: { cols: keyof typeof LAYOUTS; children: Snippet } = $props()
</script>

<div class={cn('grid gap-5', LAYOUTS[cols])}>{@render children()}</div>
