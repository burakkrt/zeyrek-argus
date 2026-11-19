<script lang="ts">
  import type { Issue, IssueDetail, RunInfo } from '@argus/shared'
  import { onDestroy, onMount, untrack } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Drawer from '$lib/components/layout/Drawer.svelte'
  import FindingReport from '$lib/components/finding/FindingReport.svelte'
  import Field from '$lib/components/form/Field.svelte'
  import { errorOf, validateFields } from '$lib/validation'
  import Modal from '$lib/components/layout/Modal.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, qs } from '$lib/api'
  import { formatDate, SEVERITY } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { pageName } from '$lib/page-name.svelte'
  import {
    board,
    canContinue,
    changes,
    closeBlocker,
    COLUMNS,
    family,
    finished,
    KIND,
    seenBefore,
    statusOf,
    type ColumnId,
  } from '$lib/review'
  import { RUN_STATUS } from '$lib/format'
  import { live } from '$lib/stream.svelte'
  import { pageLabel } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Koşu onayı: koşu bitince bulgulara insan karar verir, sonra koşu kapatılır. Kartlar sürüklenip bırakılarak
   * "İnceleme bekliyor", "Belirsiz", "Onaylandı" ve "Reddedildi" sütunlarına taşınır (karar sorunun durumuna yazılır;
   * reddedileni Argus öğrenir). Kart başlığın altında önerilen çözümü gösterir: basit bulguya çekmeceyi açmadan karar
   * verilebilir. Karta tıklayınca ayrıntısı çekmecede açılır, açık kart panoda vurgulanır, diğerleri soluklaşır;
   * çekmecenin başlığından Onayla / Reddet / Belirsiz denir (isteğe bağlı notla), çekmece kapanır.
   *
   * Belirsiz (değerlendirmenin ikinci turu): insan anlamadığı kartı Belirsiz'e alır ve sorusunu yazar (zorunlu).
   * "Belirsizleri netleştir" Argus'un bu kartları sorusuna göre yeniden yazmasını sağlar (`server/src/review/clarify.ts`);
   * kartlar İnceleme bekliyor'a döner, insan yine karar verir. Belirsiz kalmazsa bu tur açılmaz. Belirsiz ya da bekleyen
   * karar kalırken "Koşuyu kapat" nedenini söyler.
   *
   * "Yönlendir ve sürdür" koşuyu kapatmadan kullanıcının notuyla devam koşusu başlatır; devam koşusunun bulguları bu
   * panoya düşer (pano koşunun ve devam koşularının sorunlarını birlikte gösterir) ve sürerken koşu kapatılamaz. Devam
   * koşusu bitince pano kendiliğinden tazelenir. Devam koşusundan açılan onay ana koşunun onayını gösterir.
   */
  let { runId }: { runId: string } = $props()

  let loaded = $state<RunInfo | null>(null)
  let issues = $state<Issue[]>([])
  let loading = $state(true)
  let dragging = $state<string | null>(null)
  let over = $state<ColumnId | null>(null)
  let openId = $state<string | null>(null)
  let detail = $state<IssueDetail | null>(null)
  let confirm = $state(false)
  let steering = $state(false)
  /** Çekmecedeki karar notu (onay ve retle isteğe bağlı, belirsizde zorunlu soru). */
  let decisionNote = $state('')
  let unclearSubmitted = $state(false)
  const noteMissing = $derived(unclearSubmitted && !decisionNote.trim())
  /** Panoda Belirsiz'e bırakılan kart: soru penceresi açılır. */
  let askingUnclear = $state<string | null>(null)
  let unclearModal = $state(false)
  let clarifying = $state(false)
  let note = $state('')
  let sending = $state(false)
  // Yönlendirme notu zorunludur; hata ilk "Sürdür"den sonra alanda gösterilir (bildirim değil).
  let noteSubmitted = $state(false)
  const noteErrors = $derived(
    noteSubmitted
      ? validateFields([
          { id: 'surdur-not', label: 'Argus neye baksın?', value: note, required: "Argus'un neye bakacağını yaz." },
        ])
      : [],
  )

  const rootId = $derived(loaded?.id ?? runId)
  const run = $derived(loaded ? (live.runs[loaded.id] ?? loaded) : null)
  // Devam koşularının canlı durumu: biri bitince pano tazelenir (yeni bulguları gelir).
  const familyKey = $derived(
    (run?.continuations ?? []).map((c) => `${c.id}:${live.runs[c.id]?.status ?? c.status}`).join('|'),
  )
  const continuations = $derived(
    (run?.continuations ?? []).map((c) => ({ ...c, status: live.runs[c.id]?.status ?? c.status })),
  )
  const gate = $derived(run ? { ...run, continuations } : null)
  const columns = $derived(board(issues))
  const total = $derived(issues.length)
  const blocker = $derived(gate ? closeBlocker(gate) : null)
  const occurrence = $derived.by(() => {
    const ids = run ? family(run) : [runId]
    return detail?.occurrences.find((o) => ids.includes(o.runId)) ?? detail?.occurrences[0] ?? null
  })

  /** Ana koşu (devam koşusundan açıldıysa onun ana koşusu) ve ailesinin bütün sorunları, sorun başına bir kez. */
  async function load() {
    const opened = await api<RunInfo>(`/kosular/${runId}`)
    const r = opened.options.parentRunId
      ? await api<RunInfo>(`/kosular/${opened.options.parentRunId}`)
      : opened
    if (gone) return
    loaded = r
    pageName.current = r.code
    const lists = await Promise.all(
      family(r).map((id) =>
        api<Issue[]>(
          `/sorunlar${qs({ proje: r.project, uygulama: r.application, kosu: id, bastirilan: 1 })}`,
        ),
      ),
    )
    issues = [...new Map(lists.flat().map((i) => [i.id, i])).values()]
  }

  // Sayfadan ayrıldıktan sonra biten yükleme iz ve sekme başlığına eski koşunun kodunu yazmasın.
  let gone = false
  onDestroy(() => (gone = true))

  let lastFamily = ''
  $effect(() => {
    const key = familyKey
    untrack(() => {
      if (lastFamily && key !== lastFamily) void load()
      lastFamily = key
    })
  })

  // Başlık düğmeleri hep açıktır: işlem yapılamıyorsa tıklanınca nedeni söylenir (pasif düğme nedenini söylemiyordu).
  function askSteer() {
    if (gate && canContinue(gate)) steering = true
    else
      notify.error(
        'Koşu sürdürülemez',
        run?.closedAt ? 'Koşu kapatıldı.' : 'Koşu ya da devam koşusu sürüyor; bitince sürdürülebilir.',
      )
  }

  function askClose() {
    if (blocker) notify.error('Koşu kapatılamaz', blocker)
    else confirm = true
  }

  async function steer() {
    noteSubmitted = true
    if (noteErrors.length) return document.getElementById('surdur-not')?.focus()
    sending = true
    try {
      const next = await post<RunInfo>(`/kosular/${rootId}/surdur`, { mesaj: note.trim() })
      notify.success('Devam koşusu başladı', `${next.code}: yeni bulguları bu panoya düşecek.`)
      steering = false
      note = ''
      noteSubmitted = false
      await load()
    } catch (e) {
      notify.error('Koşu sürdürülemedi', e instanceof Error ? e.message : String(e))
    } finally {
      sending = false
    }
  }

  onMount(() => {
    load()
      .catch((e: unknown) => notify.error('Koşu okunamadı', e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false))
  })

  /**
   * Karar: kart yeni sütuna bırakılınca (ya da çekmeceden) sorunun durumu yazılır; koşunun sayıları sunucudan tazelenir.
   * Belirsiz'e bırakmak soru ister (pencere açılır). Belirsiz'den İnceleme bekliyor'a almak belirsizliği kaldırır.
   */
  async function move(id: string, column: ColumnId, note: string | null = null) {
    const issue = issues.find((i) => i.id === id)
    if (!issue || !changes(issue, column) || run?.closedAt) return
    if (column === 'belirsiz') {
      if (note) return markUnclear(id, note)
      askingUnclear = id
      decisionNote = ''
      unclearSubmitted = false
      unclearModal = true
      return
    }
    const before = { status: issue.status, unclear: issue.unclear }
    issue.status = statusOf(column)
    issue.unclear = false
    try {
      await post(`/sorunlar/${id}/karar`, { durum: issue.status, not: note })
      loaded = await api<RunInfo>(`/kosular/${rootId}`)
    } catch (e) {
      Object.assign(issue, before)
      notify.error('Karar kaydedilemedi', e instanceof Error ? e.message : String(e))
    }
  }

  async function markUnclear(id: string, question: string) {
    const issue = issues.find((i) => i.id === id)
    try {
      const updated = await post<IssueDetail>(`/sorunlar/${id}/belirsiz`, { soru: question })
      if (issue) Object.assign(issue, { status: updated.status, unclear: updated.unclear })
      loaded = await api<RunInfo>(`/kosular/${rootId}`)
    } catch (e) {
      notify.error('Belirsiz olarak kaydedilemedi', e instanceof Error ? e.message : String(e))
    }
  }

  /** Çekmecenin başlığındaki karar: kaydedilir, çekmece kapanır. Belirsiz için not (soru) zorunludur. */
  async function decideFromDrawer(column: ColumnId) {
    if (!openId) return
    if (column === 'belirsiz' && !decisionNote.trim()) {
      unclearSubmitted = true
      return document.getElementById('karar-not')?.focus()
    }
    const id = openId
    const note = decisionNote.trim() || null
    openId = null
    decisionNote = ''
    unclearSubmitted = false
    await move(id, column, note)
  }

  /** Pano penceresinden belirsiz: soru zorunlu. */
  async function confirmUnclear() {
    unclearSubmitted = true
    if (!askingUnclear || !decisionNote.trim()) return document.getElementById('belirsiz-soru')?.focus()
    const id = askingUnclear
    const question = decisionNote.trim()
    unclearModal = false
    askingUnclear = null
    decisionNote = ''
    unclearSubmitted = false
    await markUnclear(id, question)
  }

  /** Netleştirme: Argus belirsiz kartları sorularına göre yeniden yazar; kartlar yeniden karar bekler. */
  async function clarify() {
    if (!run?.review.unclear)
      return notify.error('Netleştirilecek bulgu yok', 'Anlamadığın kartı Belirsiz sütununa sürükleyip sorunu yaz.')
    clarifying = true
    try {
      const result = await post<{ revised: number; failed: number }>(`/kosular/${rootId}/netlestir`, {})
      await load()
      if (result.failed)
        notify.warning(
          'Bir kısmı netleştirilemedi',
          `${result.revised} bulgu yeniden yazıldı, ${result.failed} bulgu yazılamadı; yeniden deneyebilirsin.`,
        )
      else notify.success('Belirsizler netleştirildi', `${result.revised} bulgu yeniden yazıldı; yeniden değerlendir.`)
    } catch (e) {
      notify.error('Netleştirilemedi', e instanceof Error ? e.message : String(e))
    } finally {
      clarifying = false
    }
  }

  async function open(id: string) {
    openId = id
    decisionNote = ''
    unclearSubmitted = false
    detail = null
    detail = await api<IssueDetail>(`/sorunlar/${id}`).catch(() => null)
  }

  async function close() {
    try {
      loaded = await post<RunInfo>(`/kosular/${rootId}/kapat`, {})
      confirm = false
      notify.success('Koşu kapatıldı')
    } catch (e) {
      notify.error('Koşu kapatılamadı', e instanceof Error ? e.message : String(e))
    }
  }

  const MARK = {
    kesin: 'bg-[#d92d20]',
    tutarsizlik: 'rotate-45 scale-[.85] bg-[#b54708]',
    not: 'rounded-full border-[1.5px] border-[#667085]',
  } as const
  const KIND_TEXT = { kesin: 'text-[#d92d20]', tutarsizlik: 'text-[#b54708]', not: 'text-[#667085]' } as const
  /** Önem etiketi (Jira'nın lozenge'i): ağır olan sıcak renk, hafif olan gri. */
  const SEVERITY_TONE = {
    S1: 'bg-[#ffeceb] text-[#ae2e24]',
    S2: 'bg-[#fff3eb] text-[#a54800]',
    S3: 'bg-[#e9f2ff] text-[#0055cc]',
    S4: 'bg-[#f1f2f4] text-[#44546f]',
  } as const
