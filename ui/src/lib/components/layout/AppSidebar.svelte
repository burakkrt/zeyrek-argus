<script lang="ts">
  import { tick, type Snippet } from 'svelte'
  import { cubicOut } from 'svelte/easing'
  import { slide } from 'svelte/transition'
  import Icon from '$lib/components/Icon.svelte'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'
  import { APP_NAME, NAV_GROUPS, filterNav, locate, type NavEntry, type NavPage } from '$lib/nav'
  import { route } from '$lib/router.svelte'
  import { cn } from '$lib/utils'
  import StatusLine from './StatusLine.svelte'
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte'

  /**
   * Kenar menü: IMS Cortex menüsünün (ng-apps-ui `navigations`, sidebar düzeni, QM ayarı) birebir karşılığı.
   *
   * - 264 px; başlık üst çubukla aynı yükseklikte, sağda yalnız ikonlu daraltma düğmesi (Phosphor `sidebar-simple`).
   *   64 px şeride daralır (tercih çerezde); şeritte açma düğmesi başlık çizgisiyle kenarın kesiştiği 24 px yuvarlak.
   * - En altta çalışma alanı kartı (`WorkspaceSwitcher`, IMS Cortex kullanıcı kartının yeri); "Menüde ara…" kutusu (`/` odaklar): eşleşen
   *   modüller açık gelir.
   * - Satır 40 px, panelden 8 px içeride, sol dolgu 10.4 px, ikon 18 px Phosphor Duotone, ikon-etiket 10 px, 14 px.
   *   Ağırlık: üst düzey satır 500, alt sayfa 400, aktif sayfa ve aktif yoldaki modül 600. Üzerine gelince açık gri; aktif sayfa açık
   *   mavi zemin + koyu yazı + mavi ikon; aktif yoldaki modülün ikonu mavi.
   * - Modül akordeondur: aynı anda tek modül açık, aktif sayfanın modülü kendiliğinden açılır; 180 ms açılır, ok döner.
   *   Alt sayfalar 28 px girintili, modül ikonunun ekseninde 1 px kılavuz çizgisi (aktif yolda mavi).
   * - Grup başlığı büyük harf, 11.2 px / 500, harf aralığı 0.07em, soluk ikincil renk; `placement: 'bottom'` grubu (Sistem)
   *   menünün dibine yaslanır.
   * - Şeritte satır 48×44 ortalı, ikon 22.5 px, etiket ipucu olur; modül yana açılan panelde alt sayfalarını gösterir;
   *   grup başlığı yerine ince ayraç.
   */
  let {
    activeRunId = null,
    status,
  }: {
    activeRunId?: string | null
    status: Array<{ ok: boolean; label: string; title?: string }>
  } = $props()

  type Attrs = Record<string, unknown>
  type Trigger = Snippet<[Attrs]>

  const sidebar = Sidebar.useSidebar()
  const rail = $derived(!sidebar.open && !sidebar.isMobile)

  let query = $state('')
  let searchInput = $state<HTMLInputElement | null>(null)
  // İlk çizimde aktif sayfanın modülü açık başlar: sonradan açılırsa yenilemede akordeon kapanıp yeniden açılıyordu.
  let openModule = $state<string | null>(locate(route.parts[0]).module ?? null)

  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const SLIDE = { duration: reducedMotion ? 0 : 180, easing: cubicOut }

  // Canlı koşu varken Koşular modülünün altına eklenir.
  const groups = $derived(
    NAV_GROUPS.map((group) => ({
      ...group,
      entries: group.entries.map((entry) =>
        entry.label === 'Koşular' && activeRunId
          ? {
              ...entry,
              children: [...(entry.children ?? []), { path: `monitor/${activeRunId}`, label: 'Canlı koşu' }],
            }
          : entry,
      ),
    })),
  )
  const visible = $derived(filterNav(groups, query))

  const isActive = (path: string) => route.parts[0] === path.split('/')[0]
  const inTrail = (entry: NavEntry) => (entry.children ?? []).some((c) => isActive(c.path))
  const isOpen = (entry: NavEntry) => (query.trim() ? true : openModule === entry.label)

  // Sayfa değişince aktif sayfanın modülü açılır (akordeon: öbürü kapanır).
  $effect(() => {
    const module = locate(route.parts[0]).module
    if (module) openModule = module
  })

  function toggleModule(entry: NavEntry) {
    openModule = openModule === entry.label ? null : entry.label
  }

  function focusSearch() {
    if (!sidebar.open) sidebar.setOpen(true)
    tick().then(() => searchInput?.focus())
  }

  function onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null
    const typing = target?.closest('input, textarea, select, [contenteditable="true"]')
    if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      focusSearch()
    }
  }

  const row =
    'mx-2 flex h-10 min-w-0 items-center gap-2.5 rounded-lg pr-3 pl-[0.65rem] text-left text-sm text-sidebar-foreground ' +
    'transition-colors duration-[120ms] hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 outline-none ' +
    '[&_svg]:size-[18px] [&_svg]:shrink-0'
  const railRow =
    'mx-auto my-0.5 grid h-11 w-12 place-items-center rounded-lg text-sidebar-foreground transition-colors duration-[120ms] ' +
    'hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 outline-none [&_svg]:size-[22.5px]'
  const active = 'bg-brand-soft font-semibold text-foreground hover:bg-brand-soft [&_svg]:text-brand'
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet railTip(label: string, trigger: Trigger)}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}{@render trigger(props)}{/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content side="right">{label}</Tooltip.Content>
  </Tooltip.Root>
{/snippet}

{#snippet pageLink(page: NavPage, child: boolean)}
  <a
    href={`#/${page.path}`}
    class={cn(row, child ? 'mr-2 ml-9 pl-[0.65rem]' : '', isActive(page.path) && active)}
    aria-current={isActive(page.path) ? 'page' : undefined}
  >
    <span class="truncate leading-[1.45]">{page.label}</span>
    {#if page.path.startsWith('monitor/')}<span class="bg-info size-1.5 shrink-0 animate-pulse rounded-full"
      ></span>{/if}
  </a>
{/snippet}

<Sidebar.Root collapsible="icon" class="z-40">
  <Sidebar.Header
    class="relative h-14 flex-row items-center gap-2 border-b px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
  >
    <a href="#/genel" class="flex min-w-0 items-center gap-2.5" aria-label={APP_NAME}>
      <span class="bg-primary text-primary-foreground grid size-8 shrink-0 place-items-center rounded-lg">
        <Icon name="visibility" class="size-[18px]" />
      </span>
      <span class="truncate text-[15px] font-semibold tracking-[-0.2px] group-data-[collapsible=icon]:hidden">
        {APP_NAME}
      </span>
    </a>
    {#if rail}
      <button
        type="button"
        onclick={() => sidebar.setOpen(true)}
        class="bg-card text-muted-foreground hover:bg-secondary hover:text-foreground absolute top-full right-0 z-10 grid size-6 translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border shadow-xs"
        aria-label="Menüyü genişlet"
        title="Menüyü genişlet"
      >
        <Icon name="chevronRight" class="size-4" />
      </button>
    {:else}
      <button
        type="button"
        onclick={() => sidebar.setOpen(false)}
        class="text-muted-foreground hover:bg-secondary hover:text-foreground ml-auto grid size-8 shrink-0 place-items-center rounded-lg"
        aria-label="Menüyü daralt"
        title="Menüyü daralt"
      >
        <Icon name="sidebarSimple" class="size-[18px]" />
      </button>
    {/if}
  </Sidebar.Header>

  {#if !rail}
    <label
      class="bg-secondary text-muted-foreground focus-within:border-brand focus-within:bg-card mx-2 mt-2 mb-1 flex h-9 shrink-0 items-center gap-1 rounded-lg border px-2 transition-colors"
    >
      <Icon name="search" class="size-[18px]" />
      <input
        bind:this={searchInput}
        bind:value={query}
        onkeydown={(e) => e.key === 'Escape' && ((query = ''), searchInput?.blur())}
        class="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
        placeholder="Menüde ara…"
        aria-label="Menüde ara"
      />
      <kbd class="bg-card rounded-sm border px-1.5 text-[11px] leading-[1.5]">/</kbd>
    </label>
  {/if}

  <Sidebar.Content class="gap-0.5 pt-1 pb-2">
    {#if rail}
      {@render railTip('Menüde ara', railSearch)}
      {#snippet railSearch(props: Attrs)}
        <button type="button" {...props} onclick={focusSearch} class={railRow} aria-label="Menüde ara">
          <Icon name="search" />
        </button>
      {/snippet}
    {/if}

    {#each visible as group, gi (group.label ?? gi)}
      <div class={cn('flex flex-col gap-0.5', group.placement === 'bottom' && 'mt-auto')}>
        {#if group.label}
          {#if rail}
            <div class="mx-3 my-1.5 border-t"></div>
          {:else}
            <div
              class="text-muted-foreground/70 px-[0.65rem] pt-3 pb-2 text-[0.7rem] leading-[1.45] font-medium tracking-[0.07em] uppercase"
            >
              {group.label}
            </div>
          {/if}
        {/if}

        {#each group.entries as entry (entry.label)}
          {#if entry.children}
            {#if rail}
              <Popover.Root>
                <Popover.Trigger>
                  {#snippet child({ props })}
                    <button
                      type="button"
                      {...props}
                      class={cn(railRow, inTrail(entry) && '[&_svg]:text-brand')}
                      aria-label={entry.label}
                      title={entry.label}
                    >
                      <Icon name={entry.icon} />
                    </button>
                  {/snippet}
                </Popover.Trigger>
                <Popover.Content side="right" align="start" sideOffset={8} class="w-60 gap-0.5 px-0 py-2">
                  <div class="text-muted-foreground px-4 pt-1 pb-2 text-[13px] font-semibold">
                    {entry.label}
                  </div>
                  {#each entry.children as page (page.path)}{@render pageLink(page, false)}{/each}
                </Popover.Content>
              </Popover.Root>
            {:else}
              <button
                type="button"
                onclick={() => toggleModule(entry)}
                class={cn(
                  row,
                  'font-medium',
                  inTrail(entry) && 'font-semibold text-foreground [&_svg]:text-brand',
                )}
                aria-expanded={isOpen(entry)}
              >
                <Icon name={entry.icon} />
                <span class="flex-1 truncate leading-[1.45]">{entry.label}</span>
                <Icon
                  name="keyboardArrowDown"
                  class={cn(
                    'text-muted-foreground! transition-transform duration-[180ms]',
                    isOpen(entry) && 'rotate-180',
                  )}
                />
              </button>
              {#if isOpen(entry)}
                <div
                  transition:slide={SLIDE}
                  class={cn(
                    'relative flex flex-col gap-0.5 before:absolute before:inset-y-[0.2rem] before:left-[calc(8px+0.65rem+9px-0.5px)] before:w-px',
                    inTrail(entry) ? 'before:bg-brand/45' : 'before:bg-border',
                  )}
                >
                  {#each entry.children as page (page.path)}{@render pageLink(page, true)}{/each}
                </div>
              {/if}
            {/if}
          {:else if entry.path}
            {@const path = entry.path}
            {#if rail}
              {@render railTip(entry.label, railLeaf)}
              {#snippet railLeaf(props: Attrs)}
                <a
                  href={`#/${path}`}
                  {...props}
                  class={cn(
                    railRow,
                    isActive(path) && 'bg-brand-soft hover:bg-brand-soft [&_svg]:text-brand',
                  )}
                  aria-label={entry.label}
                  aria-current={isActive(path) ? 'page' : undefined}
                >
                  <Icon name={entry.icon} />
                </a>
              {/snippet}
            {:else}
              <a
                href={`#/${path}`}
                class={cn(row, 'font-medium', isActive(path) && active)}
                aria-current={isActive(path) ? 'page' : undefined}
              >
                <Icon name={entry.icon} />
                <span class="truncate leading-[1.45]">{entry.label}</span>
              </a>
            {/if}
          {/if}
        {/each}
      </div>
    {/each}

    {#if !visible.length}
      <p class="text-muted-foreground px-4 py-3 text-[13px]">Menüde eşleşen sayfa yok.</p>
    {/if}
  </Sidebar.Content>

  <Sidebar.Footer class="gap-1.5 border-t p-3 group-data-[collapsible=icon]:hidden">
    {#each status as line (line.label)}
      <StatusLine ok={line.ok} label={line.label} title={line.title} />
    {/each}
  </Sidebar.Footer>

  <div class="shrink-0 border-t p-2">
    <WorkspaceSwitcher />
  </div>
</Sidebar.Root>
