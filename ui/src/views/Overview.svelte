<script lang="ts">
  import type { FindingKind, Issue, RunInfo } from '@argus/shared'
  import { BarChart } from 'layerchart'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import EmptyState from '$lib/components/layout/EmptyState.svelte'
  import Grid from '$lib/components/layout/Grid.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import Panel from '$lib/components/layout/Panel.svelte'
  import StatCard from '$lib/components/layout/StatCard.svelte'
  import RunStatusBadge from '$lib/components/status/RunStatusBadge.svelte'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Chart from '$lib/components/ui/chart/index.js'
  import * as Table from '$lib/components/ui/table/index.js'
  import { api } from '$lib/api'
  import { formatCost, formatDate, formatDuration, formatMoney, formatSeconds } from '$lib/format'
  import { overview } from '$lib/overview'

  let runs = $state<RunInfo[] | null>(null)
  let issues = $state<Issue[] | null>(null)
  let error = $state<string | null>(null)

  const summary = $derived(runs && issues ? overview(runs, issues) : null)
  const recentRuns = $derived((runs ?? []).slice(0, 6))

  const KINDS: Array<{ kind: FindingKind; label: string; bar: string }> = [
    { kind: 'kesin', label: 'Kesin', bar: 'bg-destructive' },
    { kind: 'tutarsizlik', label: 'Tutarsızlık', bar: 'bg-warning' },
    { kind: 'not', label: 'Not', bar: 'bg-chart-2' },
  ]

  const chartConfig = {
    newIssues: { label: 'Yeni bulgu', color: 'var(--chart-1)' },
  } satisfies Chart.ChartConfig

  onMount(() => {
    Promise.all([api<RunInfo[]>('/kosular'), api<Issue[]>('/sorunlar')])
      .then(([r, i]) => {
        runs = r
        issues = i
      })
      .catch((e: unknown) => (error = e instanceof Error ? e.message : String(e)))
  })
</script>

<Page title="Genel bakış" description="Son 14 günün kalite kontrol özeti: bulgular, koşular, maliyet ve süre">
  {#snippet actions()}
    <Button href="#/bulgular" variant="outline">Bulgular</Button>
    <Button href="#/baslat">Yeni koşu</Button>
  {/snippet}

  {#if error}
    <Alert.Root variant="destructive">
      <Icon name="error" />
      <Alert.Title>Özet yüklenemedi</Alert.Title>
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {:else if summary}
    <Grid cols="4">
      <StatCard label="Açık bulgu" value={String(summary.openIssues)}>
        {#snippet hint()}<span class="text-destructive">+{summary.newThisWeek}</span> bu hafta yeni{/snippet}
      </StatCard>
      <StatCard label="Koşu" value={String(summary.runs)} hint={`${summary.pages} sayfa denetlendi`} />
      <StatCard
        label="Sayfa başı maliyet"
        value={formatMoney(summary.costPerPage)}
        hint={`Toplam ${formatMoney(summary.totalCost)}`}
      />
      <StatCard
        label="Sayfa başı süre"
        value={formatSeconds(summary.secondsPerPage)}
        hint={`${summary.awaitingDecision} bulgu karar bekliyor`}
      />
    </Grid>

    <Grid cols="2-1">
      <Panel title="Yeni bulgu" description="Bulgunun ilk görüldüğü güne göre">
        <Chart.Container config={chartConfig} class="aspect-auto h-60 w-full">
          <BarChart
            data={summary.daily}
            x="label"
            axis="x"
            bandPadding={0.35}
            series={[{ key: 'newIssues', label: 'Yeni bulgu', color: 'var(--color-newIssues)' }]}
          >
            {#snippet tooltip()}<Chart.Tooltip hideLabel={false} />{/snippet}
          </BarChart>
        </Chart.Container>
      </Panel>
      <Panel title="Açık bulgular" description="Türe göre">
        <div class="flex flex-col gap-4">
          {#each KINDS as item (item.kind)}
            {@const count = summary.byKind[item.kind]}
            <div class="flex flex-col gap-1.5">
              <div class="flex justify-between text-sm">
                <span>{item.label}</span><span class="tabular font-medium">{count}</span>
              </div>
              <div class="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  class={`h-full rounded-full ${item.bar}`}
                  style:width={`${summary.openIssues ? (count / summary.openIssues) * 100 : 0}%`}
                ></div>
              </div>
            </div>
          {/each}
        </div>
      </Panel>
    </Grid>

    <Panel title="Son koşular" flush>
      {#snippet actions()}<Button href="#/kosular" variant="ghost" size="sm">Tümü</Button>{/snippet}
      {#if recentRuns.length}
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head class="pl-6">Başlangıç</Table.Head>
              <Table.Head>Sayfalar</Table.Head>
              <Table.Head>Ortam</Table.Head>
              <Table.Head>Durum</Table.Head>
              <Table.Head class="text-right">Süre</Table.Head>
              <Table.Head class="text-right">Maliyet</Table.Head>
              <Table.Head class="pr-6 text-right">Yeni bulgu</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each recentRuns as run (run.id)}
              <Table.Row class="cursor-pointer" onclick={() => (location.hash = `/monitor/${run.id}`)}>
                <Table.Cell class="tabular pl-6">{formatDate(run.createdAt)}</Table.Cell>
                <Table.Cell class="max-w-[320px] truncate">
                  {run.pages.length === 1 ? run.pages[0] : `${run.pages[0]} +${run.pages.length - 1}`}
                </Table.Cell>
                <Table.Cell class="text-muted-foreground">{run.environment}</Table.Cell>
                <Table.Cell><RunStatusBadge status={run.status} /></Table.Cell>
                <Table.Cell class="tabular text-right"
                  >{formatDuration(run.startedAt, run.finishedAt)}</Table.Cell
                >
                <Table.Cell class="tabular text-right">{formatCost(run.usage)}</Table.Cell>
                <Table.Cell class="tabular pr-6 text-right">{run.counts.new}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {:else}
        <EmptyState
          icon="history"
          title="Henüz koşu yok"
          description="İlk denetimi Yeni koşu ile başlatın."
        />
      {/if}
    </Panel>
  {/if}
</Page>
