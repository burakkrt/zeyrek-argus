<script lang="ts">
  import type { PageGroup, RunInfo, Settings } from '@argus/shared'
  import { onMount } from 'svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import { workspace } from '$lib/workspace.svelte'
  import { api, post, qs } from '../lib/api'
  import { go } from '../lib/router.svelte'

  // Koşu çalışma alanında açılır (proje · uygulama · dal menünün üstünde seçilir); burada yalnız sayfalar ve sınırlar.
  const SAVED = 'argus.baslat'
  const target = workspace.current!
  let groups = $state<PageGroup[]>([])
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
      localStorage.setItem(SAVED, JSON.stringify({ maxTasks, maxSteps }))
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

  function toggle(slugs: string[], on: boolean) {
    selected = on ? [...new Set([...selected, ...slugs])] : selected.filter((s) => !slugs.includes(s))
  }

  async function start() {
    starting = true
    remember()
    const run = await guard('Koşu sıraya yazılıyor…', () =>
      post<RunInfo>('/kosular', {
        proje: target.project,
        uygulama: target.application,
        ortam: target.environment,
        sayfalar: selected,
        secenekler: { maxTasks, maxSteps },
      }),
    )
    starting = false
    if (run) go(`/monitor/${run.id}`)
  }

  onMount(async () => {
    let saved: Record<string, unknown> = {}
    try {
      saved = JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Record<string, unknown>
    } catch {
      /* tarayıcı depolaması kapalı */
    }
    const [settings, pages] = await Promise.all([
      api<{ settings: Settings }>('/ayarlar').catch(() => null),
      guard('Sayfalar okunuyor…', () =>
        api<PageGroup[]>(
          `/katalog/sayfalar${qs({ proje: target.project, uygulama: target.application, ortam: target.environment })}`,
        ),
      ),
    ])
    maxTasks =
      typeof saved.maxTasks === 'number' ? saved.maxTasks : (settings?.settings.defaultOptions.maxTasks ?? 5)
    maxSteps =
      typeof saved.maxSteps === 'number' ? saved.maxSteps : (settings?.settings.defaultOptions.maxSteps ?? 10)
    groups = pages ?? []
  })
</script>

<Page
  title="Yeni koşu"
  description="Sayfaları seç; kontrolcü çalışma alanındaki uygulamanın bu dalında gezsin, sen monitörden izle"
>
  <div class="legacy">
    {#if error}<p class="error">{error}</p>{/if}

    <div class="grid">
      <section class="card stack">
        <div class="row">
          <label class="field"
            >Sayfa başına görev<input type="number" min="1" max="12" bind:value={maxTasks} /></label
          >
          <label class="field"
            >Görev başına adım<input type="number" min="3" max="40" bind:value={maxSteps} /></label
          >
        </div>
        <p class="muted small">
          Kontrolcü yalnız okur: kayıt açmaz, kaydetmez, silmez. Filtre ve arama alanlarına yazabilir; veri
          yazan istekler engellenir. production listelenmez.
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
        {#if !groups.length && !error}
          <p class="muted">Bu dalda sayfa bulunamadı.</p>
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
  </div>
</Page>

<style>
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
