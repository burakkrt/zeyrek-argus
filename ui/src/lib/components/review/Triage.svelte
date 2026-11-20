<script lang="ts">
  import { DISMISS_REASON_LABELS, DISMISS_REASONS, type DismissReason, type Issue, type IssueDetail } from '@argus/shared'
  import FindingReport from '$lib/components/finding/FindingReport.svelte'
  import FixEditor from '$lib/components/finding/FixEditor.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api } from '$lib/api'
  import { SEVERITY, STATUS } from '$lib/format'
  import { pageLabel } from '$lib/monitor'
  import { DECISIONS, KIND, REASON_HINT, suggestionFor, triageKey, type ColumnId } from '$lib/review'

  /**
   * Tek tek (triyaj) kipi: bekleyen kartlar sırayla, tam ayrıntısıyla gelir; karar tek tuştur (D, B, R + 1-4, A),
   * E çözümü düzenler, ←/→ kartlar arasında gezer, Z son kararı geri alır. Sıra `triageQueue`: önce Argus'un en az emin
   * olduğu ağır bulgular, benzerler art arda, geçmiş karara benzeyenler en sonda. Öneri yalnız gösterilir, uygulanmaz.
   * Karar verilen kart kuyruktan düşer; aynı sıradaki kart açılır.
   */
  let {
    queue,
    decided,
    readonly,
    ondecide,
    onundo,
    oneditfix,
  }: {
    queue: Issue[]
    decided: Issue[]
    readonly: boolean
    ondecide: (issue: Issue, column: ColumnId, reason: DismissReason | null) => void
    onundo: () => void
    oneditfix: (id: string, text: string) => Promise<void>
  } = $props()

  let index = $state(0)
  let pickingReason = $state(false)
  let editingFix = $state(false)
  let detail = $state<IssueDetail | null>(null)

  const current = $derived(queue.length ? queue[Math.min(index, queue.length - 1)]! : null)
  const position = $derived(queue.length ? Math.min(index, queue.length - 1) + 1 : 0)
  const suggestion = $derived(current ? suggestionFor(current, decided) : null)

  $effect(() => {
    const id = current?.id
    pickingReason = false
    editingFix = false
    detail = null
    if (id)
      void api<IssueDetail>(`/sorunlar/${id}`)
        .then((d) => {
          if (current?.id === id) detail = d
        })
        .catch(() => null)
  })

  function decide(column: ColumnId, reason: DismissReason | null = null) {
    if (!current || readonly) return
    pickingReason = false
    ondecide(current, column, reason)
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target instanceof Element ? e.target : null
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
    if (document.querySelector('[role="dialog"]')) return
    const action = triageKey(e.key, pickingReason)
    if (!action) return
    e.preventDefault()
    if (action.type === 'undo') return onundo()
    if (action.type === 'step') {
      index = Math.max(0, Math.min(queue.length - 1, Math.min(index, queue.length - 1) + action.by))
      return
    }
    if (!current || readonly) return
    if (action.type === 'decide') decide(action.column)
    else if (action.type === 'dismiss') decide('ret', action.reason)
    else if (action.type === 'ask-reason') pickingReason = true
    else if (action.type === 'cancel') pickingReason = false
    else if (action.type === 'edit') editingFix = true
  }

  const KEY = 'inline-flex min-w-[18px] justify-center rounded border border-b-2 bg-white px-1 font-mono text-[11px] leading-4 text-[#44546f]'
</script>

<svelte:window {onkeydown} />

{#if current}
  <div class="mx-auto grid w-full max-w-[860px] gap-4">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[#44546f]">
      <b class="font-semibold text-[#172b4d] tabular-nums">{position}/{queue.length}</b>
      <span>{KIND[current.kind]}</span>
      <span>{current.severity} {SEVERITY[current.severity].label}</span>
      <span class="min-w-0 truncate">{current.pages.map(pageLabel).join(', ')}</span>
      <span class="ml-auto flex items-center gap-1">
        <Button size="sm" variant="ghost" class="h-7 px-2" aria-label="Önceki kart" disabled={position <= 1}
          onclick={() => (index = Math.max(0, position - 2))}><Icon name="chevronLeft" class="size-4" /></Button
        >
        <Button size="sm" variant="ghost" class="h-7 px-2" aria-label="Sonraki kart" disabled={position >= queue.length}
          onclick={() => (index = position)}><Icon name="chevronRight" class="size-4" /></Button
        >
      </span>
    </div>

    {#if suggestion}
      <p class="rounded-lg bg-[#f3f0ff] px-3.5 py-2.5 text-[13px] leading-5 text-[#44337a]">
        Benzer bir bulguya daha önce <b class="font-semibold">“{STATUS[suggestion.status].label}”</b> denmişti:
        {suggestion.title}. Öneri kendiliğinden uygulanmaz; kartı okuyup sen karar ver.
      </p>
    {/if}

    <section class="bg-card grid gap-5 rounded-xl border px-6 py-5">
      {#if detail?.occurrences[0]}
        <FindingReport
          title={detail.title}
          occurrence={detail.occurrences[0]}
          place={detail.pages.map(pageLabel).join(', ')}
        />
      {:else}
        <h2 class="text-[15px] font-semibold text-[#172b4d]">{current.title}</h2>
        <p class="text-muted-foreground text-[13px]">{detail ? 'Bu bulgunun görünümü okunamadı.' : 'Yükleniyor…'}</p>
      {/if}
      <FixEditor
        fix={current.fix}
        edited={current.fixEdited}
        {readonly}
        bind:editing={editingFix}
        onsave={(text) => oneditfix(current.id, text)}
      />
    </section>

    {#if !readonly}
      <div class="bg-card sticky bottom-3 grid gap-2 rounded-xl border px-4 py-3 shadow-sm">
        {#if pickingReason}
          <p class="text-[12.5px] font-semibold text-[#172b4d]">Neden bulgu değil? <span class="font-normal text-[#626f86]">(Esc vazgeç)</span></p>
          <div class="grid gap-2 sm:grid-cols-2">
            {#each DISMISS_REASONS as reason, i (reason)}
              <button
                type="button"
                class="hover:bg-secondary grid gap-0.5 rounded-lg border px-3 py-2 text-left"
                onclick={() => decide('ret', reason)}
              >
                <span class="flex items-center gap-2 text-[13px] font-semibold text-[#172b4d]"
                  ><kbd class={KEY}>{i + 1}</kbd>{DISMISS_REASON_LABELS[reason]}</span
                >
                <span class="text-[12px] leading-[17px] text-[#626f86]">{REASON_HINT[reason]}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="flex flex-wrap items-center gap-2">
            {#each DECISIONS as d (d.key)}
              <Button
                size="sm"
                variant={d.column === 'onay' ? 'default' : 'outline'}
                onclick={() => (d.column === 'ret' ? (pickingReason = true) : decide(d.column))}
              >
                <kbd class={KEY}>{d.key.toLocaleUpperCase('tr')}</kbd>{d.label}
              </Button>
            {/each}
            <span class="ml-auto text-[12px] text-[#626f86]"
              ><kbd class={KEY}>E</kbd> çözümü değiştir · <kbd class={KEY}>←</kbd><kbd class={KEY}>→</kbd> gez ·
              <kbd class={KEY}>Z</kbd> geri al</span
            >
          </div>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <p class="text-muted-foreground mx-auto py-16 text-center text-[13.5px]">
    Karar bekleyen bulgu kalmadı. Panoya dönüp kararlarını gözden geçirebilirsin.
  </p>
{/if}
