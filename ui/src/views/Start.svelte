<script lang="ts">
  import type { AppUserSetting, Issue, PageGroup, RunInfo, Settings } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Attachments, { type AttachedFile } from '$lib/components/form/Attachments.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import DataTable from '$lib/components/table/DataTable.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { api, post, qs } from '$lib/api'
  import { formatMoney } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import {
    DEPTHS,
    depthOf,
    estimateRun,
    pagesFromLinks,
    scopeRows,
    startProblem,
    type DepthKey,
    type ScopeRow,
  } from '$lib/start'
  import type { TableColumn, TablePreset } from '$lib/table'
  import { cn } from '$lib/utils'
  import { workspace } from '$lib/workspace.svelte'
  import { go } from '../lib/router.svelte'

  /**
   * Yeni koşu: ne test edilsin (talimat, bağlantı, ekler), hangi sayfalar (ortak tabloyla seçilir; Başlat hep etkindir; eksik varsa
   * (`startProblem`) bildirim gösterir), ne kadar derin. Proje · uygulama · dal menünün üstündeki çalışma alanından, test kullanıcısı Ayarlar'daki
   * varsayılan hesaptan gelir; burada yalnız özetlenir. Başlat düğmesi sayfa başlığının sağındadır (platform kalıbı).
   */
  const SAVED = 'argus.baslat'
  const BRIEF_LIMIT = 2000
  /** Sunucunun kabul ettiği ek türleri (`server/src/runs/attachments.ts`). */
  const ACCEPT = [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'pdf',
    'xlsx',
    'docx',
    'csv',
    'txt',
    'md',
    'json',
    'log',
  ]
  const target = workspace.current!

  let groups = $state<PageGroup[]>([])
  let issues = $state<Issue[]>([])
  let selected = $state<string[]>([])
  let brief = $state('')
  let files = $state<AttachedFile[]>([])
  let attachments = $state<ReturnType<typeof Attachments> | null>(null)
  let linked = $state<string[]>([])
  let maxTasks = $state(5)
  let maxSteps = $state(10)
  let depth = $state<DepthKey>('standart')
  let history = $state<RunInfo[]>([])
  let account = $state<AppUserSetting | null>(null)
  let loading = $state(true)
  let uploading = $state(false)
  /** Başlatılınca atanacak kodun önizlemesi (sunucu ayırmaz; yenilemede tükenmez). */
  let nextCode = $state<string | null>(null)
  let starting = $state(false)

  const rows = $derived(scopeRows(groups, history, issues))
  const estimate = $derived(estimateRun(history, selected.length, maxTasks))

  const columns: TableColumn<ScopeRow>[] = [
    // Ad ve adres birlikte süzülür: kullanıcı ekranda gördüğü adı da, bağlantıdaki adresi de yazabilir.
    { key: 'name', label: 'Sayfa', value: (r) => `${r.name} ${r.slug}`, required: true },
    { key: 'module', label: 'Modül', value: (r) => r.module, kind: 'enum', width: 'w-36' },
    { key: 'lastRun', label: 'Son koşu', value: (r) => r.lastRun, kind: 'date', width: 'w-40' },
    {
      key: 'openIssues',
      label: 'Açık bulgu',
      value: (r) => r.openIssues,
      kind: 'number',
      align: 'end',
      width: 'w-36',
    },
  ]
  const presets: TablePreset<ScopeRow>[] = [
    { id: 'secili', label: 'Seçili', test: (r) => selected.includes(r.slug) },
    { id: 'kosulmamis', label: 'Hiç koşulmamış', test: (r) => !r.lastRun },
    { id: 'bulgulu', label: 'Açık bulgulu', test: (r) => r.openIssues > 0 },
  ]

  const upload = async (file: File) => {
    const form = new FormData()
    form.append('dosya', file, file.name || 'ekran-goruntusu.png')
    return (await api<{ id: string }>('/ekler', { method: 'POST', body: form })).id
  }

  function linkPages(text: string) {
    // Talimattaki bağlantının sayfası kapsama bir kez eklenir (yapıştırınca ve alandan çıkınca; yazarken yarım adres
    // başka sayfaya denk gelmesin). Kullanıcı kaldırırsa geri gelmez.
    const fresh = pagesFromLinks(text, groups).filter((slug) => !linked.includes(slug))
    if (!fresh.length) return
    linked = [...linked, ...fresh]
    selected = [...new Set([...selected, ...fresh])]
  }

  function onPaste(event: ClipboardEvent) {
    linkPages(event.clipboardData?.getData('text') ?? '')
    // Talimata yapıştırılan ekran görüntüsü ek olur.
    const pasted = [...(event.clipboardData?.files ?? [])]
    if (!pasted.length) return
    event.preventDefault()
    void attachments?.add(pasted)
  }

  function pickDepth(key: DepthKey) {
    depth = key
    const preset = DEPTHS.find((d) => d.key === key)
    if (preset) ({ maxTasks, maxSteps } = preset)
  }

  async function start() {
    const problem = startProblem({ pages: selected.length, uploading })
    if (problem) return notify.warning(problem.title, problem.message)
    starting = true
    try {
      localStorage.setItem(SAVED, JSON.stringify({ maxTasks, maxSteps }))
    } catch {
      /* tarayıcı depolaması kapalıysa hatırlamaz */
    }
    try {
      const run = await post<RunInfo>('/kosular', {
        proje: target.project,
        uygulama: target.application,
        ortam: target.environment,
        sayfalar: selected,
        secenekler: { maxTasks, maxSteps, brief: brief.trim() || null, attachments: files.map((f) => f.id) },
      })
      go(`/monitor/${run.id}`)
    } catch (e) {
      notify.error('Koşu başlatılamadı', e instanceof Error ? e.message : String(e))
      starting = false
    }
  }

  onMount(() => {
    const where = { proje: target.project, uygulama: target.application, ortam: target.environment }
    let saved: { maxTasks?: unknown; maxSteps?: unknown } = {}
    try {
      saved = JSON.parse(localStorage.getItem(SAVED) ?? '{}') as typeof saved
    } catch {
      /* tarayıcı depolaması kapalı */
    }
    void Promise.all([
      api<{ settings: Settings }>('/ayarlar').catch(() => null),
      api<{ accounts: AppUserSetting[] }>(`/kimlik${qs(where)}`).catch(() => null),
      api<PageGroup[]>(`/katalog/sayfalar${qs(where)}`),
      api<RunInfo[]>(`/kosular${qs(where)}`).catch(() => []),
      api<Issue[]>(`/sorunlar${qs({ proje: target.project, uygulama: target.application })}`).catch(() => []),
      api<{ code: string }>('/kosular/siradaki-kod').catch(() => null),
    ])
      .then(([settings, identity, pages, runs, found, code]) => {
        nextCode = code?.code ?? null
        const defaults = settings?.settings.defaultOptions
        maxTasks = typeof saved.maxTasks === 'number' ? saved.maxTasks : (defaults?.maxTasks ?? 5)
        maxSteps = typeof saved.maxSteps === 'number' ? saved.maxSteps : (defaults?.maxSteps ?? 10)
        depth = depthOf(maxTasks, maxSteps)
        account = identity?.accounts.find((a) => a.isDefault) ?? identity?.accounts[0] ?? null
        groups = pages
        history = runs
        issues = found
      })
      .catch((e: unknown) => notify.error('Sayfalar okunamadı', e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false))
  })
