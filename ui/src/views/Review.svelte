<script lang="ts">
  import { DISMISS_REASON_LABELS, DISMISS_REASONS, type DismissReason, type Issue, type IssueDetail, type RunInfo } from '@argus/shared'
  import { onDestroy, onMount, untrack } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Drawer from '$lib/components/layout/Drawer.svelte'
  import FindingReport from '$lib/components/finding/FindingReport.svelte'
  import FixEditor from '$lib/components/finding/FixEditor.svelte'
  import Triage from '$lib/components/review/Triage.svelte'
  import Field from '$lib/components/form/Field.svelte'
  import { errorOf, validateFields } from '$lib/validation'
  import Modal from '$lib/components/layout/Modal.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, qs } from '$lib/api'
  import { formatDate, SEVERITY, STATUS } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { pageName } from '$lib/page-name.svelte'
  import {
    board,
    canContinue,
    changes,
    closeBlocker,
    columnOf,
    COLUMNS,
    DECISIONS,
    family,
    finished,
    KIND,
    REASON_HINT,
    seenBefore,
    similarPending,
    STAMP_STREAK,
    stampStreak,
    statusOf,
    suggestionFor,
    triageQueue,
    type ColumnId,
  } from '$lib/review'
  import { RUN_STATUS } from '$lib/format'
  import { live } from '$lib/stream.svelte'
  import { pageLabel } from '$lib/monitor'
  import { cn } from '$lib/utils'

  /**
   * Değerlendirme: koşu bitince bulgulara insan karar verir, sonra Kapanış'a geçilir. Sütunlar kararın kendisidir
   * (`COLUMNS`): İnceleme bekliyor · Düzeltilecek · Bilerek böyle · Bulgu değil · Anlamadım; hepsi aynı gri zeminlidir.
   * Kart sürüklenip bırakılır ya da çekmeceden karar verilir. "Bulgu değil" nedeni ister (dört seçenek; öğrenmeye
   * etkisi nedene göredir), neden seçilmeden karar yazılmaz. Her karardan sonra birkaç saniye "Geri al" çıkar.
   *
   * Çekmece: geçmiş karara benzeyen kartta öneri gösterilir (uygulanmaz); benzer bekleyen kartlar varsa karar
   * isteğe bağlı olarak onlara da uygulanır (liste görünür, kutu işaretlenmeden uygulanmaz). Önerilen çözüm
   * "Değiştir" ile düzenlenir; kapanış istemine ekibin metni gider. Art arda `STAMP_STREAK` karar öneriyle aynıysa
   * panoda hatırlatma çıkar. "Tek tek" kipi bekleyen kartları klavyeyle sırayla karara bağlatır (`Triage`).
   *
   * Anlamadım (değerlendirmenin ikinci turu): insan anlamadığı kartı Anlamadım'a alır ve sorusunu yazar (zorunlu; not
   * yoksa soru penceresi açılır). "Anlamadıklarımı netleştir" Argus'un bu kartları sorusuna göre yeniden yazmasını
   * sağlar (`server/src/review/clarify.ts`); kartlar İnceleme bekliyor'a döner, insan yine karar verir. Anlaşılmayan
   * ya da bekleyen karar kalırken "Sıradaki: Kapanış" nedenini söyler.
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
  let steering = $state(false)
  /** Pano ya da tek tek (triyaj) kipi. */
  let mode = $state<'pano' | 'tek'>('pano')
  /** Uygulamanın daha önce karar verilmiş sorunları: öneri bunlardan çıkar. */
  let history = $state<Issue[]>([])
  /** "Bulgu değil" denmiş ama nedeni seçilmemiş kartlar (neden penceresi). */
  let reasonFor = $state<{ ids: string[]; note: string | null } | null>(null)
  let reasonModal = $state(false)
  /** Çekmecedeki kararı benzer bekleyen kartlara da uygula. */
  let bulk = $state(false)
  let undo = $state<{ items: { id: string; status: Issue['status']; reason: DismissReason | null }[]; text: string } | null>(null)
  let undoTimer: ReturnType<typeof setTimeout> | undefined
  let streak = 0
  let stampNotice = $state(false)
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
  const decidedPool = $derived([...issues, ...history.filter((h) => !issues.some((i) => i.id === h.id))])
  const openIssue = $derived(issues.find((i) => i.id === openId) ?? null)
  const openPending = $derived(!!openIssue && columnOf(openIssue) === 'bekliyor')
  const openSuggestion = $derived(openIssue && openPending ? suggestionFor(openIssue, decidedPool) : null)
  const openSimilar = $derived(openIssue && openPending ? similarPending(openIssue, issues) : [])
  const queue = $derived(triageQueue(columns.bekliyor, decidedPool))
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
    history = await api<Issue[]>(
      `/sorunlar${qs({ proje: r.project, uygulama: r.application, durum: 'duzeltilecek,kabul-edildi,bulgu-degil', bastirilan: 1 })}`,
    ).catch(() => [])
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

  function goClosing() {
    if (blocker && !run?.closedAt) notify.error('Kapanışa geçilemez', blocker)
    else location.hash = `#/kapanis/${rootId}`
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
   * Karar: kart yeni sütuna bırakılınca (ya da çekmeceden, triyajdan) sorunların durumu yazılır; koşunun sayıları
   * sunucudan tazelenir. Anlamadım soru ister (pencere açılır), Bulgu değil neden ister (neden penceresi). Belirsiz'den
   * İnceleme bekliyor'a almak belirsizliği kaldırır. Karar sonrası "Geri al" sunulur (anlaşılmayan karttan alınan karar
   * hariç: sorusu geri yazılamaz).
   */
  async function move(
    ids: string[],
    column: ColumnId,
    note: string | null = null,
    reason: DismissReason | null = null,
  ) {
    const targets = ids.map((id) => issues.find((i) => i.id === id)).filter((i): i is Issue => !!i && changes(i, column))
    if (!targets.length || run?.closedAt) return
    if (column === 'belirsiz') {
      const id = targets[0]!.id
      if (note) return markUnclear(id, note)
      askingUnclear = id
      decisionNote = ''
      unclearSubmitted = false
      unclearModal = true
      return
    }
    if (column === 'ret' && !reason) {
      reasonFor = { ids: targets.map((i) => i.id), note }
      reasonModal = true
      return
    }
    const status = statusOf(column)
    const before = targets.map((i) => ({ issue: i, status: i.status, unclear: i.unclear, reason: i.reason }))
    for (const i of targets) streak = stampStreak(streak, suggestionFor(i, decidedPool)?.status ?? null, status)
    for (const i of targets) Object.assign(i, { status, unclear: false, reason: column === 'ret' ? reason : null })
    try {
      await Promise.all(
        targets.map((i) => post(`/sorunlar/${i.id}/karar`, { durum: status, not: note, ...(reason ? { neden: reason } : {}) })),
      )
      loaded = await api<RunInfo>(`/kosular/${rootId}`)
      const title = COLUMNS.find((c) => c.id === column)!.title
      offerUndo(
        before.filter((b) => !b.unclear).map((b) => ({ id: b.issue.id, status: b.status, reason: b.reason })),
        targets.length > 1 ? `${targets.length} kart: ${title}` : `${title}: ${targets[0]!.title}`,
      )
      if (streak >= STAMP_STREAK) {
        stampNotice = true
        streak = 0
      }
    } catch (e) {
      for (const b of before) Object.assign(b.issue, { status: b.status, unclear: b.unclear, reason: b.reason })
      notify.error('Karar kaydedilemedi', e instanceof Error ? e.message : String(e))
    }
  }

  function offerUndo(items: NonNullable<typeof undo>['items'], text: string) {
    clearTimeout(undoTimer)
    undo = items.length ? { items, text } : null
    if (undo) undoTimer = setTimeout(() => (undo = null), 6000)
  }

  async function undoLast() {
    const last = undo
    if (!last) return
    clearTimeout(undoTimer)
    undo = null
    try {
      await Promise.all(
        last.items.map((b) => post(`/sorunlar/${b.id}/karar`, { durum: b.status, not: null, ...(b.reason ? { neden: b.reason } : {}) })),
      )
      for (const b of last.items) {
        const issue = issues.find((i) => i.id === b.id)
        if (issue) Object.assign(issue, { status: b.status, reason: b.reason })
      }
      loaded = await api<RunInfo>(`/kosular/${rootId}`)
    } catch (e) {
      notify.error('Geri alınamadı', e instanceof Error ? e.message : String(e))
    }
  }

  async function pickReason(reason: DismissReason) {
    const pending = reasonFor
    reasonModal = false
    reasonFor = null
    if (pending) await move(pending.ids, 'ret', pending.note, reason)
  }

  async function editFix(id: string, text: string) {
    try {
      const updated = await post<IssueDetail>(`/sorunlar/${id}/duzeltme`, { metin: text })
      const issue = issues.find((i) => i.id === id)
      if (issue) Object.assign(issue, { fix: updated.fix, fixEdited: updated.fixEdited })
      if (detail?.id === id) detail = { ...detail, fix: updated.fix, fixEdited: updated.fixEdited }
    } catch (e) {
      notify.error('Düzeltme kaydedilemedi', e instanceof Error ? e.message : String(e))
      throw e
    }
  }

  async function markUnclear(id: string, question: string) {
    const issue = issues.find((i) => i.id === id)
    try {
      const updated = await post<IssueDetail>(`/sorunlar/${id}/belirsiz`, { soru: question })
      if (issue) Object.assign(issue, { status: updated.status, unclear: updated.unclear })
      loaded = await api<RunInfo>(`/kosular/${rootId}`)
    } catch (e) {
      notify.error('Kaydedilemedi', e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * Çekmecenin başlığındaki karar: kaydedilir, çekmece kapanır. Anlamadım için soru zorunludur: not yazılmamışsa panodaki
   * soru penceresi açılır (önceden çekmecenin dibindeki alana odaklanıp ekran dışında kalıyordu; düğme "çalışmıyor"du).
   */
  async function decideFromDrawer(column: ColumnId) {
    if (!openId) return
    if (column === 'belirsiz' && !decisionNote.trim()) {
      askingUnclear = openId
      unclearSubmitted = false
      unclearModal = true
      return
    }
    const ids = [openId, ...(bulk && column !== 'belirsiz' ? openSimilar.map((i) => i.id) : [])]
    const note = decisionNote.trim() || null
    openId = null
    decisionNote = ''
    unclearSubmitted = false
    await move(ids, column, note)
  }

  /** Pano penceresinden belirsiz: soru zorunlu. */
  async function confirmUnclear() {
    unclearSubmitted = true
    if (!askingUnclear || !decisionNote.trim()) return document.getElementById('belirsiz-soru')?.focus()
    const id = askingUnclear
    const question = decisionNote.trim()
    if (openId === id) openId = null
    unclearModal = false
    askingUnclear = null
    decisionNote = ''
    unclearSubmitted = false
    await markUnclear(id, question)
  }

  /** Netleştirme: Argus belirsiz kartları sorularına göre yeniden yazar; kartlar yeniden karar bekler. */
  async function clarify() {
    if (!run?.review.unclear)
      return notify.error('Netleştirilecek bulgu yok', 'Anlamadığın kartı Anlamadım sütununa sürükleyip sorunu yaz.')
    clarifying = true
    try {
      const result = await post<{ revised: number; failed: number }>(`/kosular/${rootId}/netlestir`, {})
      await load()
      if (result.failed)
        notify.warning(
          'Bir kısmı netleştirilemedi',
          `${result.revised} bulgu yeniden yazıldı, ${result.failed} bulgu yazılamadı; yeniden deneyebilirsin.`,
        )
      else notify.success('Netleştirildi', `${result.revised} bulgu yeniden yazıldı; yeniden değerlendir.`)
    } catch (e) {
      notify.error('Netleştirilemedi', e instanceof Error ? e.message : String(e))
    } finally {
      clarifying = false
    }
  }

  async function open(id: string) {
    openId = id
    bulk = false
    decisionNote = ''
    unclearSubmitted = false
    detail = null
    detail = await api<IssueDetail>(`/sorunlar/${id}`).catch(() => null)
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
        {clarifying ? 'Netleştiriliyor…' : `Anlamadıklarımı netleştir (${run.review.unclear})`}
      </Button>
    {/if}
    <Button onclick={goClosing}>{run?.closedAt ? 'Kapanış' : 'Sıradaki: Kapanış'}</Button>
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
              class="block bg-[#6e5dc6] transition-[width]"
              style={`width:${total ? (run.review.kept / total) * 100 : 0}%`}
            ></i>
            <i
              class="block bg-[#8590a2] transition-[width]"
              style={`width:${total ? (run.review.rejected / total) * 100 : 0}%`}
            ></i>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p class="text-[12.5px] text-[#44546f] tabular-nums">
              <b class="font-semibold text-[#172b4d]">{total - run.review.pending}/{total}</b> karar verildi ·
              {run.review.accepted} düzeltilecek · {run.review.kept} bilerek böyle · {run.review.rejected} bulgu
              değil{#if run.review.unclear}
                · {run.review.unclear} anlaşılmadı{/if}{#if run.closedAt}
                · {run.closedBy ?? ''} kapattı{/if}
            </p>
            <div class="ml-auto inline-flex rounded-lg bg-[#f1f2f4] p-0.5 text-[12.5px] font-medium" role="group" aria-label="Görünüm">
              {#each [['pano', 'Pano'], ['tek', 'Tek tek']] as const as [id, label] (id)}
                <button
                  type="button"
                  aria-pressed={mode === id}
                  class={cn('rounded-md px-3 py-1', mode === id ? 'bg-white text-[#172b4d] shadow-sm' : 'text-[#44546f]')}
                  onclick={() => {
                    mode = id
                    openId = null
                  }}>{label}{#if id === 'tek' && columns.bekliyor.length}
                    <span class="ml-1 tabular-nums text-[#626f86]">{columns.bekliyor.length}</span>{/if}</button
                >
              {/each}
            </div>
          </div>
        </div>
      </div>

      {#if stampNotice}
        <p class="flex items-start gap-3 rounded-lg bg-[#fff7d6] px-3.5 py-2.5 text-[13px] leading-5 text-[#533f04]">
          <span class="flex-1"
            >Son {STAMP_STREAK} kararın hepsi Argus'un önerisiyle aynıydı. Öneri yanılabilir; kartları okuyarak karar
            verdiğinden emin ol.</span
          >
          <button type="button" class="font-semibold underline" onclick={() => (stampNotice = false)}>Tamam</button>
        </p>
      {/if}

      {#if mode === 'tek'}
        <Triage
          {queue}
          decided={decidedPool}
          readonly={!!run.closedAt}
          ondecide={(issue, column, reason) => void move([issue.id], column, null, reason)}
          onundo={() => void undoLast()}
          oneditfix={editFix}
        />
      {:else}

      <!-- Sütunlar her zaman aynı, tam yükseklikte (boş sütun da); kartlar sütunun içinde kayar. -->
      <div class="grid gap-2.5 md:h-[calc(100svh-350px)] md:min-h-[420px] md:grid-cols-5">
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
              if (dragging) void move([dragging], column.id)
              dragging = null
            }}
          >
            <!-- Beş sütun dar: ad ve sayı tek satır, açıklama altında (sığmazsa kısalır, tamamı ipucunda). -->
            <header class="grid shrink-0 gap-0.5 px-2.5 pt-3 pb-2">
              <div class="flex min-w-0 items-center gap-1.5">
                <h2 class="truncate text-[12px] font-semibold whitespace-nowrap text-[#44546f] uppercase">
                  {column.title}
                </h2>
                <span
                  class="shrink-0 rounded-full bg-[#dcdfe4] px-2 text-[11.5px] leading-5 font-semibold text-[#44546f] tabular-nums"
                  >{columns[column.id].length}</span
                >
              </div>
              <span class="truncate text-[11.5px] text-[#626f86]" title={column.hint}>{column.hint}</span>
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
                      ><b class="font-semibold text-[#172b4d]">Çözüm{issue.fixEdited ? ' (ekip)' : ''}:</b>
                      {issue.fix}</span
                    >
                  {/if}
                  {#if issue.reason}
                    <span class="text-[11.5px] text-[#626f86]">Neden: {DISMISS_REASON_LABELS[issue.reason]}</span>
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
      {/if}
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
      {#each DECISIONS as d (d.key)}
        <Button size="sm" variant={d.column === 'onay' ? 'default' : 'outline'} onclick={() => decideFromDrawer(d.column)}
          >{d.label}</Button
        >
      {/each}
    {/if}
  {/snippet}
  {#if detail}
    {#if openSuggestion && !run?.closedAt}
      <p class="mb-4 rounded-lg bg-[#f3f0ff] px-3.5 py-2.5 text-[13px] leading-5 text-[#44337a]">
        Benzer bir bulguya daha önce <b class="font-semibold">“{STATUS[openSuggestion.status].label}”</b> denmişti:
        {openSuggestion.title}. Öneri kendiliğinden uygulanmaz.
      </p>
    {/if}
    {#if openSimilar.length && !run?.closedAt}
      <label class="mb-4 grid cursor-pointer gap-1.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-5">
        <span class="flex items-center gap-2 font-semibold text-[#172b4d]">
          <input type="checkbox" bind:checked={bulk} class="size-4 accent-[#0c66e4]" />
          Kararı benzer {openSimilar.length} bekleyen karta da uygula
        </span>
        <ul class="ml-6 list-disc text-[12.5px] text-[#44546f]">
          {#each openSimilar as other (other.id)}<li>{other.title}</li>{/each}
        </ul>
        <span class="ml-6 text-[12px] text-[#626f86]">Anlamadım kararı yalnız bu karta uygulanır.</span>
      </label>
    {/if}
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
    {#if openIssue}
      <div class="mt-5">
        <FixEditor
          fix={openIssue.fix}
          edited={openIssue.fixEdited}
          readonly={!!run?.closedAt}
          onsave={(text) => editFix(openIssue.id, text)}
        />
      </div>
    {/if}
    {#if !run?.closedAt}
      <div class="mt-6 border-t pt-4">
        <Field
          label="Not"
          for="karar-not"
          description="Karar verirken isteğe bağlı; Anlamadım derken neyi anlamadığını yaz."
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
  description="Kart Anlamadım sütununa geçer. Netleştir dediğinde Argus kartı sorunu yanıtlayarak yeniden yazar."
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
    <Button onclick={confirmUnclear}>Anlamadım olarak işaretle</Button>
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

<Modal
  bind:open={reasonModal}
  title="Neden bulgu değil?"
  description="Neden, Argus'un bu karardan ne öğreneceğini belirler."
>
  <div class="grid gap-2">
    {#each DISMISS_REASONS as reason (reason)}
      <button
        type="button"
        class="hover:bg-secondary grid gap-0.5 rounded-lg border px-3.5 py-2.5 text-left"
        onclick={() => pickReason(reason)}
      >
        <span class="text-[13.5px] font-semibold text-[#172b4d]">{DISMISS_REASON_LABELS[reason]}</span>
        <span class="text-[12.5px] leading-[18px] text-[#626f86]">{REASON_HINT[reason]}</span>
      </button>
    {/each}
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (reasonModal = false)}>Vazgeç</Button>
  {/snippet}
</Modal>

{#if undo}
  <div
    role="status"
    class="fixed bottom-5 left-1/2 z-50 flex max-w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-4 rounded-lg bg-[#172b4d] px-4 py-2.5 text-[13px] text-white shadow-lg"
  >
    <span class="min-w-0 truncate">{undo.text}</span>
    <button type="button" class="shrink-0 font-semibold text-[#85b8ff] hover:underline" onclick={undoLast}>Geri al</button>
  </div>
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
