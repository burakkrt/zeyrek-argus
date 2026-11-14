<script lang="ts" generics="T">
  import type { Snippet } from 'svelte'
  import { tick } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Combobox from '$lib/components/form/Combobox.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { formatDate } from '$lib/format'
  import {
    columnRules,
    DATE_FILTERS,
    DEFAULT_PAGE_SIZE,
    defaultPrefs,
    distinctValues,
    moveColumn,
    nextSort,
    orderedColumns,
    PAGE_GAP,
    PAGE_SIZES,
    pageSlots,
    pageState,
    parsePrefs,
    prefsChanged,
    queryRows,
    toggleColumn,
    visibleColumns,
    type CellValue,
    type ColumnPrefs,
    type SortState,
    type TableColumn,
    type TablePreset,
  } from '$lib/table'
  import { cn } from '$lib/utils'

  /**
   * Ortak veri tablosu — Zeyrek platformunun tablosunun (`ng-apps-ui` datatable + QM kabuğu) görünümü ve davranışı,
   * istemci tarafında:
   * - Tablonun üstünde hazır süzgeçler, "mavi hap" standardı (QM kabuk standardı §Hazır süzgeç: seçisiz beyaz / #D0D5DD,
   *   seçili #F0F6FF / #0C66E4 / #0B3E99, sayı rozetli).
   * - Kartın üst şeridi (#FCFCFD, 8 px): solda süzgeç varken "Süzgeçleri temizle", sağda tablo araması
   *   (`searchable`, varsayılan açık) ve 32 px araçlar; "Kolon
   *   ayarları" menüsü (220 px; tutamaç + işaret kutusu, sürükle-bırak ya da tutamaçta ↑/↓, "Sıfırla").
   * - Başlık 40 px, 13/500 ikincil renk, büyük harf; sıralı kolon koyu 600 + mavi ok, sıralanabilir kolonda ⇅ üzerine
   *   gelince. Altında 44 px kolon süzgeci satırı; her kutu aynı (30 px, 12 px, 6 px köşe, aynı yer tutucu rengi):
   *   metin / sayı "≈ / = Filtrele", seçenek ve tarih aramalı açılır kutu (ortak `Combobox`, seçince kapanır).
   * - Başlık, süzgeç kutusu ve hücre aynı 12 px yan boşlukta (kutu kenarı başlık yazısıyla hizalı); hücre 14 px,
   *   dikey 8 px; isteğe bağlı satır seçimi; "hiç kayıt yok" ile "süzgeçle eşleşen yok" ayrı boş durum.
   * - Alt şerit (platform `TableFooter`): solda "**20** / 200 kayıt · n seçili", sağda "Sayfa başına" (10–50, varsayılan
   *   20) ve ilk / önceki / sayfa numaraları / sonraki / son düğmeleri (28 px).
   * Mantık `$lib/table`'dadır; bileşen alan bilgisi taşımaz, hücreyi `cell` ile özelleştirirsin. Kolon tercihi
   * `storageKey` ile tarayıcıda hatırlanır.
   */
  let {
    rows,
    columns,
    rowKey,
    presets = [],
    selectable = false,
    selected = $bindable([]),
    storageKey,
    loading = false,
    emptyTitle = 'Kayıt yok',
    emptyDescription,
    cell,
    toolbar,
    searchable = true,
    onrowclick,
    searchPlaceholder = 'Tabloda ara',
    class: className,
  }: {
    rows: T[]
    columns: TableColumn<T>[]
    rowKey: (row: T) => string
    presets?: TablePreset<T>[]
    selectable?: boolean
    selected?: string[]
    storageKey?: string
    loading?: boolean
    emptyTitle?: string
    emptyDescription?: string
    /** Hücreyi özel çiz; verilmezse değer kolon türüne göre biçimlenir (tarih, sayı, boşsa —). */
    cell?: Snippet<[T, TableColumn<T>]>
    /** Üst şeridin sağına, kolon ayarlarının soluna ek araçlar (32 px düğme). */
    toolbar?: Snippet
    /** Üst şeritte tablo araması (metin ve seçenek kolonlarında); varsayılan açık. */
    searchable?: boolean
    /** Satıra tıklayınca (seçimsiz tabloda kaydı açmak için). */
    onrowclick?: (row: T) => void
    searchPlaceholder?: string
    /** Kaydırma kabının yüksekliği (ör. `max-h-[480px]`). */
    class?: string
  } = $props()

  const PREFS_PREFIX = 'argus.tablo.'
  const ALIGN = { start: 'text-left', center: 'text-center', end: 'text-right' } as const
  /** Kolon süzgeci kutusu: metin girdisi ve açılır kutu birebir aynı ölçüde. */
  const FIELD =
    'bg-card h-[30px] w-full min-w-0 rounded-[6px] border text-xs text-foreground outline-none transition-colors focus:border-brand'
  const FIELD_ON = 'border-brand/45 bg-brand-soft/60'
  /** Alt şeridin 28 px sayfa düğmesi. */
  const PAGE_BUTTON =
    'inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] border border-transparent px-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:not-disabled:bg-muted disabled:cursor-default disabled:opacity-40'

  let presetId = $state<string | null>(null)
  let search = $state('')
  let filters = $state<Record<string, string>>({})
  let sort = $state<SortState>(null)
  let prefs = $state<ColumnPrefs>(loadPrefs())
  let page = $state(0)
  let pageSize = $state(DEFAULT_PAGE_SIZE)
  let sizeOpen = $state(false)
  let dragIndex = $state<number | null>(null)
  let overIndex = $state<number | null>(null)
  let menu = $state<HTMLElement | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const preset = $derived(presets.find((p) => p.id === presetId) ?? null)
  const shownColumns = $derived(visibleColumns(columns, prefs))
  const menuColumns = $derived(orderedColumns(columns, prefs))
  const rules = $derived(columnRules(columns, filters, today))
  const view = $derived(queryRows(rows, columns, { search, rules, sort, preset }))
  const paging = $derived(pageState(view.length, pageSize, page))
  const pageRows = $derived(view.slice(paging.start, paging.end))
  const filtered = $derived(!!preset || rules.length > 0 || !!search.trim())
  const pageKeys = $derived(pageRows.map(rowKey))
  const selectedOnPage = $derived(pageKeys.filter((k) => selected.includes(k)).length)
  const presetCounts = $derived(new Map(presets.map((p) => [p.id, rows.filter(p.test).length])))
  const colspan = $derived(shownColumns.length + (selectable ? 1 : 0))

  function loadPrefs(): ColumnPrefs {
    if (!storageKey) return defaultPrefs(columns)
    try {
      return parsePrefs(localStorage.getItem(PREFS_PREFIX + storageKey), columns)
    } catch {
      return defaultPrefs(columns)
    }
  }

  function savePrefs(next: ColumnPrefs) {
    prefs = next
    if (!storageKey) return
    try {
      localStorage.setItem(PREFS_PREFIX + storageKey, JSON.stringify(next))
    } catch {
      /* tarayıcı depolaması kapalıysa hatırlamaz */
    }
  }

  function drop(to: number) {
    if (dragIndex !== null) savePrefs(moveColumn(columns, prefs, dragIndex, to))
    dragIndex = null
    overIndex = null
  }

  // Klavye: tutamaç odaktayken ↑/↓ kolonu bir basamak taşır; odak taşınan kolonla gider (platform davranışı).
  async function moveKey(event: KeyboardEvent, index: number, key: string) {
    const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : null
    if (to === null || to < 0 || to >= menuColumns.length) return
    event.preventDefault()
    savePrefs(moveColumn(columns, prefs, index, to))
    await tick()
    menu?.querySelector<HTMLElement>(`[data-column="${CSS.escape(key)}"]`)?.focus()
  }

  // Süzgeç, hazır süzgeç ya da sıralama değişince ilk sayfaya dönülür.
  function setFilter(key: string, value: string) {
    filters = { ...filters, [key]: value }
    page = 0
  }

  function setPreset(id: string | null) {
    presetId = id
    page = 0
  }

  function clearFilters() {
    presetId = null
    search = ''
    filters = {}
    page = 0
  }

  function toggleRow(key: string) {
    selected = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
  }

  function togglePage(on: boolean) {
    selected = on ? [...new Set([...selected, ...pageKeys])] : selected.filter((k) => !pageKeys.includes(k))
  }

  function display(column: TableColumn<T>, value: CellValue): string {
    if (value === null || value === undefined || value === '') return '—'
    if (column.kind === 'date') return formatDate(String(value))
    if (column.kind === 'number') return Number(value).toLocaleString('tr-TR')
    return String(value)
  }