</script>

<Page
  title={run ? `${run.code} · Değerlendirme` : 'Değerlendirme'}
  description={run?.options.brief ?? run?.pages.join(', ') ?? ''}
>
  {#snippet actions()}
    <Button variant="outline" onclick={askSteer}>Yönlendir ve sürdür</Button>
    {#if run?.review.unclear}
      <Button variant="outline" disabled={clarifying} onclick={clarify}>
        {clarifying ? 'Netleştiriliyor…' : `Belirsizleri netleştir (${run.review.unclear})`}
      </Button>
    {/if}
    <Button onclick={askClose}>{run?.closedAt ? 'Kapatıldı' : 'Koşuyu kapat'}</Button>
  {/snippet}
  {#snippet subheader()}<RunSteps {run} current={run?.closedAt ? 'kapanis' : 'degerlendirme'} />{/snippet}
  {#if run}
    {#if continuations.length}
      <section
        class="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-5 py-3 text-[12.5px]"
      >
        <span class="text-muted-foreground font-semibold">Devam koşuları</span>
        {#each continuations as c (c.id)}
          <a
            href={`#/monitor/${c.id}`}
            class="hover:bg-secondary inline-flex items-center gap-2 rounded-md border px-2.5 py-1"
          >
            <b class="font-semibold">{c.code}</b>
            <span class={cn(finished(c) ? 'text-muted-foreground' : 'text-brand font-medium')}
              >{RUN_STATUS[c.status].label}</span
            >
            <Icon name="openInNew" class="text-muted-foreground size-3.5" />
          </a>
        {/each}
        {#if !continuations.every(finished)}
          <span class="text-muted-foreground"
            >Devam koşusu sürüyor; yeni bulguları bitince bu panoya düşer.</span
          >
        {/if}
      </section>
    {/if}

    <!-- Pano (Jira düzeni): beyaz kartın içinde gri sütunlar; sütun insanın kararıdır, kartlar sürüklenip bırakılır. -->
    <section class="bg-card grid gap-4 rounded-xl border p-4">
      <div class="grid gap-1.5">
        <div class="grid gap-1.5">
          <div class="flex h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
            <i
              class="block bg-[#1f845a] transition-[width]"
              style={`width:${total ? (run.review.accepted / total) * 100 : 0}%`}
            ></i>
            <i
              class="block bg-[#8590a2] transition-[width]"
              style={`width:${total ? (run.review.rejected / total) * 100 : 0}%`}
            ></i>
          </div>
          <p class="text-[12.5px] text-[#44546f] tabular-nums">
            <b class="font-semibold text-[#172b4d]">{total - run.review.pending}/{total}</b> karar verildi ·
            {run.review.accepted} onaylandı · {run.review.rejected} reddedildi{#if run.review.unclear}
              · {run.review.unclear} belirsiz{/if}{#if run.closedAt}
              · {run.closedBy ?? ''} kapattı{/if}
          </p>
        </div>
      </div>

      <!-- Sütunlar her zaman aynı, tam yükseklikte (boş sütun da); kartlar sütunun içinde kayar. -->
      <div class="grid gap-3 md:h-[calc(100svh-350px)] md:min-h-[420px] md:grid-cols-4">
        {#each COLUMNS as column (column.id)}
          <section
            aria-label={column.title}
            class={cn(
              'column flex min-h-[360px] flex-col rounded-lg bg-[#f7f8f9] md:h-full md:min-h-0',
              over === column.id && 'over',
            )}
            ondragover={(e) => {
              if (!dragging || run?.closedAt) return
              e.preventDefault()
              over = column.id
            }}
            ondragleave={(e) => {
              if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null))
                over = over === column.id ? null : over
            }}
            ondrop={(e) => {
              e.preventDefault()
              over = null
              if (dragging) void move(dragging, column.id)
              dragging = null
            }}
          >
            <header class="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2">
              <h2 class="text-[12px] font-semibold tracking-[.04em] text-[#44546f] uppercase">
                {column.title}
              </h2>
              <span
                class="rounded-full bg-[#dcdfe4] px-2 text-[11.5px] leading-5 font-semibold text-[#44546f] tabular-nums"
                >{columns[column.id].length}</span
              >
              <span class="ml-auto truncate text-[11.5px] text-[#626f86]">{column.hint}</span>
            </header>
            <!-- Üstte 4 px boşluk: ilk kartın kenarı ve gölgesi (açık kartın mavi çerçevesi) başlığın altında kesilmesin;
                 yatay kayma yok, kart sütuna sığar. -->
            <div class="scroll-thin scroll-rounded grid min-h-0 content-start gap-2 overflow-x-hidden overflow-y-auto px-2 pt-1 pb-2">
              {#each columns[column.id] as issue (issue.id)}
                <button
                  type="button"
                  draggable={!run.closedAt}
                  ondragstart={(e) => {
                    dragging = issue.id
                    e.dataTransfer?.setData('text/plain', issue.id)
                  }}
                  ondragend={() => (dragging = null)}
                  onclick={() => open(issue.id)}
                  aria-current={openId === issue.id ? 'true' : undefined}
                  class={cn(
                    'card grid min-w-0 gap-2 rounded-md bg-white px-3 py-2.5 text-left',
                    !run.closedAt && 'cursor-grab active:cursor-grabbing',
                    dragging === issue.id && 'dragging',
                    openId === issue.id && 'active',
                    openId && openId !== issue.id && 'dimmed',
                  )}
                >
                  <span class="text-[13.5px] leading-5 font-medium text-[#172b4d]">{issue.title}</span>
                  {#if issue.fix}
                    <span class="line-clamp-2 text-[12.5px] leading-[18px] text-[#44546f]"
                      ><b class="font-semibold text-[#172b4d]">Çözüm:</b> {issue.fix}</span
                    >
                  {/if}
                  <span class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[11.5px] text-[#626f86]">
                    <span class={cn('size-[8px] shrink-0', MARK[issue.kind])}></span>
                    <span class={cn('font-semibold', KIND_TEXT[issue.kind])}>{KIND[issue.kind]}</span>
                    <span class="min-w-0 flex-1 truncate">{issue.pages.map(pageLabel).join(', ')}</span>
                    <span class="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {#if seenBefore(issue, run)}<span title="Önceki koşularda da görüldü"
                          ><Icon name="history" class="size-3.5 text-[#6941c6]" /></span
                        >{/if}
                      {#if issue.contested}<span
                          class="rounded bg-[#fff7d6] px-1.5 text-[10.5px] leading-4 font-bold text-[#7f5f01] uppercase"
                          >Tartışmalı</span
                        >{/if}
                      <span
                        class={cn(
                          'rounded px-1.5 text-[10.5px] leading-4 font-bold uppercase',
                          SEVERITY_TONE[issue.severity],
                        )}
                        title={SEVERITY[issue.severity].hint}
                        >{issue.severity} {SEVERITY[issue.severity].label}</span
                      >
                    </span>
                  </span>
                </button>
              {:else}
                <p
                  class="m-1 rounded-md border border-dashed border-[#dcdfe4] px-2 py-8 text-center text-[12.5px] text-[#626f86]"
                >
                  {column.id === 'bekliyor'
                    ? 'Karar bekleyen bulgu yok.'
                    : column.id === 'belirsiz'
                      ? 'Anlamadığın kartı buraya sürükle; Argus netleştirir.'
                      : 'Kartı buraya sürükle.'}
                </p>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </section>
  {:else if !loading}
    <p class="text-muted-foreground text-sm">Koşu bulunamadı.</p>
  {/if}
</Page>

<Drawer
  open={openId !== null}
  title={detail ? KIND[detail.kind] : 'Bulgu'}
  meta={detail
    ? [run?.code, `${detail.severity} ${SEVERITY[detail.severity].label}`].filter(Boolean).join(' · ')
    : undefined}
  onclose={() => (openId = null)}
>
  {#snippet actions()}
    {#if detail}
      <a
        class="text-brand hover:bg-secondary inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium"
        href={`#/bulgular/${detail.id}`}
        target="_blank"
        rel="noreferrer"
        title="Bulgu kaydını yeni sekmede aç">Bulgu kaydı <Icon name="openInNew" class="size-4" /></a
      >
    {/if}
  {/snippet}
  {#snippet toolbar()}
    {#if detail && !run?.closedAt}
      <span class="text-muted-foreground mr-auto text-[12.5px]">Karar</span>
      <Button size="sm" variant="outline" onclick={() => decideFromDrawer('belirsiz')}>Belirsiz</Button>
      <Button size="sm" variant="outline" onclick={() => decideFromDrawer('ret')}>Reddet</Button>
      <Button size="sm" onclick={() => decideFromDrawer('onay')}>Onayla</Button>
    {/if}
  {/snippet}
  {#if detail}
    {#if occurrence}
      {#if detail.comments.length}
        <section class="mb-5 grid gap-2 rounded-lg bg-[#f9fafb] px-3.5 py-3 text-[13px] leading-5">
          <h3 class="text-sm font-semibold text-[#101828]">Yorumlar</h3>
          {#each detail.comments as comment, i (i)}
            <p class="text-[#475467]"><b class="font-semibold text-[#101828]">{comment.author}:</b> {comment.text}</p>
          {/each}
        </section>
      {/if}
      <FindingReport
        title={detail.title}
        {occurrence}
        place={detail.pages.map(pageLabel).join(', ')}
        footer={[
          run?.code,
          `${detail.seenCount} kez görüldü`,
          detail.seenCount > 1 ? `ilk kez ${formatDate(detail.firstSeen)}` : null,
          detail.contested ? 'tartışmalı: iki kararın hükmü zıt' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
    {:else}
      <p class="text-muted-foreground text-[13px]">Bu bulgunun görünümü okunamadı.</p>
    {/if}
    {#if !run?.closedAt}
      <div class="mt-6 border-t pt-4">
        <Field
          label="Not"
          for="karar-not"
          description="Onaylarken ya da reddederken isteğe bağlı; Belirsiz derken neyi anlamadığını yaz."
          error={noteMissing ? 'Neyi anlamadığını yaz; Argus buna göre netleştirir.' : null}
        >
          <textarea
            id="karar-not"
            bind:value={decisionNote}
            rows="3"
            aria-invalid={noteMissing ? true : undefined}
            aria-describedby={noteMissing ? 'karar-not-hata' : undefined}
            placeholder="Ör. Bulgu doğru ama önerilen çözüm yanlış; filtre değil toplam hesabı düzeltilmeli."
            class="placeholder:text-placeholder aria-invalid:border-destructive w-full rounded-lg border px-3 py-2 text-[13.5px] leading-5 outline-none focus:border-[#0c66e4]"
          ></textarea>
        </Field>
      </div>
    {/if}
  {:else}
    <p class="text-muted-foreground text-[13px]">Yükleniyor…</p>
  {/if}
</Drawer>

<Modal
  bind:open={unclearModal}
  title="Neyi anlamadın?"
  description="Kart Belirsiz sütununa geçer. Belirsizleri netleştir dediğinde Argus kartı sorusuna göre yeniden yazar."
>
  <Field label="Soru" for="belirsiz-soru" required error={noteMissing ? 'Neyi anlamadığını yaz.' : null}>
    <textarea
      id="belirsiz-soru"
      bind:value={decisionNote}
      rows="4"
      aria-invalid={noteMissing ? true : undefined}
      aria-describedby={noteMissing ? 'belirsiz-soru-hata' : undefined}
      placeholder="Ör. Toplam neden 5? Hangi süzgeçle bakıldı, kullanıcı bunu nerede görüyor?"
      class="placeholder:text-placeholder aria-invalid:border-destructive w-full rounded-lg border px-3 py-2 text-[13.5px] leading-5 outline-none focus:border-[#0c66e4]"
    ></textarea>
  </Field>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (unclearModal = false)}>Vazgeç</Button>
    <Button onclick={confirmUnclear}>Belirsiz olarak işaretle</Button>
  {/snippet}
</Modal>

<Modal
  bind:open={steering}
  title="Yönlendir ve sürdür"
  description="Koşu kapatılmadan senin notunla aynı sayfalarda sürer. Yeni bulgular bu panoya düşer; karar verilmeden koşu kapatılamaz."
>
  <Field label="Argus neye baksın?" for="surdur-not" required error={errorOf(noteErrors, 'surdur-not')}>
    <textarea
      id="surdur-not"
      bind:value={note}
      rows="4"
      aria-invalid={noteErrors.length ? true : undefined}
      aria-describedby={noteErrors.length ? 'surdur-not-hata' : undefined}
      placeholder="Ör. Kapanışta 'Önerildi' durumundaki 360° talepleri de dene; silme sorgusunu çalıştırarak doğrula."
      class="placeholder:text-placeholder aria-invalid:border-destructive w-full rounded-lg border px-3 py-2 text-[13.5px] leading-5 outline-none focus:border-[#0c66e4]"
    ></textarea>
  </Field>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (steering = false)}>Vazgeç</Button>
    <Button disabled={sending} onclick={steer}>Sürdür</Button>
  {/snippet}
</Modal>

{#if run}
  <Modal
    bind:open={confirm}
    title="Koşuyu kapat"
    description="Kararlar kaydedildi. Reddedilenlerden Argus ders çıkarır; kapatılan koşunun sonuç ekranı sonraki adımda hazırlanacak."
    size="sm"
  >
    <div class="grid grid-cols-2 gap-2">
      <div class="bg-surface-alt grid rounded-lg px-3 py-2">
        <b class="text-lg tabular-nums">{run.review.accepted}</b><span class="text-muted-foreground text-xs"
          >Onaylandı</span
        >
      </div>
      <div class="bg-surface-alt grid rounded-lg px-3 py-2">
        <b class="text-lg tabular-nums">{run.review.rejected}</b><span class="text-muted-foreground text-xs"
          >Reddedildi</span
        >
      </div>
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={() => (confirm = false)}>Vazgeç</Button>
      <Button onclick={close}>Kapat</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  /* Jira kartı: kenarsız, iki katmanlı ince gölge; üzerine gelince zemin hafif griye döner. */
  .card {
    box-shadow:
      0 1px 1px rgba(9, 30, 66, 0.25),
      0 0 1px rgba(9, 30, 66, 0.31);
    transition:
      background-color 0.12s,
      opacity 0.12s;
  }
  .card:hover {
    background: #f7f8f9;
  }
  /* Çekmecede açık olan kart belirgin, diğerleri soluk: hangi kartın okunduğu panoda görünür. */
  .card.active {
    box-shadow:
      0 0 0 2px #0c66e4,
      0 4px 12px -4px rgba(12, 102, 228, 0.35);
  }
  .card.dimmed {
    opacity: 0.55;
  }
  .card:focus-visible {
    outline: 2px solid #0c66e4;
    outline-offset: 1px;
  }
  .card.dragging {
    opacity: 0.45;
  }
  /* Bırakılacak sütun: açık mavi zemin ve kesikli mavi çerçeve. */
  .column {
    transition:
      background-color 0.12s,
      box-shadow 0.12s;
  }
  .column.over {
    background: #e9f2ff;
    box-shadow: inset 0 0 0 2px #0c66e4;
  }
</style>
