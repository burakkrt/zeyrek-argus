<script lang="ts">
  import type { FindingKind } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import {
    ACTION_ICON,
    FINDING_TONE,
    formatClock,
    pageLabel,
    rulerTicks,
    stackLabels,
    type Lanes,
  } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Zaman çizelgesi şeritleri: cetvel, sayfalar (birden çoksa), görevler, adımlar (eylem ikonu, tek satır; sıkışınca
   * üst üste biner) ve bulgular (tam başlık; çakışan alt satıra iner, en çok iki satır). Üstüne gelince açık renkli,
   * tek satırlık ipucu çıkar (adımda ne yapıldığı, bulguda tür rozeti ve başlık); göreve ve sayfaya tıklayınca başına, adıma tıklayınca o ana gidilir, bulguya tıklayınca bulgu açılır.
   * Oynatma çizgisi hepsini keser; boş yere tıklayıp ya da çizginin tutamağını sürükleyerek saniye saniye gezilir.
   * Kesik çizgi, model düşünürken kısaltılan beklemedir. Konumlar oynatma saatindedir (ms).
   */
  let {
    lanes,
    duration,
    position,
    live,
    gaps,
    activeStep,
    selectedFinding,
    pending,
    loading,
    describe,
    onseek,
    onfinding,
  }: {
    lanes: Lanes
    duration: number
    position: number
    /** Canlının ucunda mı (çizgi yeşil, "şimdi"). */
    live: boolean
    gaps: number[]
    activeStep: number
    selectedFinding: number | null
    /** Sonucu henüz gelmemiş canlı işlemin konumu. */
    pending: number | null
    /** Plan henüz yok: şeritler iskelet. */
    loading: boolean
    /** Adımın ipucu: ne yapıldı ("Yazdı · “PLN-2027”"). */
    describe: (index: number) => string
    onseek: (position: number) => void
    onfinding: (index: number) => void
  } = $props()

  const LANE = 26
  const FINDING_ROW = 24
  const TIP_HALF = 160

  let area = $state<HTMLDivElement | null>(null)
  let areaWidth = $state(800)
  let dragging = $state(false)
  let tip = $state<{
    text: string
    label: string | null
    kind: FindingKind | null
    x: number
    y: number
  } | null>(null)

  const pct = (value: number) => (duration > 0 ? Math.min(100, Math.max(0, (value / duration) * 100)) : 0)
  // Bulgu başlıkları kısaltılmaz: çakışan alt satıra iner (`stackLabels`); genişlik metinden tahmin edilir.
  const labels = $derived(
    stackLabels(
      lanes.findings.map((f) => ({
        pos: pct(f.pos),
        width: (Math.min(420, 18 + f.title.length * 6.2) / Math.max(areaWidth, 1)) * 100,
      })),
      2,
    ),
  )
  const findingRows = $derived(Math.max(1, ...labels.map((l) => l.row + 1)))
  const ruler = $derived(rulerTicks(duration, areaWidth))

  function seekAt(clientX: number) {
    if (!area) return
    const rect = area.getBoundingClientRect()
    onseek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration)
  }

  /** İpucu öğenin üstünde, ortasında; şeridin kenarından taşmaz. */
  function showTip(
    event: MouseEvent,
    text: string,
    { label = null, kind = null }: { label?: string | null; kind?: FindingKind | null } = {},
  ) {
    if (!area || dragging) return
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const host = area.getBoundingClientRect()
    const center = box.left + box.width / 2 - host.left
    tip = {
      text,
      label,
      kind,
      x: Math.min(Math.max(center, TIP_HALF), Math.max(TIP_HALF, host.width - TIP_HALF)),
      y: box.top - host.top,
    }
  }
</script>

<svelte:window onpointermove={(e) => dragging && seekAt(e.clientX)} onpointerup={() => (dragging = false)} />

