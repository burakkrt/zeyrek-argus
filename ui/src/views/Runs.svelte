<script lang="ts">
  import type { RunInfo } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import DataTable from '$lib/components/table/DataTable.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, qs } from '$lib/api'
  import { formatCost, formatDate, formatDuration } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { go } from '$lib/router.svelte'
  import { live } from '$lib/stream.svelte'
  import type { TableColumn, TablePreset } from '$lib/table'
  import { cn } from '$lib/utils'
  import { LIFECYCLE_LABELS, lifecycle } from '$lib/run-steps'
  import { runQuery } from '$lib/workspace.svelte'

  /**
   * Koşular: çalışma alanındaki dalın koşuları, ortak tabloda (kod, sayfalar, durum, tarih, süre, maliyet, bulgu sayısı).
   * Süren koşu canlı güncellenir. "Durum" koşunun bulunduğu adımdır, tek etiket (`lifecycle`: Sırada, Koşu,
   * Değerlendirme, Kapatıldı); koşunun hata iletisi rozetin ipucundadır. Hazır süzgeçler adımlar ve bulgu çıkanlardır. Satıra tıklayınca süren koşu izlenir,
   * biten koşunun değerlendirmesi açılır.
   */
  let runs = $state<RunInfo[]>([])
  let loading = $state(true)
  const rows = $derived(runs.map((r) => live.runs[r.id] ?? r))

  const durationMs = (r: RunInfo) =>
    r.startedAt ? Date.parse(r.finishedAt ?? new Date().toISOString()) - Date.parse(r.startedAt) : null

  /** Koşunun bulduğu bulgu sayısı: yeni ve önceden bilinen birlikte (bastırılanlar hariç). */
  const found = (r: RunInfo) => r.counts.new + r.counts.repeated

  // Rozet tek biçimdir (açık gri zemin, koyu metin); durumun tonu yalnız soldaki noktadadır.
  const DOT = {
    neutral: 'bg-[#98a2b3]',
    info: 'bg-[#0c66e4] animate-pulse',
    warn: 'bg-[#dc6803]',
    success: 'bg-[#12b76a]',
  } as const

  const columns: TableColumn<RunInfo>[] = [
    { key: 'code', label: 'Kod', value: (r) => r.code, required: true, width: 'w-40' },
    { key: 'pages', label: 'Sayfalar', value: (r) => r.pages.join(', ') },
    { key: 'status', label: 'Durum', value: (r) => lifecycle(r).label, kind: 'enum', width: 'w-44' },
    { key: 'createdAt', label: 'Tarih', value: (r) => r.createdAt, kind: 'date', width: 'w-40' },
    {
      key: 'duration',
      label: 'Süre',
      value: durationMs,
      kind: 'number',
      align: 'end',
      filterable: false,
      width: 'w-28',
    },
    {
      key: 'cost',
      label: 'Maliyet',
      value: (r) => r.usage.costUsd,
      kind: 'number',
      align: 'end',
      filterable: false,
      width: 'w-28',
    },
    {
      key: 'issues',
      label: 'Bulgu',
      value: found,
      kind: 'number',
      align: 'end',
      width: 'w-28',
    },
  ]
  // Hazır süzgeçler "Durum" sütununun etiketleridir (yaşam döngüsü sırasıyla); bir de bulgu çıkan koşular.
  const presets: TablePreset<RunInfo>[] = [
    ...LIFECYCLE_LABELS.map((label) => ({ id: label, label, test: (r: RunInfo) => lifecycle(r).label === label })),
    { id: 'bulgulu', label: 'Bulgu çıkan', test: (r) => found(r) > 0 },
  ]

  onMount(() => {
    api<RunInfo[]>(`/kosular${qs(runQuery())}`)
      .then((r) => (runs = r))
      .catch((e: unknown) => notify.error('Koşular okunamadı', e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false))
  })
</script>

<Page title="Koşular" description="Bu dalda yapılan koşular; satıra tıklayınca koşunun sıradaki adımı açılır">
  {#snippet actions()}
    <Button href="#/baslat"><Icon name="add" />Yeni koşu</Button>
  {/snippet}

  <div class="bg-card text-card-foreground rounded-xl border p-6">
    <DataTable
      {rows}
      {columns}
      {presets}
      {loading}
      rowKey={(r) => r.id}
      storageKey="kosular"
      searchPlaceholder="Kod ya da sayfa ara"
      emptyTitle="Henüz koşu yok"
      emptyDescription="Yeni koşu ile ilk denetimi başlat."
      onrowclick={(r) => go(lifecycle(r).href.slice(1))}
      class="max-h-[calc(100svh-330px)]"
    >
      {#snippet cell(row, column)}
        {#if column.key === 'code'}
          <span class="block truncate font-semibold">{row.code}</span>
          <span class="text-muted-foreground block truncate text-xs">{row.project} · {row.application}</span>
        {:else if column.key === 'pages'}
          <span class="block truncate" title={row.pages.join(', ')}>
            {#if row.options.parentRunId}<span class="badge">Devam koşusu</span>{/if}
            {row.pages.length > 2
              ? `${row.pages.slice(0, 2).join(', ')} +${row.pages.length - 2}`
              : row.pages.join(', ')}
          </span>
        {:else if column.key === 'status'}
          {@const state = lifecycle(row)}
          <span class="inline-flex items-center gap-2 whitespace-nowrap" title={row.error ?? undefined}>
            <span
              class="inline-flex h-6 items-center gap-1.5 rounded-md border border-[#e4e7ec] bg-[#f9fafb] px-2 text-[12px] font-medium text-[#344054]"
              ><span class={cn('size-1.5 rounded-full', DOT[state.tone])}></span>{state.label}</span
            >
          </span>
        {:else if column.key === 'createdAt'}
          {formatDate(row.createdAt)}
        {:else if column.key === 'duration'}
          {formatDuration(row.startedAt, row.finishedAt)}
        {:else if column.key === 'cost'}
          {formatCost(row.usage)}
        {:else}
          <span class={cn('tabular-nums', !found(row) && 'text-muted-foreground')}>{found(row)}</span>
        {/if}
      {/snippet}
    </DataTable>
  </div>
</Page>
