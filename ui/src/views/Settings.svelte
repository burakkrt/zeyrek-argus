<script lang="ts">
  import type {
    AppUserSetting,
    CatalogApplication,
    CatalogEnvironment,
    CatalogProject,
    ProbeLine,
    Settings,
  } from '@argus/shared'
  import { onMount } from 'svelte'
  import { api, del, post, put, qs } from '../lib/api'

  interface Status {
    zeyrekAppDir: string | null
    mcp: { ok: boolean; detail: string }
    anthropic: { set: boolean; source: string | null; hint: string | null }
    memoryDir: string
    dataDir: string
    author: string
    models: string[]
  }

  let status = $state<Status | null>(null)
  let settings = $state<Settings | null>(null)
  let appUsers = $state<AppUserSetting[]>([])
  let projects = $state<CatalogProject[]>([])
  let applications = $state<CatalogApplication[]>([])
  let environments = $state<CatalogEnvironment[]>([])
  let probe = $state({ proje: '', uygulama: '', ortam: 'development' })
  let lines = $state<ProbeLine[]>([])
  let user = $state({ proje: '', uygulama: '', kullanici: '', parola: '' })
  let busy = $state('')
  let error = $state('')
  let saved = $state('')

  async function guard<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    busy = label
    error = ''
    try {
      return await work()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      return undefined
    } finally {
      busy = ''
    }
  }

  async function pickProject(slug: string) {
    probe.proje = slug
    user.proje = slug
    applications = slug
      ? await api<CatalogApplication[]>(`/katalog/uygulamalar${qs({ proje: slug })}`).catch(() => [])
      : []
    environments = slug
      ? await api<CatalogEnvironment[]>(`/katalog/ortamlar${qs({ proje: slug })}`).catch(() => [])
      : []
    probe.uygulama =
      applications.find((a) => appUsers.some((u) => u.project === slug && u.application === a.slug))?.slug ??
      applications[0]?.slug ??
      ''
    user.uygulama = probe.uygulama
  }

  async function runProbe() {
    lines = []
    const result = await guard('Denetleniyor (MCP, giriş, tarayıcı)…', () =>
      post<{ lines: ProbeLine[] }>('/denetle', probe),
    )
    if (result) lines = result.lines
  }

  async function saveSettings() {
    if (!settings) return
    const result = await guard('Kaydediliyor…', () => put<{ settings: Settings }>('/ayarlar', settings))
    if (result) {
      settings = result.settings
      saved = 'Ayarlar kaydedildi.'
    }
  }

  async function saveUser() {
    const result = await guard('Kaydediliyor…', () =>
      put<{ appUsers: AppUserSetting[] }>('/ayarlar/uygulama-kullanicisi', user),
    )
    if (result) {
      appUsers = result.appUsers
      user.parola = ''
      saved = 'Uygulama kullanıcısı kaydedildi (yalnız bu bilgisayarda).'
    }
  }

  async function removeUser(u: AppUserSetting) {
    const result = await guard('Siliniyor…', () =>
      del<{ appUsers: AppUserSetting[] }>(
        `/ayarlar/uygulama-kullanicisi${qs({ proje: u.project, uygulama: u.application })}`,
      ),
    )
    if (result) appUsers = result.appUsers
  }

  onMount(async () => {
    status = await api<Status>('/durum').catch(() => null)
    const all = await api<{ settings: Settings; appUsers: AppUserSetting[] }>('/ayarlar').catch(() => null)
    if (all) {
      settings = all.settings
      appUsers = all.appUsers
    }
    projects = await api<CatalogProject[]>('/katalog/projeler').catch(() => [])
  })
</script>

