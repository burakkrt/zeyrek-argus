<script lang="ts">
  import type { Occurrence } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { fileUrl } from '$lib/api'
  import { OUTCOME } from '$lib/format'
  import { FINDING_TONE, scenarioSteps, type MonitorFinding } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Bulgunun ayrıntısı, akış panelinin yerinde: nasıl bulunduğu (adım adım), beklenen ve görülen, alıntı, kanıt
   * görüntüsü ve yargıcın gerekçesi. Ayrıntıyı (bulgu kaydındaki görülme) monitör okur; sahne aynı kayıttan bulgunun
   * yerini çizer, bu yüzden istek tek.
   */
  let {
    runId,
    finding,
    occurrence,
    failed,
    onback,
  }: {
    runId: string
    finding: MonitorFinding
    occurrence: Occurrence | null
    failed: boolean
    onback: () => void
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex h-12 shrink-0 items-center gap-2 border-b px-3">
    <Button size="sm" variant="ghost" onclick={onback}><Icon name="arrowBack" />Akış</Button>
    <a
      class="text-brand ml-auto inline-flex items-center gap-1 text-[13px] font-medium"
      href={`#/bulgular/${finding.event.issueId}`}>Bulgu kaydı <Icon name="openInNew" class="size-4" /></a
    >
  </div>

  <div class="scroll-thin grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-4">
    <div class="grid gap-2">
      <span class="flex items-center gap-1.5">
        <span
          class={cn(
            'inline-flex h-[22px] items-center rounded-full border px-2.5 text-xs font-medium',
            FINDING_TONE[finding.event.kind].chip,
          )}>{FINDING_TONE[finding.event.kind].label}</span
        >
        <Badge variant="outline">{OUTCOME[finding.event.outcome].label}</Badge>
      </span>
      <h3 class="text-[15px] leading-[22px] font-semibold">{finding.event.title}</h3>
    </div>

    {#if occurrence}
      <section class="grid gap-1.5">
        <h4 class="text-muted-foreground text-[11.5px] font-semibold tracking-wide uppercase">
          Nasıl bulundu
        </h4>
        <ol class="grid gap-1 text-[13px] leading-[19px]">
          {#each scenarioSteps(occurrence.scenario) as line, i (i)}
            <li class="flex gap-2">
              <span
                class="bg-secondary text-muted-foreground mt-px grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                >{i + 1}</span
              >{line}
            </li>
          {/each}
        </ol>
      </section>
      <section class="grid gap-2 rounded-lg border p-3 text-[13px] leading-[19px]">
        <div>
          <h4 class="text-muted-foreground mb-0.5 text-xs font-medium">Beklenen</h4>
          <p>{occurrence.expected}</p>
        </div>
        <div class="border-t pt-2">
          <h4 class="text-muted-foreground mb-0.5 text-xs font-medium">Görülen</h4>
          <p>{occurrence.observed}</p>
        </div>
        {#if occurrence.quote}
          <p class="text-muted-foreground border-t pt-2 text-xs">
            Ekrandaki metin: <span class="text-foreground font-medium">"{occurrence.quote}"</span>
          </p>
        {/if}
      </section>
      {#if occurrence.shot}
        <section class="grid gap-1.5">
          <h4 class="text-muted-foreground text-[11.5px] font-semibold tracking-wide uppercase">Kanıt</h4>
          <a href={fileUrl(runId, occurrence.shot)} target="_blank" rel="noreferrer" class="block">
            <img
              src={fileUrl(runId, occurrence.shot)}
              alt="Bulgunun kanıt görüntüsü"
              class="w-full rounded-md border"
              loading="lazy"
            />
          </a>
        </section>
      {/if}
    {:else if failed}
      <p class="text-muted-foreground text-[13px]">Bulgu kaydı okunamadı.</p>
    {:else}
      <div class="grid place-items-center py-6"><Spinner /></div>
    {/if}

    {#if finding.judge || finding.event.reason}
      <section class="bg-surface-alt grid gap-1 rounded-lg px-3 py-2.5 text-[12.5px] leading-[18px]">
        <h4 class="text-muted-foreground text-xs font-medium">Yargıcın gerekçesi</h4>
        <p>{finding.judge ?? finding.event.reason}</p>
      </section>
    {/if}
  </div>
</div>
