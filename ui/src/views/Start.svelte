<script lang="ts">
  import type { AppUserSetting, Issue, PageGroup, RunInfo } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Attachments, { type AttachedFile } from '$lib/components/form/Attachments.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import DataTable from '$lib/components/table/DataTable.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, qs } from '$lib/api'
  import { formatMoney } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { estimateRun, pagesFromLinks, scopeRows, startProblem, type ScopeRow } from '$lib/start'
  import type { TableColumn, TablePreset } from '$lib/table'
  import { cn } from '$lib/utils'
  import { workspace } from '$lib/workspace.svelte'
  import { go } from '../lib/router.svelte'

  /**
   * Yeni koşu: girdi (ne test edilsin; bağlantı ve ekler) ve sayfalar. İkisi de isteğe bağlıdır ama biri gerekir
   * (`startProblem`): yalnız sayfa seçilirse o sayfalar olağan kapsamla, yalnız girdi yazılırsa sayfalar girdiden
   * seçilerek, ikisi birlikteyse seçilen sayfalar girdi bağlamında test edilir. Derinlik seçilmez: motor kalite
   * öncelikli çalışır. Proje · uygulama · dal çalışma alanından, test kullanıcısı Ayarlar'daki varsayılan hesaptan gelir.
   */
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
  let history = $state<RunInfo[]>([])
  let account = $state<AppUserSetting | null>(null)
  let loading = $state(true)
  let uploading = $state(false)
  /** Başlatılınca atanacak kodun önizlemesi (sunucu ayırmaz; yenilemede tükenmez). */
  let nextCode = $state<string | null>(null)
  let starting = $state(false)

  const rows = $derived(scopeRows(groups, history, issues))
  const estimate = $derived(estimateRun(history, selected.length))

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
    // Girdideki bağlantının sayfası seçime bir kez eklenir (yapıştırınca ve alandan çıkınca; yazarken yarım adres
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

  async function start() {
    const problem = startProblem({ pages: selected.length, brief, files: files.length, uploading })
    if (problem) return notify.warning(problem.title, problem.message)
    starting = true
    try {
      const run = await post<RunInfo>('/kosular', {
        proje: target.project,
        uygulama: target.application,
        ortam: target.environment,
        sayfalar: selected,
        secenekler: { brief: brief.trim() || null, attachments: files.map((f) => f.id) },
      })
      go(`/monitor/${run.id}`)
    } catch (e) {
      notify.error('Koşu başlatılamadı', e instanceof Error ? e.message : String(e))
      starting = false
    }
  }

  onMount(() => {
    const where = { proje: target.project, uygulama: target.application, ortam: target.environment }
    void Promise.all([
      api<{ accounts: AppUserSetting[] }>(`/kimlik${qs(where)}`).catch(() => null),
      api<PageGroup[]>(`/katalog/sayfalar${qs(where)}`),
      api<RunInfo[]>(`/kosular${qs(where)}`).catch(() => []),
      api<Issue[]>(`/sorunlar${qs({ proje: target.project, uygulama: target.application })}`).catch(() => []),
      api<{ code: string }>('/kosular/siradaki-kod').catch(() => null),
    ])
      .then(([identity, pages, runs, found, code]) => {
        nextCode = code?.code ?? null
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

<Page title="Yeni koşu" description="Sayfa seç ya da ne test edileceğini yaz; koşuyu monitörden izle">
  {#snippet actions()}
    <Button disabled={starting} onclick={start}>
      <Icon name="mediaPlay" />
      {starting ? 'Başlatılıyor…' : 'Koşuyu başlat'}
    </Button>
  {/snippet}

  <!-- Solda sayfa kabı (girdi, sayfalar), sağda ayrı yapışkan kutu (koşunun özeti) -->
  <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="bg-card text-card-foreground min-w-0 rounded-xl border">
      <div class="flex min-w-0 flex-col gap-8 p-6">
        <section class="flex flex-col gap-3">
          {@render heading(
            'Girdi',
            'Ne test edileceğini ya da neye dikkat edileceğini yaz; boş bırakabilirsin.',
          )}
          <div class="flex flex-col gap-3">
            <div class="relative">
              <textarea
                bind:value={brief}
                onpaste={onPaste}
                onblur={() => linkPages(brief)}
                maxlength={BRIEF_LIMIT}
                rows="3"
                aria-label="Girdi"
                placeholder="Ör. Bu sayfalardaki arayüz ve kullanım sorunlarını bul."
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
                Bağlantıdan seçilen sayfalar: {linked.join(', ')}
              </p>
            {/if}

            <Attachments
              bind:this={attachments}
              bind:files
              bind:uploading
              {upload}
              accept={ACCEPT}
              maxFiles={6}
              description="Görsel, PDF, Excel, Word, CSV ya da metin; en çok 6 dosya, her biri 10 MB."
            />
          </div>
        </section>

        <section class="flex min-w-0 flex-col gap-3">
          {@render heading(
            'Sayfalar',
            selected.length
              ? `${selected.length} sayfa seçili.`
              : 'İstersen test edilecek sayfaları seç; seçmezsen girdiye göre seçilir.',
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
        {@render heading('Koşu', 'Başlatılacak koşunun özeti.')}
        <div class="flex flex-col gap-5">
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13px]">
            <dt class="text-muted-foreground">Kod</dt>
            <dd class="text-right font-mono text-xs" title="Koşu başlatılınca atanır">{nextCode ?? '—'}</dd>
            <dt class="text-muted-foreground">Sayfalar</dt>
            <dd class={cn('text-right', !selected.length && 'text-muted-foreground')}>
              {selected.length
                ? `${selected.length} sayfa`
                : brief.trim() || files.length
                  ? 'Girdiden seçilecek'
                  : 'Seçilmedi'}
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