<h1>Ayarlar</h1>
<p class="muted">Bağlantı, uygulama kullanıcıları, yapay zekâ ve öğrenme politikası.</p>
{#if error}<p class="error">{error}</p>{/if}
{#if saved}<p class="notice">{saved}</p>{/if}
{#if busy}<p class="muted small">{busy}</p>{/if}

<div class="grid">
  <section class="card stack">
    <h2>Durum</h2>
    {#if status}
      <dl>
        <dt>Zeyrek App</dt>
        <dd><code>{status.zeyrekAppDir ?? '— (.env: ARGUS_ZEYREK_APP_DIR)'}</code></dd>
        <dt>Platform (MCP)</dt>
        <dd>
          <span class={`badge ${status.mcp.ok ? 'ok' : 'fail'}`}>{status.mcp.ok ? 'hazır' : 'yok'}</span>
          {status.mcp.detail}
        </dd>
        <dt>Yapay zekâ anahtarı</dt>
        <dd>
          <span class={`badge ${status.anthropic.set ? 'ok' : 'fail'}`}
            >{status.anthropic.set ? status.anthropic.hint : 'yok'}</span
          >
          {status.anthropic.source ? `kaynak: ${status.anthropic.source}` : '.env: ANTHROPIC_API_KEY'}
        </dd>
        <dt>Hafıza</dt>
        <dd><code>{status.memoryDir}</code></dd>
        <dt>Yerel veri</dt>
        <dd><code>{status.dataDir}</code></dd>
      </dl>
    {/if}
  </section>

  <section class="card stack">
    <h2>Bağlantı denetimi</h2>
    <div class="row">
      <select value={probe.proje} onchange={(e) => pickProject((e.target as HTMLSelectElement).value)}>
        <option value="">Proje…</option>
        {#each projects as p (p.id)}<option value={p.slug}>{p.slug}</option>{/each}
      </select>
      <select bind:value={probe.uygulama}
        >{#each applications as a (a.id)}<option value={a.slug}>{a.slug}</option>{/each}</select
      >
      <select bind:value={probe.ortam}>
        {#each environments as env (env.name)}<option value={env.name} disabled={env.state !== 'ready'}
            >{env.name}</option
          >{/each}
      </select>
      <button class="primary" onclick={runProbe} disabled={!probe.proje || !probe.uygulama || !!busy}
        >Bağlantıyı denetle</button
      >
    </div>
    {#each lines as line, i (i)}
      <div class="line">
        <span class={line.status === 'ok' ? 'ok' : line.status === 'fail' ? 'fail' : 'muted'}
          >{line.status === 'ok' ? '✓' : line.status === 'fail' ? '✗' : '–'}</span
        >
        {line.label}{#if line.detail}<span class="muted"> — {line.detail}</span>{/if}
      </div>
    {/each}
  </section>

  <section class="card stack">
    <h2>Uygulama kullanıcıları</h2>
    <p class="muted small">
      Uygulama kendi giriş ekranını gösteriyorsa (ör. IMS Cortex) kontrolcü bu kullanıcıyla girer. Yalnız bu
      bilgisayarda saklanır, Git'e girmez.
    </p>
    {#each appUsers as u (`${u.project}/${u.application}`)}
      <div class="row">
        <strong>{u.project}/{u.application}</strong><span>{u.identifier}</span><span class="muted small"
          >{u.hasPassword ? 'parola kayıtlı' : 'parola yok'}</span
        ><span class="spacer"></span><button class="small danger" onclick={() => removeUser(u)}>Sil</button>
      </div>
    {/each}
    <div class="row">
      <input placeholder="proje" bind:value={user.proje} />
      <input placeholder="uygulama" bind:value={user.uygulama} />
      <input placeholder="kullanıcı adı / e-posta" bind:value={user.kullanici} />
      <input
        type="password"
        placeholder="parola (değişmeyecekse boş)"
        bind:value={user.parola}
        autocomplete="new-password"
      />
      <button onclick={saveUser} disabled={!user.proje || !user.uygulama || !user.kullanici}>Kaydet</button>
    </div>
  </section>

  {#if settings}
    <section class="card stack">
      <h2>Yapay zekâ ve öğrenme</h2>
      <div class="row">
        <label class="field"
          >Model
          <select bind:value={settings.model}
            >{#each status?.models ?? [settings.model] as m (m)}<option value={m}>{m}</option>{/each}</select
          >
        </label>
        <label class="field"
          >Efor
          <select bind:value={settings.effort}
            ><option value="low">düşük</option><option value="medium">orta</option><option value="high"
              >yüksek</option
            ></select
          >
        </label>
        <label class="field"
          >Kural bütçesi (token)<input
            type="number"
            min="200"
            max="8000"
            step="100"
            bind:value={settings.ruleBudget}
          /></label
        >
      </div>
      <div class="row">
        <label class="field"
          >Sayfa başına görev<input
            type="number"
            min="1"
            max="12"
            bind:value={settings.defaultOptions.maxTasks}
          /></label
        >
        <label class="field"
          >Görev başına adım<input
            type="number"
            min="3"
            max="40"
            bind:value={settings.defaultOptions.maxSteps}
          /></label
        >
        <label class="field"
          >Kendiliğinden ders çıkarma (yeni karar sayısı, 0 kapalı)<input
            type="number"
            min="0"
            max="100"
            bind:value={settings.learnAfterDecisions}
          /></label
        >
      </div>
      <label class="row small"
        ><input type="checkbox" bind:checked={settings.autoApproveFindingRules} /> "Sorun ara" kuralları onaysız
        devreye girsin ("sorun sayma" kuralları her zaman onay bekler)</label
      >
      <label class="field"
        >Karar ve yorumlarda görünen adın<input
          bind:value={settings.author}
          placeholder={status?.author ?? ''}
        /></label
      >
      <div><button class="primary" onclick={saveSettings}>Kaydet</button></div>
    </section>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
    gap: 16px;
    align-items: start;
  }

  dl {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 6px 12px;
    margin: 0;
  }

  dt {
    color: var(--muted);
    font-size: 12px;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .line .ok {
    color: var(--ok);
    font-weight: 700;
  }

  .line .fail {
    color: var(--fail);
    font-weight: 700;
  }

  input[type='number'] {
    width: 130px;
  }
</style>
