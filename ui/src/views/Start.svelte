<script lang="ts">
  import type {
    CatalogApplication,
    CatalogEnvironment,
    CatalogProject,
    PageGroup,
    RunInfo,
    Settings,
  } from '@argus/shared'
  import { onMount } from 'svelte'
  import { api, post, qs } from '../lib/api'
  import { go } from '../lib/router.svelte'

  const SAVED = 'argus.baslat'
  let projects = $state<CatalogProject[]>([])
  let applications = $state<CatalogApplication[]>([])
  let environments = $state<CatalogEnvironment[]>([])
  let groups = $state<PageGroup[]>([])
  let project = $state('')
  let application = $state('')
  let environment = $state('development')
  let selected = $state<string[]>([])
  let filter = $state('')
  let maxTasks = $state(5)
  let maxSteps = $state(10)
  let loading = $state('')
  let error = $state('')
  let starting = $state(false)

  const visibleGroups = $derived(
    groups
      .map((g) => ({
        ...g,
        pages: g.pages.filter(
          (p) =>
            !filter || `${p.slug} ${p.name}`.toLocaleLowerCase('tr').includes(filter.toLocaleLowerCase('tr')),
        ),
      }))
      .filter((g) => g.pages.length),
  )
  const estimate = $derived(
    selected.length
      ? `~${Math.max(1, Math.round(selected.length * maxTasks * 0.4))} dk · ~$${(selected.length * maxTasks * 0.16).toFixed(1)}`
      : '',
  )

  function remember() {
    try {
      localStorage.setItem(SAVED, JSON.stringify({ project, application, environment, maxTasks, maxSteps }))
    } catch {
      /* tarayıcı depolaması kapalıysa hatırlamaz */
    }
  }

  async function guard<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    loading = label
    error = ''
    try {
      return await work()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      return undefined
    } finally {
      loading = ''
    }
  }

  async function loadProjects() {
    projects =
      (await guard('Projeler MCP’den okunuyor…', () => api<CatalogProject[]>('/katalog/projeler'))) ?? []
  }

  async function pickProject(value: string) {
    project = value
    applications = []
    environments = []
    groups = []
    selected = []
    if (!value) return
    const [apps, envs] = (await guard('Uygulamalar ve dallar okunuyor…', () =>
      Promise.all([
        api<CatalogApplication[]>(`/katalog/uygulamalar${qs({ proje: value })}`),
        api<CatalogEnvironment[]>(`/katalog/ortamlar${qs({ proje: value })}`),
      ]),
    )) ?? [[], []]
    applications = apps
    environments = envs
    if (!apps.some((a) => a.slug === application)) application = apps[0]?.slug ?? ''
    if (!envs.some((e) => e.name === environment)) environment = 'development'
    remember()
    await loadPages()
  }

  async function loadPages() {
    selected = []
    if (!project || !application || !environment) return
    groups =
      (await guard('Sayfalar okunuyor…', () =>
        api<PageGroup[]>(
          `/katalog/sayfalar${qs({ proje: project, uygulama: application, ortam: environment })}`,
        ),
      )) ?? []
    remember()
  }

  function toggle(slugs: string[], on: boolean) {
    selected = on ? [...new Set([...selected, ...slugs])] : selected.filter((s) => !slugs.includes(s))
  }

  async function start() {
    starting = true
    remember()
    const run = await guard('Koşu sıraya yazılıyor…', () =>
      post<RunInfo>('/kosular', {
        proje: project,
        uygulama: application,
        ortam: environment,
        sayfalar: selected,
        secenekler: { maxTasks, maxSteps },
      }),
    )
    starting = false
    if (run) go(`/monitor/${run.id}`)
  }

  onMount(async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Record<string, unknown>
      if (typeof saved.application === 'string') application = saved.application
      if (typeof saved.environment === 'string') environment = saved.environment
      if (typeof saved.maxTasks === 'number') maxTasks = saved.maxTasks
      if (typeof saved.maxSteps === 'number') maxSteps = saved.maxSteps
      const { settings } = await api<{ settings: Settings }>('/ayarlar')
      if (typeof saved.maxTasks !== 'number') maxTasks = settings.defaultOptions.maxTasks
      if (typeof saved.maxSteps !== 'number') maxSteps = settings.defaultOptions.maxSteps
      await loadProjects()
      if (typeof saved.project === 'string' && projects.some((p) => p.slug === saved.project))
        await pickProject(saved.project)
    } catch {
      await loadProjects()
    }
  })
