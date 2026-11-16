<script lang="ts">
  import type {
    AppUserSetting,
    CatalogApplication,
    CatalogEnvironment,
    CatalogProject,
    ProbeLine,
    Settings,
    StorageCleanup,
    StorageStatus,
  } from '@argus/shared'
  import { onMount, tick } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Combobox from '$lib/components/form/Combobox.svelte'
  import Field from '$lib/components/form/Field.svelte'
  import Grid from '$lib/components/layout/Grid.svelte'
  import Modal from '$lib/components/layout/Modal.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import Panel from '$lib/components/layout/Panel.svelte'
  import { Badge } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { api, del, post, put, qs } from '$lib/api'
  import { formatBytes } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { cn } from '$lib/utils'

  /**
   * Ayarlar → Genel: bu bilgisayarın durumu ve kimliği, bağlantı denetimi, uygulama kullanıcıları, yerel depolama.
   * Yapay zekâ ve öğrenme ayarları ayrı sayfadadır (`YapayZeka.svelte`). Depolama bildirimi buraya
   * `#/ayarlar?bolum=depolama` ile gelir.
   */
  interface Status {
    zeyrekAppDir: string | null
    mcp: { ok: boolean; detail: string }
    anthropic: { set: boolean; source: string | null; hint: string | null }
    provider: 'abonelik' | 'api'
    memoryDir: string
    dataDir: string
    author: { id: string; name: string }
  }

  let status = $state<Status | null>(null)
  let settings = $state<Settings | null>(null)
  let storage = $state<StorageStatus | null>(null)
  let appUsers = $state<AppUserSetting[]>([])
  let projects = $state<CatalogProject[]>([])
  let applications = $state<CatalogApplication[]>([])
  let environments = $state<CatalogEnvironment[]>([])
  let probe = $state({ proje: null as string | null, uygulama: null as string | null, ortam: 'development' })
  let lines = $state<ProbeLine[]>([])
  let user = $state({ proje: '', uygulama: '', kullanici: '', parola: '' })
  let busy = $state('')
  let confirmClean = $state(false)

  const usedRatio = $derived(storage ? Math.min(storage.usage.total / storage.limitBytes, 1) : 0)

  async function guard<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    busy = label
    try {
      return await work()
    } catch (e) {
      notify.error('İşlem tamamlanamadı', e instanceof Error ? e.message : String(e))
      return undefined
    } finally {
      busy = ''
    }
  }

  async function pickProject(slug: string | null) {
    probe.proje = slug
    applications = slug
      ? await api<CatalogApplication[]>(`/katalog/uygulamalar${qs({ proje: slug })}`).catch(() => [])
      : []
    environments = slug
      ? await api<CatalogEnvironment[]>(`/katalog/ortamlar${qs({ proje: slug })}`).catch(() => [])
      : []
    probe.uygulama =
      applications.find((a) => appUsers.some((u) => u.project === slug && u.application === a.slug))?.slug ??
      applications[0]?.slug ??
      null
  }

  async function runProbe() {
    lines = []
    const result = await guard('probe', () => post<{ lines: ProbeLine[] }>('/denetle', probe))
    if (result) lines = result.lines
  }

  async function save(patch: Partial<Settings>, message: string) {
    const result = await guard('save', () => put<{ settings: Settings }>('/ayarlar', patch))
    if (!result) return
    settings = result.settings
    notify.success(message)
  }

  async function saveLimit() {
    if (!settings) return
    await save({ storageLimitGb: settings.storageLimitGb }, 'Depolama sınırı kaydedildi.')
    storage = await api<StorageStatus>('/depolama').catch(() => storage)
  }

  async function clean() {
    confirmClean = false
    const result = await guard('clean', () =>
      post<{ result: StorageCleanup; status: StorageStatus }>('/depolama/temizle'),
    )
    if (!result) return
    storage = result.status
    const r = result.result
    if (r.freedBytes)
      notify.success(
        `${formatBytes(r.freedBytes)} boşaldı`,
        `${r.recordingsDropped} koşunun kaydı, ${r.evidenceFilesDropped} eski kanıt ve ${r.attachmentsDropped} kullanılmayan ek silindi.`,
      )
    else notify.info('Silinecek bir şey yok', 'Kalan veri korunanlardan oluşuyor (son kanıtlar, süren koşu).')
  }

  async function saveUser() {
    const result = await guard('user', () =>
      put<{ appUsers: AppUserSetting[] }>('/ayarlar/uygulama-kullanicisi', user),
    )
    if (!result) return
    appUsers = result.appUsers
    user.parola = ''
    notify.success('Uygulama kullanıcısı kaydedildi', 'Yalnız bu bilgisayarda saklanır.')
  }

  async function removeUser(u: AppUserSetting) {
    const result = await guard('user', () =>
      del<{ appUsers: AppUserSetting[] }>(
        `/ayarlar/uygulama-kullanicisi${qs({ proje: u.project, uygulama: u.application, kullanici: u.identifier })}`,
      ),
    )
    if (result) appUsers = result.appUsers
  }

  async function makeDefault(u: AppUserSetting) {
    const result = await guard('user', () =>
      put<{ appUsers: AppUserSetting[] }>('/ayarlar/uygulama-kullanicisi', {
        proje: u.project,
        uygulama: u.application,
        kullanici: u.identifier,
        varsayilan: true,
      }),
    )
    if (result) appUsers = result.appUsers
  }

  onMount(async () => {
    const [s, all, list, disk] = await Promise.all([
      api<Status>('/durum').catch(() => null),
      api<{ settings: Settings; appUsers: AppUserSetting[] }>('/ayarlar').catch(() => null),
      api<CatalogProject[]>('/katalog/projeler').catch(() => []),
      api<StorageStatus>('/depolama').catch(() => null),
    ])
    status = s
    settings = all?.settings ?? null
    appUsers = all?.appUsers ?? []
    projects = list
    storage = disk
    if (location.hash.includes('bolum=depolama')) {
      await tick()
      document.getElementById('depolama')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
</script>

{#snippet row(label: string, children: import('svelte').Snippet)}
  <div class="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-3 py-2 text-[13px] not-last:border-b">
    <span class="text-muted-foreground">{label}</span>
    <div class="min-w-0 break-words">{@render children()}</div>
  </div>
{/snippet}

<Page title="Ayarlar" description="Bu bilgisayarın bağlantısı, uygulama hesapları ve yerel depolaması">
  <Grid cols="2">
    <Panel title="Durum" description="Bağlantılar ve bu bilgisayarın klasörleri">
      {#if status}
        {#snippet zeyrek()}<code class="text-xs"
            >{status!.zeyrekAppDir ?? '— (.env: ARGUS_ZEYREK_APP_DIR)'}</code
          >{/snippet}
        {#snippet mcp()}
          <Badge variant={status!.mcp.ok ? 'success' : 'error'}>{status!.mcp.ok ? 'Hazır' : 'Yok'}</Badge>
          <span class="text-muted-foreground ml-1">{status!.mcp.detail}</span>
        {/snippet}
        {#snippet key()}
          {#if status!.provider === 'abonelik'}
            <Badge variant="brand">Claude hesabı</Badge>
            <a href="#/yapay-zeka" class="text-primary ml-1 text-xs hover:underline">Sağlayıcıyı değiştir</a>
          {:else}
            <Badge variant={status!.anthropic.set ? 'success' : 'error'}
              >{status!.anthropic.set ? status!.anthropic.hint : 'Yok'}</Badge
            >
            <span class="text-muted-foreground ml-1"
              >{status!.anthropic.source
                ? `kaynak: ${status!.anthropic.source}`
                : '.env: ANTHROPIC_API_KEY'}</span
            >
          {/if}
        {/snippet}
        {#snippet memory()}<code class="text-xs">{status!.memoryDir}</code>{/snippet}
        {#snippet data()}<code class="text-xs">{status!.dataDir}</code>{/snippet}
        {#snippet identity()}<span>{status!.author.name}</span>
          <code class="text-muted-foreground text-xs">{status!.author.id}</code>{/snippet}
        {@render row('Zeyrek App', zeyrek)}
        {@render row('Platform (MCP)', mcp)}
        {@render row('Model sağlayıcısı', key)}
        {@render row('Hafıza (Git)', memory)}
        {@render row('Yerel veri', data)}
        {@render row('Bu makine', identity)}
      {/if}
    </Panel>

    <Panel
      title="Bağlantı denetimi"
      description="Platforma, uygulamanın girişine ve tarayıcıya erişimi sınar"
    >
      <div class="grid grid-cols-3 items-start gap-3">
        <Field label="Proje" for="denetim-proje">
          <Combobox
            id="denetim-proje"
            options={projects.map((p) => ({ value: p.slug, label: p.slug }))}
            value={probe.proje}
            onchange={(v) => pickProject(v)}
            placeholder="Proje"
          />
        </Field>
        <Field label="Uygulama" for="denetim-uygulama">
          <Combobox
            id="denetim-uygulama"
            options={applications.map((a) => ({ value: a.slug, label: a.slug }))}
            bind:value={probe.uygulama}
            disabled={!probe.proje}
            placeholder="Uygulama"
          />
        </Field>
        <Field label="Ortam" for="denetim-ortam">
          <Combobox
            id="denetim-ortam"
            options={environments
              .filter((e) => e.state === 'ready')
              .map((e) => ({ value: e.name, label: e.name }))}
            value={probe.ortam}
            onchange={(v) => (probe.ortam = v ?? 'development')}
            disabled={!probe.proje}
          />
        </Field>
      </div>
      <div class="mt-4 flex justify-end">
        <Button size="sm" onclick={runProbe} disabled={!probe.proje || !probe.uygulama || !!busy}
          >{busy === 'probe' ? 'Denetleniyor…' : 'Bağlantıyı denetle'}</Button
        >
      </div>
      {#if lines.length}
        <ul class="mt-4 grid gap-1.5 border-t pt-4 text-[13px]">
          {#each lines as line, i (i)}
            <li class="flex items-baseline gap-2">
              <span
                class={cn(
                  'w-4 shrink-0 font-semibold',
                  line.status === 'ok'
                    ? 'text-success'
                    : line.status === 'fail'
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                )}>{line.status === 'ok' ? '✓' : line.status === 'fail' ? '✗' : '–'}</span
              >
              <span
                >{line.label}{#if line.detail}<span class="text-muted-foreground">
                    — {line.detail}</span
                  >{/if}</span
              >
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>
  </Grid>

  <Grid cols="2">
    <Panel
      title="Uygulama kullanıcıları"
      description="Uygulamanın kendi girişi için hesaplar · yalnız bu bilgisayarda"
    >
      <p class="text-muted-foreground mb-4 text-[13px]">
        Uygulama kendi giriş ekranını gösteriyorsa (ör. IMS Cortex) kontrolcü bu hesaplarla girer; oturum
        saklanır, her koşu yeniden giriş yapmaz. Koşular varsayılan hesapla girer.
      </p>
      {#if appUsers.length}
        <ul class="mb-4 divide-y rounded-lg border">
          {#each appUsers as u (`${u.project}/${u.application}/${u.identifier}`)}
            <li class="flex items-center gap-3 px-3 py-2 text-[13px]">
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{u.identifier}</div>
                <div class="text-muted-foreground text-xs">
                  {u.project}/{u.application} · {u.hasPassword ? 'parola kayıtlı' : 'parola yok'}
                </div>
              </div>
              {#if u.isDefault}<Badge variant="brand">Varsayılan</Badge>{:else}<Button
                  size="xs"
                  variant="outline"
                  disabled={!!busy}
                  onclick={() => makeDefault(u)}>Varsayılan yap</Button
                >{/if}
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Sil"
                disabled={!!busy}
                onclick={() => removeUser(u)}
              >
                <Icon name="close" class="size-4" />
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="grid grid-cols-2 items-start gap-3">
        <Field label="Proje" for="hesap-proje"><Input id="hesap-proje" bind:value={user.proje} /></Field>
        <Field label="Uygulama" for="hesap-uygulama"
          ><Input id="hesap-uygulama" bind:value={user.uygulama} /></Field
        >
        <Field label="Kullanıcı adı / e-posta" for="hesap-kullanici"
          ><Input id="hesap-kullanici" bind:value={user.kullanici} /></Field
        >
        <Field label="Parola" for="hesap-parola" description="Değişmeyecekse boş bırak">
          <Input id="hesap-parola" type="password" autocomplete="new-password" bind:value={user.parola} />
        </Field>
      </div>
      <div class="mt-4 flex justify-end">
        <Button
          size="sm"
          onclick={saveUser}
          disabled={!user.proje || !user.uygulama || !user.kullanici || !!busy}>Hesabı kaydet</Button
        >
      </div>
    </Panel>

    <div id="depolama" class="scroll-mt-36">
      <Panel title="Yerel depolama" description="Koşu kayıtları, kanıtlar ve ekler · Git'e girmez">
        {#if storage && settings}
          <div class="mb-1 flex items-baseline justify-between text-[13px]">
            <span><strong class="text-base">{formatBytes(storage.usage.total)}</strong> kullanılıyor</span>
            <span class="text-muted-foreground">sınır {formatBytes(storage.limitBytes)}</span>
          </div>
          <div
            class="bg-muted h-2 overflow-hidden rounded-full"
            role="meter"
            aria-valuenow={Math.round(usedRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Depolama kullanımı"
          >
            <div
              class={cn('h-full rounded-full', storage.over ? 'bg-destructive' : 'bg-primary')}
              style:width={`${usedRatio * 100}%`}
            ></div>
          </div>
          {#if storage.over}
            <p class="text-destructive mt-2 text-xs">
              Sınır aşıldı. Temizle ya da sınırı yükselt; uygulama açılışında üç günde bir hatırlatılır.
            </p>
          {/if}
          <div class="mt-4">
            {#snippet rec()}{formatBytes(storage!.usage.recordings)}{/snippet}
            {#snippet ev()}{formatBytes(storage!.usage.evidence)}{/snippet}
            {#snippet att()}{formatBytes(storage!.usage.attachments)}{/snippet}
            {#snippet db()}{formatBytes(storage!.usage.database)}{/snippet}
            {@render row('Koşu kayıtları', rec)}
            {@render row('Kanıt görüntüleri', ev)}
            {@render row('Ekler', att)}
            {@render row('Veritabanı', db)}
          </div>
          <div class="mt-4 flex items-end gap-3">
            <div class="w-40">
              <Field label="Sınır (GB)" for="depolama-sinir">
                <Input
                  id="depolama-sinir"
                  type="number"
                  min={1}
                  max={1000}
                  bind:value={settings.storageLimitGb}
                />
              </Field>
            </div>
            <Button size="sm" variant="outline" disabled={!!busy} onclick={saveLimit}>Sınırı kaydet</Button>
            <span class="flex-1"></span>
            <Button size="sm" disabled={!!busy} onclick={() => (confirmClean = true)}>Temizle</Button>
          </div>
          <p class="text-muted-foreground mt-3 text-xs">
            Kendiliğinden hiçbir şey silinmez. Temizlik toplamı sınırın %70'ine ({formatBytes(
              storage.targetBytes,
            )}) indirir; en eski koşuların kaydından başlar. Paylaşılan hafıza (bulgular, kararlar, sayfa
            bilgisi) bu hesaba girmez ve silinmez.
          </p>
        {/if}
      </Panel>
    </div>
  </Grid>
</Page>

<Modal
  bind:open={confirmClean}
  size="sm"
  title="Yerel veriyi temizle"
  description={storage ? `Toplam ${formatBytes(storage.targetBytes)} düzeyine indirilir.` : undefined}
>
  <ul class="text-muted-foreground grid list-disc gap-1 pl-5 text-[13px]">
    <li>
      Önce hiçbir koşunun kullanmadığı ekler, sonra en eski koşuların video kaydı ve adım görüntüleri silinir.
    </li>
    <li>Yetmezse en eski kanıt görüntüleri gider; her bulgunun en son kanıtı kalır.</li>
    <li>Koşuların akışı ve bulgular durur. Silinen dosyalar geri getirilemez.</li>
  </ul>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (confirmClean = false)}>Vazgeç</Button>
    <Button onclick={clean}>Temizle</Button>
  {/snippet}
</Modal>
