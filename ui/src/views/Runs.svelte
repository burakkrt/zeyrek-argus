<script lang="ts">
  import type { RunInfo } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import RunStatusBadge from '$lib/components/status/RunStatusBadge.svelte'
  import DataTable from '$lib/components/table/DataTable.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, qs } from '$lib/api'
  import { formatCost, formatDate, formatDuration, RUN_STATUS } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { go } from '$lib/router.svelte'
  import { live } from '$lib/stream.svelte'
  import type { TableColumn, TablePreset } from '$lib/table'
  import { cn } from '$lib/utils'
  import { runQuery } from '$lib/workspace.svelte'

  /**
   * Koşular: çalışma alanındaki dalın koşuları, ortak tabloda (kod, sayfalar, durum, tarih, süre, maliyet, bulgular).
   * Süren koşu canlı güncellenir; satıra tıklayınca koşu detayı (monitör) açılır.
   */
  let runs = $state<RunInfo[]>([])
  let loading = $state(true)
  const rows = $derived(runs.map((r) => live.runs[r.id] ?? r))

  const durationMs = (r: RunInfo) =>
    r.startedAt ? Date.parse(r.finishedAt ?? new Date().toISOString()) - Date.parse(r.startedAt) : null

  const columns: TableColumn<RunInfo>[] = [
    { key: 'code', label: 'Kod', value: (r) => r.code, required: true, width: 'w-40' },
    { key: 'pages', label: 'Sayfalar', value: (r) => r.pages.join(', ') },
    { key: 'status', label: 'Durum', value: (r) => RUN_STATUS[r.status].label, kind: 'enum', width: 'w-36' },
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
      label: 'Yeni bulgu',
      value: (r) => r.counts.new,
      kind: 'number',
      align: 'end',
      width: 'w-32',
    },
  ]
  const presets: TablePreset<RunInfo>[] = [
    { id: 'suren', label: 'Süren', test: (r) => r.status === 'sirada' || r.status === 'calisiyor' },
    { id: 'hatali', label: 'Hatalı', test: (r) => r.status === 'hata' || r.status === 'durduruldu' },
    { id: 'bulgulu', label: 'Yeni bulgulu', test: (r) => r.counts.new > 0 },
  ]

  onMount(() => {
    api<RunInfo[]>(`/kosular${qs(runQuery())}`)
      .then((r) => (runs = r))
      .catch((e: unknown) => notify.error('Koşular okunamadı', e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false))
  })
</script>

<Page
  title="Koşular"
  description="Bu dalda yapılan koşular; satıra tıklayınca koşu adım adım yeniden izlenir"
>
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
      onrowclick={(r) => go(`/monitor/${r.id}`)}
      class="max-h-[calc(100svh-330px)]"
    >
      {#snippet cell(row, column)}
        {#if column.key === 'code'}
          <span class="block truncate font-semibold">{row.code}</span>
          <span class="text-muted-foreground block truncate text-xs">{row.project} · {row.application}</span>
        {:else if column.key === 'pages'}
          <span class="block truncate" title={row.pages.join(', ')}>
            {#if row.options.mode === 'tekrar'}<span class="badge info">Kayıtlı vakalar</span>{/if}
            {#if row.options.mode === 'kapi'}<span class="badge warn">Yayın kapısı</span>{/if}
            {row.pages.length > 2
              ? `${row.pages.slice(0, 2).join(', ')} +${row.pages.length - 2}`
              : row.pages.join(', ')}
          </span>
          {#if row.error}<span class="text-destructive block truncate text-xs" title={row.error}
              >{row.error}</span
            >{/if}
        {:else if column.key === 'status'}
          <RunStatusBadge status={row.status} />
        {:else if column.key === 'createdAt'}
          {formatDate(row.createdAt)}
        {:else if column.key === 'duration'}
          {formatDuration(row.startedAt, row.finishedAt)}
        {:else if column.key === 'cost'}
          {formatCost(row.usage)}
        {:else}
          <span class="inline-flex items-center gap-1.5">
            <span class={cn(!row.counts.new && 'text-muted-foreground')}>{row.counts.new}</span>
            {#if row.counts.repeated}<span class="text-muted-foreground text-xs"
                >+{row.counts.repeated} bilinen</span
              >{/if}
          </span>
        {/if}
      {/snippet}
    </DataTable>
  </div>
</Page>