</script>

<div class="flex min-w-0 flex-col gap-3">
  <!-- Hazır süzgeçler: mavi hap -->
  {#if presets.length}
    <div role="group" aria-label="Hazır süzgeçler" class="flex flex-wrap gap-2">
      {#each [{ id: null, label: 'Tümü', count: rows.length }, ...presets.map( (p) => ({ id: p.id, label: p.label, count: presetCounts.get(p.id) ?? 0 }) )] as option (option.id ?? '*')}
        {@const on = presetId === option.id}
        <button
          type="button"
          aria-pressed={on}
          class={cn(
            'inline-flex h-[30px] items-center gap-2 rounded-full border pr-1.5 pl-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-[#0C66E4] focus-visible:outline-none',
            on
              ? 'border-[#0C66E4] bg-[#F0F6FF] text-[#0B3E99]'
              : 'border-[#D0D5DD] bg-white text-[#3F3F46] hover:border-[#A1A1AA]',
          )}
          onclick={() => setPreset(option.id)}
        >
          {option.label}
          <span
            class={cn(
              'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
              on
                ? 'bg-[#0C66E4] text-white'
                : option.count
                  ? 'bg-[#F3F4F6] text-[#3F3F46]'
                  : 'bg-[#F4F4F5] text-[#A1A1AA]',
            )}>{option.count}</span
          >
        </button>
      {/each}
    </div>
  {/if}

  <div class="bg-card min-w-0 overflow-hidden rounded-lg border">
    <!-- Üst şerit: süzgeçleri temizle · araçlar -->
    <div class="flex h-12 items-center gap-2 border-b bg-[#FCFCFD] px-2">
      {#if filtered}
        <button
          type="button"
          class="bg-brand-soft text-brand-strong hover:bg-brand/15 inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] leading-none font-medium transition-colors"
          onclick={clearFilters}
        >
          <Icon name="close" class="size-4" />Süzgeçleri temizle
        </button>
      {/if}
      <div class="ml-auto flex items-center gap-1.5">
        {#if selectable && selected.length}
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-8 items-center rounded-[6px] px-2.5 text-[13px] leading-none"
            onclick={() => (selected = [])}>Seçimi temizle</button
          >
        {/if}
        {#if searchable}
          <div class="relative w-60">
            <Icon
              name="search"
              class="text-placeholder pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <input
              bind:value={search}
              oninput={() => (page = 0)}
              aria-label="Tabloda ara"
              placeholder={searchPlaceholder}
              class={cn(
                'bg-card placeholder:text-placeholder focus:border-brand h-8 w-full rounded-[6px] border pr-7 pl-8 text-[13px] outline-none transition-colors',
                search && 'border-brand/45',
              )}
            />
            {#if search}
              <button
                type="button"
                aria-label="Aramayı temizle"
                class="text-placeholder hover:text-foreground absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded"
                onclick={() => ((search = ''), (page = 0))}
              >
                <Icon name="close" class="size-3.5" />
              </button>
            {/if}
          </div>
        {/if}
        {@render toolbar?.()}
        <Popover.Root>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                title="Kolonlar"
                aria-label="Kolonlar"
                class="bg-card text-foreground hover:bg-muted/60 aria-expanded:bg-muted/60 grid size-8 place-items-center rounded-[6px] border transition-colors"
              >
                <Icon name="viewColumn" class="size-4" />
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content align="end" class="w-[220px] gap-0 p-1">
            <div bind:this={menu} class="flex flex-col">
              <span class="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-semibold">Kolon ayarları</span>
              {#each menuColumns as column, index (column.key)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  draggable="true"
                  class={cn(
                    'hover:bg-muted/70 relative flex h-7 items-center gap-0.5 rounded pr-2 pl-0.5',
                    dragIndex === index && 'opacity-40',
                  )}
                  ondragstart={(e) => {
                    dragIndex = index
                    e.dataTransfer?.setData('text/plain', column.key)
                    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
                  }}
                  ondragover={(e) => {
                    e.preventDefault()
                    overIndex = index
                  }}
                  ondrop={(e) => {
                    e.preventDefault()
                    drop(index)
                  }}
                  ondragend={() => ((dragIndex = null), (overIndex = null))}
                >
                  {#if overIndex === index && dragIndex !== null && dragIndex !== index}
                    <!-- Bırakılacak yer: köşesiz düz çizgi (satırın yuvarlak köşesi çizgiyi kırpmasın) -->
                    <span class="bg-brand pointer-events-none absolute inset-x-0 -top-px h-0.5"></span>
                  {/if}
                  <button
                    type="button"
                    data-column={column.key}
                    title="{column.label} kolonunu taşı (↑/↓)"
                    aria-label="{column.label} kolonunu taşı"
                    class="hover:text-foreground grid h-6 w-5 shrink-0 cursor-grab place-items-center rounded text-[#94A3B8]"
                    onkeydown={(e) => moveKey(e, index, column.key)}
                  >
                    <Icon name="dragIndicator" class="size-4" />
                  </button>
                  <label class="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px]">
                    <Checkbox
                      checked={column.required || !prefs.hidden.includes(column.key)}
                      disabled={column.required}
                      onCheckedChange={() => savePrefs(toggleColumn(prefs, column.key))}
                    />
                    <span class="truncate">{column.label}</span>
                  </label>
                </div>
              {/each}
              {#if prefsChanged(columns, prefs)}
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground hover:bg-muted mt-1 self-start rounded px-2 py-1.5 text-xs font-medium"
                  onclick={() => savePrefs(defaultPrefs(columns))}>Sıfırla</button
                >
              {/if}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>
    </div>

    <div class={cn('overflow-auto', className)}>
      <table class="w-full table-fixed border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {#if selectable}
              <th class="sticky top-0 z-10 h-10 w-10 border-b bg-[#FCFCFD] pr-0 pl-3">
                <Checkbox
                  aria-label="Bu sayfadaki satırların hepsini seç"
                  checked={pageKeys.length > 0 && selectedOnPage === pageKeys.length}
                  indeterminate={selectedOnPage > 0 && selectedOnPage < pageKeys.length}
                  disabled={!pageKeys.length}
                  onCheckedChange={(on) => togglePage(on)}
                />
              </th>
            {/if}
            {#each shownColumns as column (column.key)}
              {@const sorted = sort?.key === column.key ? sort.dir : null}
              <th
                lang="tr"
                class={cn(
                  'text-muted-foreground group sticky top-0 z-10 h-10 border-b bg-[#FCFCFD] px-3 text-[13px] leading-[18px] font-medium whitespace-nowrap uppercase',
                  ALIGN[column.align ?? 'start'],
                  column.width,
                )}
                aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
              >
                {#if column.sortable === false}
                  <span class="block truncate">{column.label}</span>
                {:else}
                  <button
                    type="button"
                    class={cn(
                      'inline-flex max-w-full items-center gap-1 uppercase',
                      column.align === 'end' && 'flex-row-reverse',
                    )}
                    onclick={() => ((sort = nextSort(sort, column.key)), (page = 0))}
                  >
                    <span class={cn('truncate', sorted && 'text-foreground font-semibold')}
                      >{column.label}</span
                    >
                    {#if sorted}
                      <Icon
                        name={sorted === 'desc' ? 'arrowDown' : 'arrowUp'}
                        class="text-brand size-3.5 shrink-0"
                      />
                    {:else}
                      <Icon
                        name="unfoldMore"
                        class="size-3.5 shrink-0 text-[#CBD5E1] opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    {/if}
                  </button>
                {/if}
              </th>
            {/each}
          </tr>
          <!-- Kolon süzgeci satırı -->
          <tr>
            {#if selectable}<th class="bg-card sticky top-10 z-10 h-11 border-b"></th>{/if}
            {#each shownColumns as column (column.key)}
              {@const value = filters[column.key] ?? ''}
              <th class="bg-card sticky top-10 z-10 h-11 border-b px-3 font-normal">
                {#if column.filterable === false}
                  <span></span>
                {:else if column.kind === 'enum' || column.kind === 'date'}
                  <Combobox
                    size="sm"
                    options={[
                      { value: '', label: 'Tümü' },
                      ...(column.kind === 'date'
                        ? DATE_FILTERS
                        : distinctValues(rows, column).map((v) => ({ value: v, label: v }))),
                    ]}
                    value={value || null}
                    placeholder={column.kind === 'date' ? 'Tarih seçin' : 'Tümü'}
                    searchPlaceholder="Ara…"
                    class={cn(value && FIELD_ON)}
                    onchange={(next) => setFilter(column.key, next)}
                  />
                {:else}
                  <div class="relative flex items-center">
                    <span
                      class={cn(
                        'pointer-events-none absolute left-2 w-3 text-center text-xs font-semibold',
                        value ? 'text-brand' : 'text-placeholder',
                      )}>{column.kind === 'number' ? '=' : '≈'}</span
                    >
                    <input
                      {value}
                      type={column.kind === 'number' ? 'number' : 'text'}
                      aria-label="{column.label} süzgeci"
                      placeholder="Filtrele"
                      oninput={(e) => setFilter(column.key, e.currentTarget.value)}
                      class={cn(FIELD, 'placeholder:text-placeholder pr-6 pl-7', value && FIELD_ON)}
                    />
                    {#if value}
                      <button
                        type="button"
                        aria-label="{column.label} süzgecini temizle"
                        class="hover:text-brand hover:bg-brand-soft text-placeholder absolute right-1 grid size-5 place-items-center rounded"
                        onclick={() => setFilter(column.key, '')}
                      >
                        <Icon name="close" class="size-3.5" />
                      </button>
                    {/if}
                  </div>
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each pageRows as row (rowKey(row))}
            {@const key = rowKey(row)}
            {@const on = selected.includes(key)}
            <tr
              class={cn(
                (selectable || onrowclick) && 'cursor-pointer',
                on ? 'bg-brand-soft/50' : 'hover:bg-muted/40',
              )}
              onclick={selectable ? () => toggleRow(key) : onrowclick ? () => onrowclick(row) : undefined}
            >
              {#if selectable}
                <td class="border-b py-2 pr-0 pl-3 align-middle">
                  <Checkbox
                    checked={on}
                    aria-label="Satırı seç"
                    onclick={(e: MouseEvent) => e.stopPropagation()}
                    onCheckedChange={() => toggleRow(key)}
                  />
                </td>
              {/if}
              {#each shownColumns as column (column.key)}
                {@const value = column.value(row)}
                <td
                  class={cn(
                    'border-b px-3 py-2 align-middle',
                    ALIGN[column.align ?? 'start'],
                    column.kind === 'number' && 'tabular-nums',
                    (value === null || value === undefined || value === '') && 'text-muted-foreground',
                  )}
                >
                  {#if cell}{@render cell(row, column)}{:else}<span class="block truncate"
                      >{display(column, value)}</span
                    >{/if}
                </td>
              {/each}
            </tr>
          {:else}
            <tr>
              <td {colspan} class="px-4 py-12">
                <div class="flex flex-col items-center gap-1.5 text-center text-[13px]">
                  <Icon name={filtered ? 'search' : 'inbox'} class="text-muted-foreground mb-1 size-7" />
                  {#if loading}
                    <p class="text-muted-foreground">Yükleniyor…</p>
                  {:else if filtered && rows.length}
                    <p class="text-sm font-semibold">Eşleşen kayıt yok</p>
                    <p class="text-muted-foreground">Süzgeçleri gevşet ya da temizle.</p>
                    <Button variant="outline" size="sm" class="mt-2" onclick={clearFilters}
                      >Süzgeçleri temizle</Button
                    >
                  {:else}
                    <p class="text-sm font-semibold">{emptyTitle}</p>
                    {#if emptyDescription}<p class="text-muted-foreground">{emptyDescription}</p>{/if}
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Alt şerit: kayıt özeti · sayfa başına · sayfa düğmeleri -->
    <div
      class="text-muted-foreground flex min-h-12 flex-wrap items-center justify-between gap-4 border-t px-4 py-2.5 text-[13px]"
    >
      <span class="whitespace-nowrap tabular-nums">
        <b class="text-foreground font-semibold">{paging.end - paging.start}</b>
        {` / ${view.length} kayıt${filtered ? ` (toplam ${rows.length})` : ''}`}
        {#if selectable && selected.length}{` · ${selected.length} seçili`}{/if}
      </span>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 text-xs whitespace-nowrap">
          <span>Sayfa başına</span>
          <Popover.Root bind:open={sizeOpen}>
            <Popover.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  aria-label="Sayfa başına satır"
                  class="bg-card text-foreground aria-expanded:border-brand inline-flex h-[30px] min-w-[60px] items-center justify-between gap-1.5 rounded-[6px] border px-2 text-xs"
                >
                  {pageSize}<Icon name="keyboardArrowDown" class="text-muted-foreground size-3.5" />
                </button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content align="end" side="top" class="w-24 gap-0 p-1">
              {#each PAGE_SIZES as size (size)}
                <button
                  type="button"
                  class={cn(
                    'hover:bg-muted flex h-[30px] items-center rounded px-2 text-left text-[13px]',
                    size === pageSize && 'bg-brand-soft text-brand-strong hover:bg-brand-soft',
                  )}
                  onclick={() => ((pageSize = size), (page = 0), (sizeOpen = false))}>{size}</button
                >
              {/each}
            </Popover.Content>
          </Popover.Root>
        </div>

        <nav class="flex items-center gap-0.5" aria-label="Sayfaya git">
          <button
            type="button"
            class={cn(PAGE_BUTTON, 'min-w-6 px-0')}
            aria-label="İlk sayfa"
            title="İlk sayfa"
            disabled={paging.current === 0}
            onclick={() => (page = 0)}><Icon name="firstPage" class="size-4" /></button
          >
          <button
            type="button"
            class={cn(PAGE_BUTTON, 'min-w-6 px-0')}
            aria-label="Önceki sayfa"
            disabled={paging.current === 0}
            onclick={() => (page = paging.current - 1)}><Icon name="chevronLeft" class="size-4" /></button
          >
          {#each pageSlots(paging.current, paging.pages) as slot, index (index)}
            {#if slot === PAGE_GAP}
              <span class="px-1">…</span>
            {:else}
              <button
                type="button"
                class={cn(
                  PAGE_BUTTON,
                  slot === paging.current &&
                    'text-foreground bg-card border-border shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
                )}
                aria-current={slot === paging.current ? 'page' : undefined}
                onclick={() => (page = slot)}>{slot + 1}</button
              >
            {/if}
          {/each}
          <button
            type="button"
            class={cn(PAGE_BUTTON, 'min-w-6 px-0')}
            aria-label="Sonraki sayfa"
            disabled={paging.current >= paging.pages - 1}
            onclick={() => (page = paging.current + 1)}><Icon name="chevronRight" class="size-4" /></button
          >
          <button
            type="button"
            class={cn(PAGE_BUTTON, 'min-w-6 px-0')}
            aria-label="Son sayfa"
            title="Son sayfa"
            disabled={paging.current >= paging.pages - 1}
            onclick={() => (page = paging.pages - 1)}><Icon name="lastPage" class="size-4" /></button
          >
        </nav>
      </div>
    </div>
  </div>
</div>
