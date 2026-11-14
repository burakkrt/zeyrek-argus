<script lang="ts">
  import type { Snippet } from 'svelte'
  import * as Card from '$lib/components/ui/card/index.js'

  /** Gösterge kartı: etiket, büyük değer, altta kısa bağlam. Gösterge satırları yalnız bununla çizilir. */
  let { label, value, hint }: { label: string; value: string; hint?: Snippet | string } = $props()
</script>

<Card.Root class="gap-1 px-6 py-5">
  <div class="text-muted-foreground text-[13px] font-medium">{label}</div>
  <div class="tabular text-[26px] leading-8 font-semibold tracking-tight">{value}</div>
  {#if hint}
    <div class="text-muted-foreground text-[12.5px] leading-[18px]">
      {#if typeof hint === 'string'}{hint}{:else}{@render hint()}{/if}
    </div>
  {/if}
</Card.Root>
