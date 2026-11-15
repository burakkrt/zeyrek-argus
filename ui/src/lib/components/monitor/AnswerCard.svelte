<script lang="ts">
  import type { RunAnswer, RunStrategy } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { ANSWER_STATUS } from '$lib/monitor'

  /**
   * Girdili koşunun isteğe cevabı (akışın üstünde): anlaşılan istek, cevabın durumu ve kendisi, kanıtlar (açılır) ve
   * cevaplanamayan kısım. Koşu sürerken cevap henüz yoktur; strateji görünür.
   */
  let {
    strategy,
    answer,
    running,
  }: { strategy: RunStrategy | null; answer: RunAnswer | null; running: boolean } = $props()
</script>

<section class="max-h-72 shrink-0 overflow-y-auto border-b px-4 py-3" aria-label="İsteğin cevabı">
  <div class="flex items-center gap-2">
    <Icon name="factCheck" class="text-muted-foreground size-4" />
    <h2 class="text-sm font-semibold">Cevap</h2>
    {#if answer}
      <Badge variant={ANSWER_STATUS[answer.status].tone}>{ANSWER_STATUS[answer.status].label}</Badge>
    {:else}
      <span class="text-muted-foreground text-xs">{running ? 'Koşu sürüyor' : 'Cevap yazılmadı'}</span>
    {/if}
  </div>
  {#if strategy}<p class="text-muted-foreground mt-1 text-xs">{strategy.understood}</p>{/if}
  {#if answer}
    <p class="mt-2 text-[13px] leading-5 whitespace-pre-line">{answer.answer}</p>
    {#if answer.evidence.length}
      <details class="mt-2">
        <summary class="text-muted-foreground cursor-pointer text-xs"
          >Kanıtlar ({answer.evidence.length})</summary
        >
        <ul class="mt-1 grid list-disc gap-0.5 pl-5 text-xs leading-[17px]">
          {#each answer.evidence as item, i (i)}<li>{item}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if answer.missing}
      <p class="text-warning mt-2 text-xs"><span class="font-medium">Eksik kalan:</span> {answer.missing}</p>
    {/if}
  {/if}
</section>
