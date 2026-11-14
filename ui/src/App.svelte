<script lang="ts">
  import { onMount } from 'svelte'
  import AppShell from '$lib/components/layout/AppShell.svelte'
  import AppSidebar from '$lib/components/layout/AppSidebar.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import { api } from '$lib/api'
  import { crumbsFor, documentTitle } from '$lib/nav'
  import { route } from '$lib/router.svelte'
  import { connect, live } from '$lib/stream.svelte'
  import Issues from './views/Issues.svelte'
  import Memory from './views/Memory.svelte'
  import Monitor from './views/Monitor.svelte'
  import Overview from './views/Overview.svelte'
  import Runs from './views/Runs.svelte'
  import Settings from './views/Settings.svelte'
  import Start from './views/Start.svelte'

  interface Status {
    mcp: { ok: boolean; detail: string }
    anthropic: { set: boolean; source: string | null; hint: string | null }
    activeRunId: string | null
  }

  let status = $state<Status | null>(null)
  const activeRunId = $derived(
    Object.values(live.runs).find((r) => r.status === 'calisiyor')?.id ?? status?.activeRunId ?? null,
  )
  const statusLines = $derived([
    { ok: live.connected, label: live.connected ? 'Sunucuya bağlı' : 'Sunucu bağlantısı yok' },
    ...(status
      ? [
          {
            ok: status.mcp.ok,
            label: status.mcp.ok ? `Platform · ${status.mcp.detail}` : 'Platform ayarlı değil',
            title: status.mcp.detail,
          },
          {
            ok: status.anthropic.set,
            label: status.anthropic.set ? 'Yapay zekâ anahtarı hazır' : 'Yapay zekâ anahtarı yok',
          },
        ]
      : []),
  ])

  // Sekme başlığı sayfayla değişir.
  $effect(() => {
    document.title = documentTitle(route.parts[0])
  })

  onMount(() => {
    connect()
    api<Status>('/durum')
      .then((s) => (status = s))
      .catch(() => undefined)
  })
</script>

<AppShell crumbs={crumbsFor(route.parts[0])}>
  {#snippet sidebar()}<AppSidebar {activeRunId} status={statusLines} />{/snippet}

  {#if route.parts[0] === 'baslat'}
    <Start />
  {:else if ['monitor', 'kosular', 'bulgular', 'hafiza', 'ayarlar'].includes(route.parts[0] ?? '')}
    <!-- Henüz yeni kalıba taşınmamış sayfalar: başlık şeridi yok, eski stiller .legacy içinde. -->
    <Page>
      <div class="legacy">
        {#if route.parts[0] === 'monitor' && route.parts[1]}
          {#key route.parts[1]}<Monitor runId={route.parts[1]} />{/key}
        {:else if route.parts[0] === 'kosular'}
          <Runs />
        {:else if route.parts[0] === 'bulgular'}
          <Issues selectedId={route.parts[1] ?? null} />
        {:else if route.parts[0] === 'hafiza'}
          <Memory />
        {:else if route.parts[0] === 'ayarlar'}
          <Settings />
        {/if}
      </div>
    </Page>
  {:else}
    <!-- Bilinmeyen adres ana sayfadır (iz ve sekme başlığı da öyle der). -->
    <Overview />
  {/if}
</AppShell>
