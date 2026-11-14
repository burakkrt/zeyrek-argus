<script lang="ts">
  import type { CatalogApplication, CatalogEnvironment, CatalogProject, Workspace } from '@argus/shared'
  import { onMount } from 'svelte'
  import Combobox from '$lib/components/form/Combobox.svelte'
  import Field from '$lib/components/form/Field.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, qs } from '$lib/api'
  import { changeWorkspace } from '$lib/workspace.svelte'

  /**
   * Çalışma alanı seçimi: proje → uygulama → dal. Seçenekler platform kataloğundan gelir (production listelenmez,
   * hazır olmayan dal seçilemez); okunurken açılır menü yükleniyor durumundadır. Kaydedince sunucu doğrular; arayüz
   * yeni seçime göre baştan yüklenir.
   *
   * Pencerede düğmeler pencerenin alt çubuğundadır: form `id` taşır, düğme `form={id}` ile gönderir; `canSubmit` ve
   * `saving` dışarı bağlanır. Sayfada (`showActions`) düğme formun altındadır.
   */
  let {
    id,
    initial = null,
    showActions = false,
    canSubmit = $bindable(false),
    saving = $bindable(false),
    ondone,
  }: {
    id: string
    initial?: Workspace | null
    showActions?: boolean
    canSubmit?: boolean
    saving?: boolean
    ondone?: () => void
  } = $props()

  let projects = $state<CatalogProject[]>([])
  let applications = $state<CatalogApplication[]>([])
  let environments = $state<CatalogEnvironment[]>([])
  let project = $state<string | null>(null)
  let application = $state<string | null>(null)
  let environment = $state<string | null>(null)
  let loadingProjects = $state(false)
  let loadingProject = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    const unchanged =
      !!initial &&
      initial.project === project &&
      initial.application === application &&
      initial.environment === environment
    canSubmit = !!project && !!application && !!environment && !unchanged && !saving
  })

  async function guard<T>(work: () => Promise<T>): Promise<T | undefined> {
    error = null
    try {
      return await work()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      return undefined
    }
  }

  async function pickProject(slug: string, keep: Partial<Workspace> = {}) {
    project = slug
    application = null
    environment = null
    loadingProject = true
    const result = await guard(() =>
      Promise.all([
        api<CatalogApplication[]>(`/katalog/uygulamalar${qs({ proje: slug })}`),
        api<CatalogEnvironment[]>(`/katalog/ortamlar${qs({ proje: slug })}`),
      ]),
    )
    loadingProject = false
    applications = result?.[0] ?? []
    environments = result?.[1] ?? []
    application =
      applications.find((a) => a.slug === keep.application)?.slug ??
      (applications.length === 1 ? applications[0]!.slug : null)
    const ready = environments.filter((e) => e.state === 'ready')
    environment =
      ready.find((e) => e.name === keep.environment)?.name ??
      ready.find((e) => e.name === 'development')?.name ??
      null
  }

  async function save() {
    if (!canSubmit) return
    saving = true
    const done = await guard(() =>
      changeWorkspace({ project: project!, application: application!, environment: environment! }).then(
        () => true,
      ),
    )
    saving = false
    if (done) ondone?.()
  }

  onMount(async () => {
    loadingProjects = true
    projects = (await guard(() => api<CatalogProject[]>('/katalog/projeler'))) ?? []
    loadingProjects = false
    const start = initial?.project ?? (projects.length === 1 ? projects[0]!.slug : null)
    if (start) await pickProject(start, initial ?? {})
  })
</script>

<form
  {id}
  class="grid gap-5"
  onsubmit={(e) => {
    e.preventDefault()
    save()
  }}
>
  {#if error}
    <Alert.Root variant="destructive">
      <Icon name="error" />
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  <Field label="Proje" for="{id}-proje" required>
    <Combobox
      id="{id}-proje"
      options={projects.map((p) => ({ value: p.slug, label: p.name, hint: p.slug }))}
      value={project}
      onchange={(slug) => pickProject(slug)}
      loading={loadingProjects}
      placeholder="Proje seçin"
      searchPlaceholder="Proje ara…"
    />
  </Field>
  <Field label="Uygulama" for="{id}-uygulama" required>
    <Combobox
      id="{id}-uygulama"
      options={applications.map((a) => ({ value: a.slug, label: a.name, hint: a.slug }))}
      bind:value={application}
      loading={loadingProject}
      disabled={!project}
      placeholder="Uygulama seçin"
      searchPlaceholder="Uygulama ara…"
    />
  </Field>
  <Field label="Dal" for="{id}-dal" description="production listelenmez; Argus yalnız okur." required>
    <Combobox
      id="{id}-dal"
      options={environments.filter((e) => e.state === 'ready').map((e) => ({ value: e.name, label: e.name }))}
      bind:value={environment}
      loading={loadingProject}
      disabled={!project}
      placeholder="Dal seçin"
      searchPlaceholder="Dal ara…"
    />
  </Field>

  {#if showActions}
    <div class="flex justify-end">
      <Button type="submit" disabled={!canSubmit}>{saving ? 'Geçiliyor…' : 'Çalışma alanına geç'}</Button>
    </div>
  {/if}
</form>
