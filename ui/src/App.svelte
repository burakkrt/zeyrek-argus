<script lang="ts">
  import type { StorageStatus } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import AppShell from '$lib/components/layout/AppShell.svelte'
  import AppSidebar from '$lib/components/layout/AppSidebar.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import WorkspaceForm from '$lib/components/layout/WorkspaceForm.svelte'
  import * as Card from '$lib/components/ui/card/index.js'
  import { api, post } from '$lib/api'
  import { formatBytes } from '$lib/format'
  import { crumbsFor, documentTitle } from '$lib/nav'
  import { notify } from '$lib/notify.svelte'
  import { pageName } from '$lib/page-name.svelte'
  import { go, route } from '$lib/router.svelte'
  import { connect, live } from '$lib/stream.svelte'
  import { loadWorkspace, workspace } from '$lib/workspace.svelte'
  import Issues from './views/Issues.svelte'
  import Memory from './views/Memory.svelte'
  import Monitor from './views/Monitor.svelte'
  import Review from './views/Review.svelte'
  import Plan from './views/Plan.svelte'
  import Overview from './views/Overview.svelte'
  import Runs from './views/Runs.svelte'
  import Settings from './views/Settings.svelte'
  import Start from './views/Start.svelte'
  import YapayZeka from './views/YapayZeka.svelte'

  interface Status {
    mcp: { ok: boolean; detail: string }
    anthropic: { set: boolean; source: string | null; hint: string | null }
    provider: 'abonelik' | 'api'
    activeRunId: string | null
  }

  let status = $state<Status | null>(null)
  let loadError = $state<string | null>(null)
  // Yerel depolama sınırı aşıldıysa açılışta üç günde en çok bir kez (karar sunucuda) gösterilen şerit.
  let storageNotice = $state<StorageStatus | null>(null)
  // Menüdeki "Canlı koşu": yalnız gerçekten koşan koşu. Planını yazan koşu da "çalışıyor"dur ama henüz koşmuyor;
  // onu göstermek izleme ekranını açıp Plan'a yönlendiriyordu (sayfa iki kez yükleniyordu).
  const activeRunId = $derived.by(() => {
    const running = Object.values(live.runs).find((r) => r.status === 'calisiyor')
    const id = running?.id ?? status?.activeRunId ?? null
    // Durumu bilinmeyen koşu (yenilemeden hemen sonra canlı akış henüz gelmemişken) gösterilmez; ilk güncellemede gelir.
    const known = id ? (live.runs[id] ?? running) : null
    return known && !(known.planState && known.planState !== 'onaylandi') ? id : null
  })
  const statusLines = $derived([
    { ok: live.connected, label: live.connected ? 'Sunucuya bağlı' : 'Sunucu bağlantısı yok' },
    ...(status
      ? [
          {
            ok: status.mcp.ok,
            label: status.mcp.ok ? `Platform · ${status.mcp.detail}` : 'Platform ayarlı değil',
            title: status.mcp.detail,
          },
          status.provider === 'abonelik'
            ? { ok: true, label: 'Model: Claude hesabı (abonelik)' }
            : {
                ok: status.anthropic.set,
                label: status.anthropic.set ? 'Model: API anahtarı hazır' : 'Model: API anahtarı yok',
              },
        ]
      : []),
  ])

  // Kayıttan açılan sayfanın adı adres değişince silinir; sayfa yükleyince yeniden yazar.
  $effect.pre(() => {
    void route.parts.join('/')
    pageName.current = null
  })

  // Bildirimler sayfaya aittir: başka sayfaya geçince kapanır (aynı sayfada seçim değişince kalır).
  $effect.pre(() => {
    void route.parts[0]
    notify.clear()
  })

  // Sekme başlığı sayfayla (kayıt sayfasında kaydın adıyla) değişir.
  $effect(() => {
    document.title = documentTitle(route.parts[0], pageName.current)
  })

  onMount(() => {
    connect()
    loadWorkspace().catch((e: unknown) => (loadError = e instanceof Error ? e.message : String(e)))
    api<Status>('/durum')
      .then((s) => (status = s))
      .catch(() => undefined)
    post<{ notify: boolean; status: StorageStatus }>('/depolama/bildirim')
      .then((r) => (storageNotice = r.notify ? r.status : null))
      .catch(() => undefined)
  })