</script>

<div class="head">
  <div>
    <h1>Yeni keşif</h1>
    <p class="muted">
      Uygulamayı, ortamı (dalı) ve sayfaları seç; kontrolcü sayfaları gezsin, sen monitörden izle.
    </p>
  </div>
</div>

{#if error}<p class="error">{error}</p>{/if}

<div class="grid">
  <section class="card stack">
    <label class="field">
      Proje
      <select value={project} onchange={(e) => pickProject((e.target as HTMLSelectElement).value)}>
        <option value="">Seç…</option>
        {#each projects as p (p.id)}<option value={p.slug}>{p.name} ({p.slug})</option>{/each}
      </select>
    </label>
    <label class="field">
      Uygulama
      <select bind:value={application} onchange={loadPages} disabled={!applications.length}>
        {#each applications as a (a.id)}<option value={a.slug}>{a.name} ({a.slug})</option>{/each}
      </select>
    </label>
    <label class="field">
      Ortam / dal
      <select bind:value={environment} onchange={loadPages} disabled={!environments.length}>
        {#each environments as env (env.name)}
          <option value={env.name} disabled={env.state !== 'ready'}
            >{env.name}{env.state !== 'ready' ? ` (${env.state})` : ''}</option
          >
        {/each}
      </select>
    </label>
    <div class="row">
      <label class="field"
        >Sayfa başına görev<input type="number" min="1" max="12" bind:value={maxTasks} /></label
      >
      <label class="field"
        >Görev başına adım<input type="number" min="3" max="40" bind:value={maxSteps} /></label
      >
    </div>
    <p class="muted small">
      Kontrolcü yalnız okur: kayıt açmaz, kaydetmez, silmez. Filtre ve arama alanlarına yazabilir; veri yazan
      istekler engellenir. production listelenmez.
    </p>
    <div class="row">
      <button class="primary" disabled={!selected.length || starting} onclick={start}
        >Keşfi başlat ({selected.length})</button
      >
      <span class="muted small">{estimate}</span>
    </div>
    {#if loading}<p class="muted small">{loading}</p>{/if}
  </section>

  <section class="card pages">
    <div class="row">
      <h2>Sayfalar</h2>
      <span class="muted small">{groups.reduce((n, g) => n + g.pages.length, 0)} sayfa</span>
      <span class="spacer"></span>
      <input placeholder="Sayfa ara…" bind:value={filter} />
    </div>
    {#if !groups.length}
      <p class="muted">Sayfaları görmek için proje, uygulama ve ortam seç.</p>
    {/if}
    {#each visibleGroups as group (group.key)}
      {@const slugs = group.pages.map((p) => p.slug)}
      <details open={visibleGroups.length <= 3 || !!filter}>
        <summary>
          <input
            type="checkbox"
            checked={slugs.every((s) => selected.includes(s))}
            onclick={(e) => e.stopPropagation()}
            onchange={(e) => toggle(slugs, (e.target as HTMLInputElement).checked)}
          />
          <strong>{group.key}</strong>
          <span class="muted small"
            >{group.pages.length} sayfa · {slugs.filter((s) => selected.includes(s)).length} seçili</span
          >
        </summary>
        <ul>
          {#each group.pages as page (page.id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(page.slug)}
                  onchange={(e) => toggle([page.slug], (e.target as HTMLInputElement).checked)}
                />
                <span>{page.name}</span>
                <code class="muted">{page.slug}</code>
              </label>
            </li>
          {/each}
        </ul>
      </details>
    {/each}
  </section>
</div>

<style>
  .head {
    margin-bottom: 14px;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }

  .pages {
    display: grid;
    gap: 6px;
  }

  details {
    border-top: 1px solid var(--border);
    padding: 6px 0;
  }

  summary {
    display: flex;
    gap: 8px;
    align-items: center;
    cursor: pointer;
    list-style: none;
  }

  ul {
    list-style: none;
    margin: 6px 0 0 24px;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  li label {
    display: flex;
    gap: 8px;
    align-items: baseline;
    cursor: pointer;
    flex-wrap: wrap;
  }

  input[type='number'] {
    width: 110px;
  }
</style>
