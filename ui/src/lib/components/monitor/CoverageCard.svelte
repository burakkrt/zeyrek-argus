<script lang="ts">
  import type { RunCoverage, RunStrategy } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { COVERAGE_STATUS } from '$lib/monitor'

  /**
   * Girdili koşunun kapsamı (akışın üstünde): test edilen kapsam, kapsam durumu ve özeti, test edilen ve edilemeyen
   * senaryolar (nedenleriyle). Koşunun asıl çıktısı bulgulardır; bu kart yalnız kapsamı söyler. Koşu sürerken rapor
   * henüz yoktur; test planı görünür.
   */
  let {
    strategy,
    coverage,
    running,
  }: { strategy: RunStrategy | null; coverage: RunCoverage | null; running: boolean } = $props()
</script>

<section class="max-h-72 shrink-0 overflow-y-auto border-b px-4 py-3" aria-label="Kapsam">
  <div class="flex items-center gap-2">
    <Icon name="factCheck" class="text-muted-foreground size-4" />
    <h2 class="text-sm font-semibold">Kapsam</h2>
    {#if coverage}
      <Badge variant={COVERAGE_STATUS[coverage.status].tone}>{COVERAGE_STATUS[coverage.status].label}</Badge>
    {:else}
      <span class="text-muted-foreground text-xs">{running ? 'Koşu sürüyor' : 'Kapsam raporu yazılmadı'}</span
      >
    {/if}
  </div>
  {#if strategy}<p class="text-muted-foreground mt-1 text-xs">{strategy.understood}</p>{/if}
  {#if coverage}
    <p class="mt-2 text-[13px] leading-5">{coverage.summary}</p>
    {#if coverage.tested.length}
      <details class="mt-2">
        <summary class="text-muted-foreground cursor-pointer text-xs"
          >Test edilen ({coverage.tested.length})</summary
        >
        <ul class="mt-1 grid list-disc gap-0.5 pl-5 text-xs leading-[17px]">
          {#each coverage.tested as item, i (i)}<li>{item}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if coverage.untested.length}
      <div class="mt-2">
        <p class="text-warning text-xs font-medium">Test edilemeyen</p>
        <ul class="text-warning mt-1 grid list-disc gap-0.5 pl-5 text-xs leading-[17px]">
          {#each coverage.untested as item, i (i)}<li>{item}</li>{/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>
