<script lang="ts">
  import { slide } from 'svelte/transition'
  import Icon from '$lib/components/Icon.svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import {
    ACTION_ICON,
    actionOf,
    FINDING_TONE,
    formatClock,
    TRAVEL_MS,
    type FlowEntry,
    type FlowSections,
    type FlowTask,
    type MonitorModel,
  } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Akış (Playwright'ın adım grupları, Cypress'in komut listesi, Sentry'nin eşzamanlı olay listesi gibi): sayfa ›
   * görev › adım. Görev başlığı kayarken üstte sabit kalır (durum, adım sayısı, bulgular); adımlar dikey akış çizgisi
   * üstünde tek satırdır (ikon, fiil · nesne, süre), oynatılan adım "neden" ve istek sayısıyla genişler, henüz
   * oynatılmamış satırlar soluktur. Gürültü kapalıdır: plan, görev özeti ve hazırlık notları açılır; ağ istekleri
   * adımın içindedir. Akış oynatmayı izler (oynatılan satır görünür tutulur); kullanıcı kaydırınca takip durur, "Şu ana
   * dön" ile sürer. Satıra tıklayınca kayıt o ana gider; görev başlığına tıklayınca görevin başına.
   */
  let {
    model,
    sections,
    wall,
    activeStep,
    selectedFinding,
    offset,
    onstep,
    ontask,
    onfinding,
  }: {
    model: MonitorModel
    sections: FlowSections
    /** Oynatılan anın duvar saati. */
    wall: number
    /** Anlatılan adım (çubuktaki eylemle aynı). */
    activeStep: number
    selectedFinding: number | null
    /** Bir anın oynatma saatindeki yeri (ms). */
    offset: (at: number) => number
    onstep: (at: number) => void
    ontask: (at: number) => void
    onfinding: (index: number) => void
  } = $props()

  const LOOK = new Set(['okudu', 'goruntu'])
  const USER_SCROLL_PAUSE_MS = 5_000

  let list = $state<HTMLDivElement | null>(null)
  let open = $state<Record<string, boolean>>({})
  let userScrolledAt = $state(0)
  let away = $state(false)

  const allTasks = $derived(sections.pages.flatMap((p) => p.tasks))
  // Oynatılan görev: o ana kadar başlamış son görev. Oynatılan satır: anlatılan adım bu görevdeyse o, değilse başlık.
  const activeTask = $derived(allTasks.findLast((t) => t.at <= wall) ?? null)
  const activeKey = $derived.by(() => {
    const step = model.steps[activeStep]
    if (!step || !activeTask) return activeTask?.key ?? null
    const key = String(step.seq)
    return activeTask.entries.some((e) => e.key === key) ? key : activeTask.key
  })
  const findingDots = (task: FlowTask) =>
    task.entries.flatMap((e) => (e.kind === 'bulgu' ? [model.findings[e.finding]!.event.kind] : []))
  const played = (item: FlowEntry) => (item.kind === 'adim' ? item.at - TRAVEL_MS : item.at) <= wall

  // Oynatılan satır üstten yaklaşık üçte birlik konuma yumuşakça getirilir (YouTube transkripti, Sentry olay listesi
  // gibi); satır zaten rahat görünür bölgedeyse liste kıpırdamaz. Görevin başına geçilince bölüm üstten gösterilir.
  // Uzak bir sıçramada (birkaç ekran) kaydırma anında yapılır, uzun süre kaymaz. Kullanıcı yeni kaydırdıysa araya
  // girilmez, "Şu ana dön" çıkar.
  function place(row: HTMLElement, force = false) {
    if (!list) return
    const host = list.getBoundingClientRect()
    const box = row.getBoundingClientRect()
    const relative = box.top - host.top
    const section = row.tagName === 'SECTION'
    const comfortable =
      relative > list.clientHeight * 0.15 && relative + box.height < list.clientHeight * 0.75
    if (!force && !section && comfortable) return
    const target = Math.max(0, list.scrollTop + relative - (section ? 0 : list.clientHeight * 0.3))
    const far = Math.abs(target - list.scrollTop) > list.clientHeight * 2
    list.scrollTo({ top: target, behavior: far ? 'auto' : 'smooth' })
  }

  $effect(() => {
    const key = activeKey
    if (!key || !list) return
    const row = list.querySelector<HTMLElement>(`[data-key="${key}"]`)
    if (!row) return
    if (Date.now() - userScrolledAt < USER_SCROLL_PAUSE_MS) {
      const box = row.getBoundingClientRect()
      const host = list.getBoundingClientRect()
      away = box.bottom < host.top || box.top > host.bottom
      return
    }
    away = false
    place(row)
  })

  function backToNow() {
    userScrolledAt = 0
    away = false
    const row = list?.querySelector<HTMLElement>(`[data-key="${activeKey}"]`)
    if (row) place(row, true)
  }
</script>

{#snippet entry(item: FlowEntry)}
  {@const done = played(item)}
  {#if item.kind === 'adim'}
    {@const step = model.steps[item.step]!}
    {@const action = actionOf(step)}
    {@const active = item.key === activeKey}
    <button
      type="button"
      data-key={item.key}
      onclick={() => onstep(item.at)}
      class={cn(
        'relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2 py-[5px] text-left transition-[background-color,opacity] duration-300',
        active
          ? 'bg-brand-soft -mx-2 w-[calc(100%+16px)] pr-4 pl-3.5'
          : 'w-full rounded-md pr-2 pl-1.5 hover:bg-zinc-100',
        !done && !active && 'opacity-60',
      )}
    >
      <span
        class={cn(
          'relative z-[1] grid size-[22px] place-items-center rounded-full border bg-white transition-colors duration-300',
          active ? 'border-brand bg-brand text-white' : 'text-muted-foreground',
          !active && LOOK.has(action.kind) && 'text-muted-foreground/70 border-dashed',
        )}
      >
        <Icon name={ACTION_ICON[action.kind]} class="size-3.5" />
        {#if step.dialog}<span
            class="bg-warning absolute -top-0.5 -right-0.5 size-2 rounded-full ring-[1.5px] ring-white"
          ></span>{/if}
      </span>
      <span class="min-w-0 pt-px">
        <span class={cn('block truncate text-[13px] leading-5', active && 'text-brand-strong')}>
          <span class="font-medium">{action.verb}</span>{#if action.object}<span
              class={active ? 'text-brand-strong/80' : 'text-muted-foreground'}
            >
              · {action.object}</span
            >{/if}
        </span>
        {#if active}
          <span class="block" transition:slide={{ duration: 200 }}>
            {#if step.reason}<span class="text-muted-foreground block text-xs leading-[17px]"
                >Neden: {step.reason}</span
              >{/if}
            {#if step.dialog}<span class="text-warning block text-xs leading-[17px]"
                >Tarayıcı penceresi: “{step.dialog}” · iptal edildi</span
              >{/if}
            {#if item.requests}<span class="text-muted-foreground block text-xs leading-[17px]"
                >{item.requests} istek{item.blocked ? ` · ${item.blocked} engelli/hatalı` : ''}</span
              >{/if}
          </span>
        {/if}
      </span>
      <span class={cn('tabular pt-0.5 text-[11.5px]', active ? 'text-brand-strong' : 'text-muted-foreground')}
        >{formatClock(offset(item.at))}</span
      >
    </button>
  {:else if item.kind === 'bulgu'}
    {@const finding = model.findings[item.finding]!}
    {@const tone = FINDING_TONE[finding.event.kind]}
    {@const selected = selectedFinding === item.finding}
    <button
      type="button"
      data-key={item.key}
      onclick={() => onfinding(item.finding)}
      class={cn(
        'relative my-0.5 grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-md py-1.5 pr-2 pl-1.5 text-left transition-[background-color,opacity] duration-300',
        tone.row || (selected ? 'bg-zinc-100' : 'hover:bg-zinc-100'),
        tone.row && selected && 'brightness-[0.97]',
        !done && 'opacity-60',
      )}
    >
      <span class={cn('relative z-[1] grid size-[22px] place-items-center rounded-full border', tone.icon)}>
        <Icon name="bug" class="size-3.5" />
      </span>
      <span class="min-w-0">
        <span
          class={cn(
            'mb-0.5 inline-flex rounded-[4px] border px-1.5 text-[10.5px] leading-4 font-semibold',
            tone.chip,
          )}>{tone.label}</span
        >
        <span class="line-clamp-3 block text-[13px] leading-[18px] font-medium">{finding.event.title}</span>
      </span>
      <span class="text-muted-foreground tabular pt-0.5 text-[11.5px]">{formatClock(offset(item.at))}</span>
    </button>
  {:else}
    <button
      type="button"
      data-key={item.key}
      onclick={() => (open[item.key] = !open[item.key])}
      class={cn(
        'relative grid w-full grid-cols-[22px_minmax(0,1fr)] items-start gap-x-2 rounded-md py-1 pr-2 pl-1.5 text-left',
        item.kind === 'hata' ? 'text-destructive' : 'text-muted-foreground',
        !done && 'opacity-60',
      )}
    >
      <span class="relative z-[1] grid size-[22px] place-items-center rounded-full bg-white">
        <Icon name={item.kind === 'hata' ? 'error' : 'info'} class="size-4" />
      </span>
      <span class={cn('min-w-0 pt-0.5 text-xs leading-[17px]', !open[item.key] && 'line-clamp-1')}
        >{item.text}</span
      >
    </button>
  {/if}
{/snippet}

<div class="relative flex min-h-0 flex-1 flex-col">
  <div
    bind:this={list}
    role="region"
    aria-label="Akış"
    class="scroll-thin min-h-0 flex-1 overflow-y-auto pb-3"
    onwheel={() => (userScrolledAt = Date.now())}
    ontouchmove={() => (userScrolledAt = Date.now())}
  >
    {#each sections.pages as page (page.key)}
      {#if sections.pages.length > 1}
        <div class="flex items-center gap-2 px-3.5 pt-3 pb-1">
          <Icon name="webAsset" class="text-muted-foreground size-4" />
          <span class="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{page.page}</span>
          {#if page.status === 'suruyor'}<Spinner />{:else if page.status === 'bitti'}<Icon
              name="checkCircle"
              class="text-success size-4"
            />{/if}
        </div>
      {/if}

      <div class="px-2 pt-2">
        {#if page.plan}
          <button
            type="button"
            onclick={() => (open[page.key] = !open[page.key])}
            class="text-muted-foreground grid w-full grid-cols-[22px_minmax(0,1fr)] gap-x-2 rounded-md py-1 pr-2 pl-1.5 text-left hover:bg-zinc-100"
          >
            <span class="grid size-[22px] place-items-center"><Icon name="subject" class="size-4" /></span>
            <span class={cn('min-w-0 pt-0.5 text-xs leading-[17px]', !open[page.key] && 'line-clamp-1')}
              ><span class="text-foreground font-medium">Plan · </span>{page.plan}</span
            >
          </button>
        {/if}
        {#each page.opening as item (item.key)}{@render entry(item)}{/each}
      </div>

      {#each page.tasks as task (task.key)}
        {@const isActive = activeTask?.key === task.key}
        {@const dots = findingDots(task)}
        <section class="mt-1" data-key={task.key}>
          <!-- Görev başlığı: kayarken üstte sabit, hep gri; tıkla → görevin başına git. -->
          <div class="sticky top-0 z-[2] border-y border-zinc-200/80 bg-zinc-50/95 px-2 py-0.5 backdrop-blur">
            <button
              type="button"
              onclick={() => ontask(task.at)}
              class="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded-md py-[3px] pr-2 pl-1.5 text-left hover:bg-black/[0.04]"
            >
              <span
                class={cn(
                  'line-clamp-2 text-[12.5px] leading-[18px] font-semibold',
                  isActive ? 'text-foreground' : 'text-foreground/80',
                )}>{task.title}</span
              >
              <span class="text-muted-foreground flex h-[18px] items-center gap-1.5 text-[11.5px]">
                {#if dots.length}
                  <span class="flex items-center gap-0.5">
                    {#each dots as kind, i (i)}<span
                        class={cn('size-1.5 rounded-full', FINDING_TONE[kind].dot)}
                      ></span>{/each}
                  </span>
                {/if}
                <span class="tabular">{task.steps} adım</span>
                {#if task.status === 'bitti'}<Icon
                    name="check"
                    class="text-success size-3.5"
                  />{:else if isActive}<span class="bg-brand size-1.5 animate-pulse rounded-full"></span>{/if}
              </span>
            </button>
          </div>

          <!-- Adımlar dikey akış çizgisi üstünde. -->
          <div class="relative px-2 pb-1">
            <span class="absolute top-1 bottom-2 left-[24.5px] w-px bg-zinc-200" aria-hidden="true"></span>
            {#each task.entries as item (item.key)}{@render entry(item)}{/each}
            {#if task.summary}
              <button
                type="button"
                onclick={() => (open[task.key] = !open[task.key])}
                class="text-muted-foreground relative grid w-full grid-cols-[22px_minmax(0,1fr)] gap-x-2 rounded-md py-1 pr-2 pl-1.5 text-left hover:bg-zinc-100"
              >
                <span class="relative z-[1] grid size-[22px] place-items-center rounded-full bg-white"
                  ><Icon name="subject" class="size-4" /></span
                >
                <span class={cn('min-w-0 pt-0.5 text-xs leading-[17px]', !open[task.key] && 'line-clamp-1')}
                  ><span class="text-foreground font-medium">Özet · </span>{task.summary}</span
                >
              </button>
            {/if}
            {#if !task.entries.length && !task.summary}
              <p class="text-muted-foreground py-1 pl-[42px] text-xs">Henüz adım yok.</p>
            {/if}
          </div>
        </section>
      {/each}
    {/each}

    {#if !sections.pages.length}
      <p class="text-muted-foreground px-4 py-3 text-[13px]">Akış bekleniyor.</p>
    {/if}
  </div>

  {#if away}
    <button
      type="button"
      onclick={backToNow}
      class="bg-card text-brand-strong animate-in fade-in-0 slide-in-from-bottom-1 absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium shadow-md"
    >
      <Icon name="keyboardArrowDown" class="size-4" />Şu ana dön
    </button>
  {/if}
</div>