</script>

<AppShell crumbs={crumbsFor(route.parts[0], pageName.current)}>
  {#snippet sidebar()}<AppSidebar {activeRunId} status={statusLines} />{/snippet}

  {#if workspace.notice}
    <div
      class="bg-brand-soft text-brand-strong flex items-center gap-2 border-b px-7 py-2 text-[13px]"
      role="status"
    >
      <Icon name="error" class="size-[18px]" />
      <span class="flex-1">{workspace.notice}</span>
      <button
        type="button"
        onclick={() => (workspace.notice = null)}
        class="hover:bg-brand-border grid size-7 place-items-center rounded-md"
        aria-label="Kapat"
      >
        <Icon name="close" class="size-[18px]" />
      </button>
    </div>
  {/if}

  {#if storageNotice}
    <div
      class="bg-warning/10 text-warning flex items-center gap-2 border-b px-7 py-2 text-[13px]"
      role="status"
    >
      <Icon name="error" class="size-[18px]" />
      <span class="text-foreground flex-1">
        Yerel veriler {formatBytes(storageNotice.usage.total)} oldu; sınır {formatBytes(
          storageNotice.limitBytes,
        )}. Eski koşu kayıtlarını temizleyebilir ya da sınırı yükseltebilirsin.
      </span>
      <button
        type="button"
        class="text-brand-strong hover:bg-brand-soft rounded-md px-2 py-1 font-semibold"
        onclick={() => {
          storageNotice = null
          go('ayarlar?bolum=depolama')
        }}>Depolamayı aç</button
      >
      <button
        type="button"
        onclick={() => (storageNotice = null)}
        class="hover:bg-warning/20 text-foreground grid size-7 place-items-center rounded-md"
        aria-label="Kapat"
      >
        <Icon name="close" class="size-[18px]" />
      </button>
    </div>
  {/if}

  {#if loadError}
    <Page title="Çalışma alanı açılamadı" description={loadError}>
      <p class="text-muted-foreground">Sunucunun çalıştığından emin olup sayfayı yenileyin.</p>
    </Page>
  {:else if !workspace.ready}
    <Page><span></span></Page>
  {:else if !workspace.current}
    <!-- Hiçbir yoldan çıkarılamadı (ilk kurulum): bir kez seçilir, sonra hep hatırlanır. -->
    <Page
      title="Çalışma alanı seçin"
      description="Argus seçtiğin tek proje, uygulama ve dala odaklanır; sonra menünün üstünden değiştirebilirsin"
    >
      <Card.Root class="w-full max-w-[480px] px-6 py-6">
        <WorkspaceForm id="calisma-alani-sec" showActions />
      </Card.Root>
    </Page>
  {:else}
    {#key workspace.key}
      {#if route.parts[0] === 'baslat'}
        <Start />
      {:else if route.parts[0] === 'kosular'}
        <Runs />
      {:else if route.parts[0] === 'monitor' && route.parts[1]}
        {#key route.parts[1]}<Monitor runId={route.parts[1]} />{/key}
      {:else if route.parts[0] === 'plan' && route.parts[1]}
        {#key route.parts[1]}<Plan runId={route.parts[1]} />{/key}
      {:else if route.parts[0] === 'onay' && route.parts[1]}
        {#key route.parts[1]}<Review runId={route.parts[1]} />{/key}
      {:else if route.parts[0] === 'ayarlar'}
        <Settings />
      {:else if route.parts[0] === 'yapay-zeka'}
        <YapayZeka />
      {:else if ['bulgular', 'hafiza'].includes(route.parts[0] ?? '')}
        <!-- Henüz yeni kalıba taşınmamış sayfalar: başlık şeridi yok, eski stiller .legacy içinde. -->
        <Page>
          <div class="legacy">
            {#if route.parts[0] === 'bulgular'}
              <Issues selectedId={route.parts[1] ?? null} />
            {:else if route.parts[0] === 'hafiza'}
              <Memory />
            {/if}
          </div>
        </Page>
      {:else}
        <!-- Bilinmeyen adres ana sayfadır (iz ve sekme başlığı da öyle der). -->
        <Overview />
      {/if}
    {/key}
  {/if}
</AppShell>