<div class="px-2.5 py-1.5">
  <!-- Şeritler: boş yere tıkla / sürükle → o ana git -->
  <div
    bind:this={area}
    bind:clientWidth={areaWidth}
    role="slider"
    tabindex="-1"
    aria-label="Kayıt konumu"
    aria-valuemin={0}
    aria-valuemax={Math.round(duration / 1000)}
    aria-valuenow={Math.round(position / 1000)}
    class="relative cursor-pointer touch-none select-none"
    onpointerdown={(e) => {
      if ((e.target as HTMLElement).closest('button')) return
      tip = null
      dragging = true
      seekAt(e.clientX)
    }}
  >
    <!-- Cetvel: kendi bandında, çentikler üstten sarkar; etiket büyük çentiğin sağında (`rulerTicks`). -->
    <div class="relative h-[22px] border-b border-zinc-200 text-[10.5px] font-medium text-zinc-500">
      <!-- Oynatılan süre: cetvelin altında mavi ilerleme çizgisi. -->
      <span class="bg-brand absolute -bottom-px left-0 h-0.5" style={`width:${pct(position)}%`}></span>
      {#each ruler.minor as tick (tick)}
        <span class="absolute top-0 h-1.5 w-px bg-zinc-300" style={`left:${pct(tick)}%`}></span>
      {/each}
      {#each ruler.major as tick (tick)}
        <span class="absolute top-0 h-3 w-px bg-zinc-400" style={`left:${pct(tick)}%`}></span>
        {#if pct(tick) < 96}<span class="tabular absolute top-[5px] pl-1" style={`left:${pct(tick)}%`}
            >{formatClock(tick)}</span
          >{/if}
      {/each}
    </div>

    <div class="relative flex flex-col gap-y-[5px] pt-1.5">
      <!-- Oynatılan kısım: düz, çok hafif mavi ton (okumayı engellemez); kalan kısım olduğu gibi. -->
      <span
        class="bg-brand/[0.045] pointer-events-none absolute top-1.5 bottom-0 left-0 z-[1] rounded-l-md"
        style={`width:${pct(position)}%`}
      ></span>

      {#if lanes.pages.length > 1}
        <div class="bg-surface-alt relative rounded-md" style={`height:${LANE}px`}>
          {#each lanes.pages as page (page.page + page.start)}
            {@const on = position >= page.start && position < page.end}
            <button
              type="button"
              aria-label={`${pageLabel(page.page)} başına git`}
              class={cn(
                'absolute inset-y-[3px] flex items-center truncate rounded-[5px] border bg-white px-2 text-left text-xs font-medium hover:border-zinc-400',
                on && 'border-brand-border bg-brand-soft text-brand-strong hover:border-brand-border',
              )}
              style={`left:calc(${pct(page.start)}% + 2px);width:calc(${pct(page.end) - pct(page.start)}% - 4px)`}
              onmouseenter={(e) => showTip(e, page.page)}
              onmouseleave={() => (tip = null)}
              onclick={() => onseek(page.start)}>{pageLabel(page.page)}</button
            >
          {/each}
        </div>
      {/if}

      {#if loading}
        <div class="bg-secondary animate-pulse rounded-md" style={`height:${LANE}px`}></div>
        <div class="bg-secondary animate-pulse rounded-md" style={`height:${LANE}px`}></div>
        <div class="bg-secondary animate-pulse rounded-md" style={`height:${LANE}px`}></div>
      {:else}
        <div class="bg-surface-alt relative rounded-md" style={`height:${LANE}px`}>
          {#each lanes.tasks as task (task.page + task.index)}
            {@const on = position >= task.start && position < task.end}
            <button
              type="button"
              aria-label={`Görev ${task.index + 1}: ${task.title} — başına git`}
              class={cn(
                'text-muted-foreground absolute inset-y-[3px] flex items-center overflow-hidden rounded-[5px] border bg-white px-2 text-left text-xs whitespace-nowrap hover:border-zinc-400',
                on &&
                  'border-brand-border bg-brand-soft text-brand-strong font-medium hover:border-brand-border',
              )}
              style={`left:calc(${pct(task.start)}% + 2px);width:calc(${pct(task.end) - pct(task.start)}% - 4px)`}
              onmouseenter={(e) => showTip(e, task.title, { label: `Görev ${task.index + 1}` })}
              onmouseleave={() => (tip = null)}
              onclick={() => onseek(task.start)}><span class="truncate">{task.title}</span></button
            >
          {/each}
        </div>

        <div class="bg-surface-alt relative rounded-md" style={`height:${LANE}px`}>
          {#each gaps as gap, i (i)}
            <span
              class="absolute inset-y-0 w-2.5 -translate-x-1/2 bg-[repeating-linear-gradient(90deg,transparent_0_3px,rgb(0_0_0/0.08)_3px_4px)]"
              style={`left:${pct(gap)}%`}
            ></span>
          {/each}
          {#each lanes.steps as step (step.index)}
            {@const info = describe(step.index)}
            <button
              type="button"
              aria-label={info}
              class={cn(
                'text-muted-foreground absolute top-1 grid size-[18px] -translate-x-1/2 place-items-center rounded-[5px] border bg-white transition-colors hover:z-[2] hover:border-zinc-400',
                step.index === activeStep && 'border-brand bg-brand z-[1] text-white hover:border-brand',
              )}
              style={`left:${pct(step.pos)}%`}
              onmouseenter={(e) => showTip(e, info)}
              onmouseleave={() => (tip = null)}
              onclick={() => onseek(step.pos)}
            >
              <Icon name={ACTION_ICON[step.kind]} class="size-3" />
              {#if step.dialog}<span
                  class="bg-warning absolute -top-1 -right-1 size-[7px] rounded-full ring-[1.5px] ring-white"
                ></span>{/if}
            </button>
          {/each}
          {#if pending !== null}
            <span
              class="border-brand text-brand absolute top-1 grid size-[18px] -translate-x-1/2 place-items-center rounded-[5px] border border-dashed bg-white"
              style={`left:${pct(pending)}%`}><Icon name="click" class="size-3" /></span
            >
          {/if}
        </div>

        <div class="bg-surface-alt relative rounded-md" style={`height:${findingRows * FINDING_ROW + 2}px`}>
          {#each lanes.findings as finding (finding.index)}
            {@const slot = labels[finding.index]!}
            <button
              type="button"
              class={cn(
                'absolute flex h-5 items-center overflow-hidden rounded-[5px] border px-2 text-[11.5px] font-medium whitespace-nowrap transition-shadow hover:shadow-sm',
                selectedFinding === finding.index
                  ? FINDING_TONE[finding.kind].strong
                  : FINDING_TONE[finding.kind].chip,
              )}
              style={`top:${3 + slot.row * FINDING_ROW}px;left:${slot.left}%;max-width:${slot.width}%`}
              onmouseenter={(e) => showTip(e, finding.title, { kind: finding.kind })}
              onmouseleave={() => (tip = null)}
              onclick={() => onfinding(finding.index)}><span class="truncate">{finding.title}</span></button
            >
          {/each}
        </div>
      {/if}
    </div>

    <!-- Oynatma çizgisi -->
    <div
      class={cn(
        'pointer-events-none absolute top-[3px] bottom-0 z-[2] w-0.5',
        live ? 'bg-success' : 'bg-brand',
      )}
      style={`left:${pct(position)}%`}
    >
      <!-- Tutamak: basılı tutup sürükleyerek saniye saniye gezilir. -->
      <span
        role="presentation"
        class={cn(
          'tabular pointer-events-auto absolute top-0 left-1/2 -translate-x-1/2 cursor-grab rounded-[5px] px-1.5 text-[10.5px] leading-4 font-semibold whitespace-nowrap text-white shadow-sm active:cursor-grabbing',
          live ? 'bg-success' : 'bg-brand',
        )}
        onpointerdown={(e) => {
          e.stopPropagation()
          tip = null
          dragging = true
        }}>{live ? 'şimdi' : formatClock(position)}</span
      >
    </div>

    {#if tip}
      <!-- Açık renkli ipucu: şeritte kısalan metnin tamamı; uzun metin en çok 320 px genişlikte satırlara sarılır. -->
      <div
        class="text-foreground pointer-events-none absolute z-[5] w-max max-w-[320px] -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs leading-[17px] shadow-[0_4px_14px_rgb(16_24_40/0.12)]"
        style={`left:${tip.x}px;top:${tip.y}px`}
      >
        {#if tip.label}<span class="text-muted-foreground mb-0.5 block text-[11px] font-medium"
            >{tip.label}</span
          >{/if}
        {#if tip.kind}<span
            class={cn(
              'mb-1 inline-flex rounded-[4px] border px-1.5 text-[10.5px] leading-4 font-semibold',
              FINDING_TONE[tip.kind].chip,
            )}>{FINDING_TONE[tip.kind].label}</span
          >{/if}
        <span class="line-clamp-6 block break-words">{tip.text}</span>
      </div>
    {/if}
  </div>
</div>