</script>

{#snippet heading(title: string, description: string)}
  <div>
    <h2 class="text-base leading-[22px] font-semibold">{title}</h2>
    <p class="text-muted-foreground text-[13px]">{description}</p>
  </div>
{/snippet}

<Page
  title="Yeni koşu"
  description="Neyi, hangi sayfalarda, ne kadar derin test edeceğini seç; Argus salt okuyarak gezsin, sen monitörden izle"
>
  {#snippet actions()}
    <Button disabled={starting} onclick={start}>
      <Icon name="mediaPlay" />
      {starting ? 'Başlatılıyor…' : 'Koşuyu başlat'}
    </Button>
  {/snippet}

  <!-- Solda sayfa kabı (talimat, kapsam), sağda ayrı yapışkan kutu (koşu ayarları ve özet) -->
  <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="bg-card text-card-foreground min-w-0 rounded-xl border">
      <div class="flex min-w-0 flex-col gap-8 p-6">
        <section class="flex flex-col gap-3">
          {@render heading(
            'Ne test edilsin?',
            'İsteğe bağlı: odak, şüphelendiğin yer, sayfa bağlantısı; ekran görüntüsü, gereksinim ya da müşteri dosyası.',
          )}
          <div class="flex flex-col gap-3">
            <div class="relative">
              <textarea
                bind:value={brief}
                onpaste={onPaste}
                onblur={() => linkPages(brief)}
                maxlength={BRIEF_LIMIT}
                rows="3"
                aria-label="Talimat"
                placeholder="Ör. Eğitim formunda tarih seçince bitiş tarihi sıfırlanıyor, buna odaklan. Sayfa bağlantısı yapıştırırsan o sayfa kapsama eklenir."
                class="border-input placeholder:text-placeholder focus-visible:border-ring focus-visible:ring-ring/15 block max-h-72 min-h-24 w-full resize-none rounded-lg border bg-transparent px-3 py-2.5 text-sm leading-6 transition-colors outline-none [field-sizing:content] focus-visible:ring-2"
              ></textarea>
              {#if brief.length}
                <span
                  class="text-muted-foreground pointer-events-none absolute right-3 bottom-2 text-[11px] tabular-nums"
                  >{brief.length} / {BRIEF_LIMIT}</span
                >
              {/if}
            </div>

            {#if linked.length}
              <p class="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Icon name="link" class="size-4" />
                Bağlantıdan kapsama eklendi: {linked.join(', ')}
              </p>
            {/if}

            <Attachments
              bind:this={attachments}
              bind:files
              bind:uploading
              {upload}
              accept={ACCEPT}
              maxFiles={6}
              description="Görsel, PDF, Excel, Word, CSV ya da metin · en çok 6 dosya, 10 MB · talimata yapıştırılan ekran görüntüsü de eklenir"
            />
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-3">
          {@render heading(
            'Kapsam',
            selected.length
              ? `${selected.length} sayfa seçili.`
              : 'Test edilecek sayfaları seç; seçim olmadan koşu başlamaz.',
          )}
          <DataTable
            {rows}
            {columns}
            {presets}
            {loading}
            rowKey={(r) => r.slug}
            selectable
            bind:selected
            storageKey="kapsam"
            emptyTitle="Bu dalda sayfa bulunamadı"
            emptyDescription="Çalışma alanındaki dalı değiştirmeyi dene."
            class="max-h-[640px]"
          >
            {#snippet cell(row, column)}
              {#if column.key === 'name'}
                <span class="block truncate font-semibold" title={row.name}>{row.name}</span>
                <span class="text-muted-foreground block truncate text-xs">{row.slug}</span>
              {:else if column.key === 'module'}
                <span class={cn(!row.module && 'text-muted-foreground')}>{row.module || '—'}</span>
              {:else if column.key === 'lastRun'}
                {#if row.lastRun}{new Date(row.lastRun).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}{:else}<span class="text-muted-foreground">Hiç</span>{/if}
              {:else}
                <span class={cn(!row.openIssues && 'text-muted-foreground')}>{row.openIssues}</span>
              {/if}
            {/snippet}
          </DataTable>
        </section>
      </div>
    </div>

    <aside class="bg-card text-card-foreground rounded-xl border p-5 lg:sticky lg:top-[148px]">
      <div class="flex flex-col gap-3">
        {@render heading('Koşu', 'Derinlik ve koşunun özeti.')}
        <div class="flex flex-col gap-5">
          <div class="flex flex-col gap-2">
            <span class="text-[13px] font-medium">Derinlik</span>
            <div
              role="radiogroup"
              aria-label="Derinlik"
              class="bg-muted grid grid-cols-4 gap-0.5 rounded-lg p-0.5"
            >
              {#each [...DEPTHS, { key: 'ozel' as const, label: 'Özel' }] as option (option.key)}
                <button
                  type="button"
                  role="radio"
                  aria-checked={depth === option.key}
                  class={cn(
                    'h-7 rounded-md text-[13px] transition-colors',
                    depth === option.key
                      ? 'bg-card text-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onclick={() => pickDepth(option.key)}>{option.label}</button
                >
              {/each}
            </div>
            {#if depth === 'ozel'}
              <div class="grid grid-cols-2 gap-3 pt-1">
                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted-foreground">Sayfa başına görev</span>
                  <Input type="number" min={1} max={12} bind:value={maxTasks} class="h-8" />
                </label>
                <label class="flex flex-col gap-1 text-xs">
                  <span class="text-muted-foreground">Görev başına adım</span>
                  <Input type="number" min={3} max={40} bind:value={maxSteps} class="h-8" />
                </label>
              </div>
            {:else}
              {@const preset = DEPTHS.find((d) => d.key === depth)!}
              <p class="text-muted-foreground text-xs">
                {preset.hint} · sayfa başına {preset.maxTasks} görev, görev başına {preset.maxSteps} adım
              </p>
            {/if}
          </div>

          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t pt-4 text-[13px]">
            <dt class="text-muted-foreground">Kod</dt>
            <dd class="text-right font-mono text-xs" title="Koşu başlatılınca atanır">{nextCode ?? '—'}</dd>
            <dt class="text-muted-foreground">Kapsam</dt>
            <dd class={cn('text-right', !selected.length && 'text-muted-foreground')}>
              {selected.length ? `${selected.length} sayfa` : 'Seçilmedi'}
            </dd>
            <dt class="text-muted-foreground">Dal</dt>
            <dd
              class="truncate text-right"
              title="{target.project} · {target.application} · {target.environment}"
            >
              {target.environment}
            </dd>
            <dt class="text-muted-foreground">Test kullanıcısı</dt>
            <dd class="flex min-w-0 items-center justify-end gap-1.5">
              <span class="truncate" title={account?.identifier}
                >{account?.identifier ?? 'Platform jetonu'}</span
              >
              <a href="#/ayarlar" class="text-primary shrink-0 text-xs hover:underline">Değiştir</a>
            </dd>
            <dt class="text-muted-foreground">Tahmin</dt>
            <dd class={cn('text-right tabular-nums', !estimate && 'text-muted-foreground')}>
              {#if estimate}
                ~{Math.max(1, Math.round(estimate.minutes))} dk · ~{formatMoney(estimate.cost)}
              {:else}—{/if}
            </dd>
          </dl>
          {#if estimate}
            <p class="text-muted-foreground -mt-3 text-right text-[11px]">
              {estimate.basis === 'gecmis' ? 'Bu dalın son koşularına göre' : 'Geçmiş koşu yok, kaba tahmin'}
            </p>
          {/if}
        </div>
      </div>
    </aside>
  </div>
</Page>
