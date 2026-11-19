<script lang="ts">
  import type { Occurrence } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import Drawer from '$lib/components/layout/Drawer.svelte'
  import FindingReport from '$lib/components/finding/FindingReport.svelte'
  import { SEVERITY } from '$lib/format'
  import { pageLabel, type MonitorFinding } from '$lib/monitor'
  import { KIND } from '$lib/review'

  /**
   * Bulgunun ayrıntısı, sağdan kayan çekmecede (akış ve sağ panel arkada çalışmaya devam eder). Gövde ortak bulgu
   * belgesidir (`FindingReport`); yargıcın gerekçesi "Değerlendirme notu" olur. Ayrıntıyı (bulgu kaydındaki görülme)
   * monitör okur; sahne aynı kayıttan bulgunun yerini çizer, bu yüzden istek tek.
   */
  let {
    finding,
    occurrence,
    failed,
    caseLabel,
    onclose,
  }: {
    /** Gösterilen bulgu; null çekmeceyi kapatır (kapanırken son bulgu görünür kalır). */
    finding: MonitorFinding | null
    occurrence: Occurrence | null
    failed: boolean
    /** Bulgunun çıktığı vaka ("Vaka 2"); üst başlığın başında yazar. */
    caseLabel: string | null
    onclose: () => void
  } = $props()

  let kept: MonitorFinding | null = null
  const shown = $derived.by(() => (finding ? (kept = finding) : kept))
</script>

<Drawer
  open={finding !== null}
  title={shown ? KIND[shown.event.kind] : 'Bulgu'}
  meta={shown
    ? [caseLabel, `${shown.event.severity} ${SEVERITY[shown.event.severity].label}`].filter(Boolean).join(' · ')
    : undefined}
  {onclose}
>
  {#snippet actions()}
    {#if shown}<a
        class="text-brand hover:bg-secondary inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium"
        href={`#/bulgular/${shown.event.issueId}`}>Bulgu kaydı <Icon name="openInNew" class="size-4" /></a
      >{/if}
  {/snippet}
  {#if shown}
    {#if occurrence}
      <FindingReport
        title={shown.event.title}
        {occurrence}
        place={pageLabel(occurrence.page)}
        note={shown.judge ?? shown.event.reason}
      />
    {:else if failed}
      <p class="text-muted-foreground text-[13px]">Bulgu kaydı okunamadı.</p>
    {:else}
      <div class="grid place-items-center py-6"><Spinner /></div>
    {/if}
  {/if}
</Drawer>
