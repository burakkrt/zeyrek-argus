<script lang="ts">
  import type { ItemSource, RunInfo, RunStrategy, StrategyItem } from '@argus/shared'
  import { onDestroy, onMount, tick, untrack, type Snippet } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Dictation from '$lib/components/form/Dictation.svelte'
  import FormErrors from '$lib/components/form/FormErrors.svelte'
  import Modal from '$lib/components/layout/Modal.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import PlanProgress from '$lib/components/run/PlanProgress.svelte'
  import RunSummary from '$lib/components/run/RunSummary.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, quietApi } from '$lib/api'
  import { notify } from '$lib/notify.svelte'
  import { pageName } from '$lib/page-name.svelte'
  import { scenarioParts, scenarioText, type ScenarioParts } from '$lib/plan'
  import { changeLines, planDiff, revisionMarks, type ChangeKind } from '$lib/plan-diff'
  import { go } from '$lib/router.svelte'
  import { live } from '$lib/stream.svelte'
  import { cn } from '$lib/utils'
  import { errorOf, validateFields, type FieldError } from '$lib/validation'

  /**
   * Plan adımı: Yeni koşu başlatılınca Argus isteği, hafızayı ve kuralları okuyup (gerekirse tanımlara bakarak) koşunun
   * planını yazar ve tarayıcıyı açmadan durur. Düzen Yeni koşu ve plan hazırlığıyla aynıdır: solda içerik, sağda yapışkan
   * sütunda Koşu kartı; plan hazır olunca altında "Bölümler" kartı (Şikayet / DİF kayıt sayfasının gezinme kartı kalıbı;
   * kaydırdıkça bulunulan bölüm seçili). Belgenin ilk bölümü
   * "Planı düzenlet" (Yeni koşu'daki gibi girdi alanı; yazarak ya da konuşarak) planın tamamını yeniden yazdırır.
   * Altında insan planı elle düzenler: kapsam, vakalar (hepsi işaretli gelir; işareti kaldırılan koşmaz; satıra tıklayınca
   * açılır), senaryolar (Durum · Ne olmalı · Bulgu sayılır), bitiş ölçütü, tanımlardan öğrenilenler ve yapılamayacaklar;
   * değişiklikler kendiliğinden kaydedilir. "Planı onayla ve başlat" koşuyu işaretli vakalarla başlatır; planlayıcı
   * yeniden çağrılmaz. Argus yazarken plan hazırlığı çizelgesi görünür (`PlanProgress`); plan hazır olunca sayfa canlı
   * akıştan kendiliğinden güncellenir.
   */
  let { runId }: { runId: string } = $props()

  const SOURCES: ItemSource[] = ['tanim', 'ekran', 'ikisi']
  const SOURCE_LABEL: Record<ItemSource, string> = { tanim: 'Tanım', ekran: 'Ekran', ikisi: 'Tanım + ekran' }
  const SOURCE_HELP: Record<ItemSource, string> = {
    tanim: 'Servis ve akışlar test verisiyle çalıştırılır, sonuç veride okunur.',
    ekran: 'Sayfa açılır; ekrandaki liste, durum ve düğmeler gözlenir.',
    ikisi: 'Önce tanım çalıştırılır, sonra sonuç ekranda doğrulanır.',
  }
  const SOURCE_TONE: Record<ItemSource, string> = {
    tanim: 'border-[#d9d6fe] bg-[#f4f3ff] text-[#5925dc]',
    ekran: 'border-[#cce0ff] bg-[#e9f2ff] text-[#0055cc]',
    ikisi: 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]',
  }
  const NOTES = [
    {
      key: 'known',
      id: 'ogrenilenler',
      title: 'Tanımlardan öğrenilenler',
      description:
        "Argus'un plan yazarken servis, akış ve sayfa tanımlarını okuyarak çıkardığı kurallar. Vakalar bunlara dayanır; yanlış olanı düzelt ya da sil.",
      empty: 'Argus bu plan için tanım okumadı.',
    },
    {
      key: 'infeasible',
      id: 'yapilamayacaklar',
      title: 'Bu koşuda yapılamayacaklar',
      description: 'Test edilemeyecek olanlar ve nedeni. Kapsam raporunda ayrıca belirtilir.',
      empty: 'Yapılamayacak bir şey yok.',
    },
  ] as const
  /** Düzenletmeden sonra değişiklik işaretleri: yeni yeşil, değişen amber; aynı kalan işaretsiz. */
  const CHANGE_ROW: Record<ChangeKind, string> = { yeni: 'bg-[#f6fef9]', degisti: 'bg-[#fffcf5]', ayni: '' }
  const CHANGE_BADGE: Record<Exclude<ChangeKind, 'ayni'>, { label: string; tone: string }> = {
    yeni: { label: 'Yeni eklendi', tone: 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]' },
    degisti: { label: 'Değiştirildi', tone: 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]' },
  }
  const READ = 'text-[13.5px] leading-6 break-words whitespace-pre-line text-[#344054]'
  const SECTION = 'bg-card grid scroll-mt-[228px] gap-3 rounded-xl border p-6'
  const FIELD =
    'border-input focus-visible:border-ring focus-visible:ring-ring/15 block w-full resize-none rounded-lg border px-3 py-2 text-[13.5px] leading-6 outline-none [field-sizing:content] focus-visible:ring-2'
  const ADD_ROW =
    'text-brand-strong hover:bg-brand-soft flex w-full items-center gap-2 border-t bg-white px-4 py-2.5 text-left text-[13px] font-semibold transition-colors'
  const ICON_BTN =
    'text-muted-foreground hover:bg-secondary hover:text-foreground grid size-7 shrink-0 place-items-center rounded-md transition-colors'

  let loaded = $state<RunInfo | null>(null)
  let plan = $state<RunStrategy | null>(null)
  /** Argus'un son yazdığı plan (elle düzenlemeler bunun üstüne) ve son düzenletmeden önceki sürümü. */
  let base = $state<RunStrategy | null>(null)
  let previous = $state<RunStrategy | null>(null)
  let confirmRevise = $state(false)
  let request = $state('')
  let requestSubmitted = $state(false)
  let approveSubmitted = $state(false)
  let busy = $state(false)
  let formErrors = $state<ReturnType<typeof FormErrors> | null>(null)
  let openItem = $state<number | null>(null)
  /** Açık senaryo formu: düzenlenen satır (index) ya da yeni senaryo (null); üç alan ayrı doldurulur. */
  let draft = $state<(ScenarioParts & { index: number | null; submitted: boolean }) | null>(null)
  let activeSection = $state('kapsam')

  const run = $derived(loaded ? (live.runs[loaded.id] ?? loaded) : null)
  const planState = $derived(run?.planState ?? null)
  const drafting = $derived(planState === 'hazirlaniyor' || planState === 'duzenleniyor')
  const editable = $derived(planState === 'taslak' && !!plan)
  // Plan onaylandı (koşu başladı ya da bitti): plan yalnız okunur; düzenletme, ekleme ve işaretler yoktur.
  const viewOnly = $derived(planState === 'onaylandi' && !!plan)
  const includedCount = $derived(plan?.items.filter((i) => !i.excluded).length ?? 0)
  // Düzenletmeden sonra yalnız Argus'un değiştirdikleri (önceki sürüm → Argus'un yazdığı, şimdiki plana taşınmış);
  // elle eklenen işaretsizdir, silinenler gösterilmez.
  const diff = $derived(plan && previous && base && !viewOnly ? revisionMarks(previous, base, plan) : null)
  // Düzenletmede bırakılacak elle değişiklikler (Argus'un yazdığı → şimdiki plan).
  const manualChanges = $derived(plan && base ? changeLines(planDiff(base, plan), plan) : [])
  const sections = $derived(
    plan
      ? [
          { id: 'kapsam', title: 'Kapsam', detail: "Argus'un anladığı", warn: false },
          {
            id: 'vakalar',
            title: 'Vakalar',
            detail: `${includedCount} / ${plan.items.length} koşuya dahil`,
            warn: includedCount < plan.items.length,
          },
          { id: 'senaryolar', title: 'Senaryolar', detail: `${plan.scenarios.length} senaryo`, warn: false },
          { id: 'bitis', title: 'Bitiş ölçütü', detail: 'Tamam sayılma koşulu', warn: false },
          { id: 'ogrenilenler', title: 'Öğrenilenler', detail: `${plan.known.length} kural`, warn: false },
          { id: 'yapilamayacaklar', title: 'Yapılamayacaklar', detail: `${plan.infeasible.length} madde`, warn: false },
        ]
      : [],
  )
  const requestErrors = $derived(
    requestSubmitted
      ? validateFields([{ id: 'plan-istek', label: 'İstek', value: request, required: "Argus'tan ne istediğini yaz." }])
      : [],
  )
  const planErrors = $derived<FieldError[]>(
    approveSubmitted && plan
      ? [
          ...(plan.items.some((i) => i.title.trim() && !i.excluded)
            ? []
            : [{ id: 'vaka-ekle', label: 'Vakalar', message: 'Koşuya dahil en az bir vaka olmalı.' }]),
          ...plan.items.flatMap((item, i) =>
            item.title.trim() || !item.goal.trim()
              ? []
              : [{ id: `vaka-${i}-baslik`, label: `Vaka ${i + 1}`, message: 'Vakanın başlığı boş.' }],
          ),
        ]
      : [],
  )

  async function load() {
    // Koşu canlı akışta varsa (Yeni koşu'dan gelince hep vardır) sayfa beklemeden çizilir, sunucudan sessizce tazelenir:
    // açılış yüklemesi içeriği gizleyip sayfa yenileniyormuş gibi görünüyordu.
    const known = live.runs[runId]
    if (known && !loaded) loaded = known
    const info = await (known ? quietApi<RunInfo> : api<RunInfo>)(`/kosular/${runId}`)
    if (gone) return
    loaded = info
    pageName.current = info.code
    if (info.planState === 'taslak' || info.planState === 'onaylandi') {
      const data = await (known ? quietApi : api)<{
        plan: RunStrategy | null
        base: RunStrategy | null
        previous: RunStrategy | null
      }>(`/kosular/${runId}/plan`)
      plan = data.plan
      // Sürümleri olmayan eski koşuda Argus'un hâli açılıştaki plan sayılır.
      base = data.base ?? (data.plan ? (JSON.parse(JSON.stringify(data.plan)) as RunStrategy) : null)
      previous = data.previous
      lastSaved = JSON.stringify(plan)
    }
  }

  // Bölümler kartı: üst çubuk, başlık ve adım şeridinin altına ilk değen bölüm seçilidir; sayfa sonunda son bölüm.
  function spy() {
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-section]')]
    if (!nodes.length) return
    let current = nodes[0]!.dataset.section!
    for (const node of nodes) if (node.getBoundingClientRect().top < 240) current = node.dataset.section!
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = nodes.at(-1)!.dataset.section!
    activeSection = current
  }

  let gone = false
  onDestroy(() => {
    gone = true
    clearTimeout(saveTimer)
  })
  onMount(() => {
    load().catch((e: unknown) => notify.error('Plan okunamadı', e instanceof Error ? e.message : String(e)))
    window.addEventListener('scroll', spy, { passive: true })
    return () => window.removeEventListener('scroll', spy)
  })

  // Argus planı yazarken koşu canlı güncellenir; taslak olunca plan okunur.
  let lastState: string | null = null
  $effect(() => {
    const now = planState
    untrack(() => {
      if (lastState && now !== lastState && now === 'taslak') void load()
      lastState = now
    })
  })

  // Elle düzenleme kendiliğinden kaydedilir (yazmayı bıraktıktan 700 ms sonra).
  let lastSaved = ''
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  $effect(() => {
    const snapshot = JSON.stringify(plan)
    if (!editable) return
    untrack(() => {
      if (snapshot === lastSaved) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        lastSaved = snapshot
        void api(`/kosular/${runId}/plan`, { method: 'PUT', body: JSON.stringify({ plan: JSON.parse(snapshot) }) }).catch(
          (e: unknown) => notify.error('Plan kaydedilemedi', e instanceof Error ? e.message : String(e)),
        )
      }, 700)
    })
  })

  function setIncluded(item: StrategyItem, on: boolean) {
    if (on) delete item.excluded
    else item.excluded = true
  }

  function setAllIncluded(on: boolean) {
    for (const item of plan?.items ?? []) setIncluded(item, on)
  }

  async function addItem() {
    if (!plan) return
    plan.items.push({ title: '', goal: '', source: 'tanim', page: null, fullScan: false, independent: false })
    openItem = plan.items.length - 1
    await tick()
    document.getElementById(`vaka-${openItem}-baslik`)?.focus()
  }

  async function openScenario(index: number | null) {
    const parts = index === null || !plan ? { name: '', expected: '', issue: '' } : scenarioParts(plan.scenarios[index]!)
    draft = { ...parts, index, submitted: false }
    await tick()
    document.getElementById('senaryo-durum')?.focus()
  }

  // Durum ve Ne olmalı zorunludur; Bulgu sayılır boş kalabilir. Kayıtta üç alan planlayıcının kalıbında tek metne döner.
  function saveScenario() {
    if (!draft || !plan) return
    draft.submitted = true
    if (!draft.name.trim()) return document.getElementById('senaryo-durum')?.focus()
    if (!draft.expected.trim()) return document.getElementById('senaryo-beklenen')?.focus()
    const text = scenarioText(draft)
    if (draft.index === null) plan.scenarios.push(text)
    else plan.scenarios[draft.index] = text
    draft = null
  }

  function scenarioKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') draft = null
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveScenario()
    }
  }

  // Elle değişiklik varsa önce pencere: düzenletmede bunlar bırakılır (Argus kendi son yazdığı plandan yeniden yazar).
  function revise() {
    requestSubmitted = true
    if (!request.trim()) return document.getElementById('plan-istek')?.focus()
    if (manualChanges.length) confirmRevise = true
    else void sendRevision()
  }

  async function sendRevision() {
    confirmRevise = false
    busy = true
    try {
      clearTimeout(saveTimer)
      loaded = await post<RunInfo>(`/kosular/${runId}/plan/duzenle`, { mesaj: request.trim() })
      request = ''
      requestSubmitted = false
    } catch (e) {
      notify.error('Plan düzenletilemedi', e instanceof Error ? e.message : String(e))
    } finally {
      busy = false
    }
  }

  async function approve() {
    if (!editable) {
      return notify.error(
        'Plan onaylanamaz',
        drafting ? 'Argus planı yazıyor; bitince onaylayabilirsin.' : 'Bu koşunun planı onay beklemiyor.',
      )
    }
    approveSubmitted = true
    if (planErrors.length) {
      // Başlığı boş vaka kapalı satırdaysa alanı görünsün diye açılır.
      const first = planErrors.find((e) => e.id.startsWith('vaka-') && e.id !== 'vaka-ekle')
      if (first) openItem = Number(first.id.split('-')[1])
      await tick()
      return formErrors?.focusFirst()
    }
    busy = true
    try {
      clearTimeout(saveTimer)
      await post<RunInfo>(`/kosular/${runId}/plan/onayla`, { plan })
      go(`/monitor/${runId}`)
    } catch (e) {
      notify.error('Plan onaylanamadı', e instanceof Error ? e.message : String(e))
      busy = false
    }
  }
</script>

<!-- Senaryo formu: tablonun sütunlarıyla hizalı üç alan (Durum · Ne olmalı · Bulgu sayılır); sağda belirgin Ekle /
     Kaydet ve Vazgeç, alanlarla aynı yükseklikte. Enter kaydeder, Esc vazgeçer, Shift+Enter alt satır. -->
{#snippet scenarioForm()}
  {#if draft}
    {@const fields = [
      { id: 'senaryo-durum', key: 'name', label: 'Durum', hint: 'Ör. Plan onayı', missing: draft.submitted && !draft.name.trim() },
      { id: 'senaryo-beklenen', key: 'expected', label: 'Ne olmalı', hint: 'Doğru davranış', missing: draft.submitted && !draft.expected.trim() },
      { id: 'senaryo-bulgu', key: 'issue', label: 'Bulgu sayılır', hint: 'Ne olursa bulgu', missing: false },
    ] as const}
    <div class="grid gap-2 bg-[#f5f9ff] px-3 py-3 sm:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_120px] sm:gap-0 sm:px-0">
      {#each fields as field (field.id)}
        <div class="grid content-start gap-1 sm:pl-3">
          <textarea
            id={field.id}
            bind:value={draft[field.key]}
            onkeydown={scenarioKeys}
            rows="1"
            aria-label={field.label}
            aria-invalid={field.missing ? true : undefined}
            placeholder={field.hint}
            class="border-input focus-visible:border-ring focus-visible:ring-ring/15 aria-invalid:border-destructive block min-h-9 w-full resize-none rounded-lg border bg-white px-3 py-[5px] text-[13px] leading-6 outline-none [field-sizing:content] focus-visible:ring-2"
          ></textarea>
          {#if field.missing}<span class="text-destructive text-xs">{field.label} yazılmalı.</span>{/if}
        </div>
      {/each}
      <div class="flex items-start justify-end gap-1 sm:px-2">
        <Button class="h-9" onclick={saveScenario}>{draft.index === null ? 'Ekle' : 'Kaydet'}</Button>
        <button type="button" title="Vazgeç" aria-label="Vazgeç" class={cn(ICON_BTN, 'size-9')} onclick={() => (draft = null)}
          ><Icon name="close" class="size-4" /></button
        >
      </div>
    </div>
  {/if}
{/snippet}

{#snippet changeBadge(kind: ChangeKind)}
  {#if kind !== 'ayni'}
    <span
      class={cn(
        'inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11.5px] font-semibold whitespace-nowrap',
        CHANGE_BADGE[kind].tone,
      )}>{CHANGE_BADGE[kind].label}</span
    >
  {/if}
{/snippet}

<!-- Argus'un düzenletmede değiştirdiği metin: "Önceki" salt okunur, altında "Mevcut" düzenlenebilir alan; iki blok aynı
     etiket ve aralıkla, kutular aynı dolguyla. -->
{#snippet revisedText(previousText: string | null, label: string, field: Snippet)}
  {#if previousText !== null}
    <div class="grid gap-1.5">
      <span class="text-xs font-semibold text-[#667085]">Önceki</span>
      <p
        class="rounded-lg border bg-[#f9fafb] px-3 py-2 text-[13.5px] leading-6 break-words whitespace-pre-line text-[#667085]"
        aria-label={`Önceki ${label}`}
      >
        {previousText}
      </p>
    </div>
    <div class="grid gap-1.5">
      <span class="text-xs font-semibold text-[#344054]">Mevcut</span>
      {@render field()}
    </div>
  {:else}
    {@render field()}
  {/if}
{/snippet}

{#snippet heading(title: string, description: string)}
  <div>
    <h2 class="text-base leading-[22px] font-semibold">{title}</h2>
    <p class="text-muted-foreground text-[13px] leading-5">{description}</p>
  </div>
{/snippet}

<Page
  title={run ? `${run.code} · Plan` : 'Plan'}
  description={viewOnly
    ? 'Onaylanan plan; koşu bu planla yürür ve plan artık değiştirilemez'
    : "Planı gözden geçir, elle ya da Argus'a düzenlet; onaylayınca koşu başlar"}
>
  {#snippet actions()}
    {#if viewOnly}
      <Button href={`#/monitor/${runId}`}>Sıradaki: Koşu</Button>
    {:else}
      <Button disabled={busy} onclick={approve}><Icon name="mediaPlay" />Planı onayla ve koşuyu başlat</Button>
    {/if}
  {/snippet}
  {#snippet subheader()}<RunSteps {run} current="plan" />{/snippet}

  {#if run && !planState}
    <section class="bg-card grid place-items-center gap-2 rounded-xl border px-6 py-16 text-center">
      <h2 class="text-base font-semibold">Bu koşu plan onayı olmadan başlatıldı</h2>
      <p class="text-muted-foreground max-w-[60ch] text-[13.5px] leading-6">
        Plan adımından önce başlatılan ve devam koşularında plan koşunun içinde yazılır; Koşu adımında izlenir.
      </p>
      <Button variant="outline" href={`#/monitor/${run.id}`}>Koşuya git</Button>
    </section>
  {:else if !run || drafting || (planState === 'taslak' && !plan)}
    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div class="min-w-0"><PlanProgress {runId} {run} /></div>
      {#if run}
        <aside class="lg:sticky lg:top-[212px]">
          <RunSummary
            {run}
            code={run.code}
            project={run.project}
            application={run.application}
            environment={run.environment}
          />
        </aside>
      {/if}
    </div>
  {:else if plan}
    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">

      <div class="grid min-w-0 gap-4">
        {#if !viewOnly}
        <!-- Planı düzenlet: planın üstünde kendi kartı. Girdi alanı Yeni koşu'dakiyle aynı biçimdedir; gönderme düğmesi
             kartın başlığının sağında ve başlıkla aynı adı taşır ("Planı düzenlet"). -->
        <section class="grid gap-3.5 rounded-xl border border-[#cce0ff] bg-gradient-to-b from-[#f5f9ff] to-white p-6">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              {@render heading(
                'Planı düzenlet',
                'Ne değişsin ya da ne test edilsin, anlat; Argus planı isteğine göre baştan yazar ve tekrar onayına sunar. Aşağıda elle yaptığın değişiklikler düzenletmede korunmaz.',
              )}
            </div>
            <Button disabled={busy || !editable} onclick={revise}>Planı düzenlet</Button>
          </div>
          <div>
            <div
              class={cn(
                'border-input focus-within:border-ring focus-within:ring-ring/15 rounded-lg border bg-white transition-colors focus-within:ring-2',
                requestErrors.length && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/15',
              )}
              data-field="plan-istek"
            >
              <textarea
                id="plan-istek"
                bind:value={request}
                rows="3"
                disabled={!editable}
                aria-label="Planda ne değişsin?"
                aria-invalid={requestErrors.length ? true : undefined}
                aria-describedby={requestErrors.length ? 'plan-istek-hata' : undefined}
                placeholder="Planda ne değişsin? Ör. Ekran vakalarını çıkar, itiraz sürecini ekle; karne hesabını iki ayrı vakaya böl."
                class="placeholder:text-placeholder block max-h-[30svh] min-h-24 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none [field-sizing:content]"
              ></textarea>
              <div class="flex items-center justify-end px-2 pb-2">
                <Dictation value={request} onupdate={(text) => (request = text)} />
              </div>
            </div>
            {#if errorOf(requestErrors, 'plan-istek')}
              <p id="plan-istek-hata" class="text-destructive mt-1.5 text-xs">{errorOf(requestErrors, 'plan-istek')}</p>
            {/if}
          </div>
        </section>
        {/if}

          {#if planErrors.length}<FormErrors bind:this={formErrors} errors={planErrors} />{/if}

          <section id="bolum-kapsam" data-section="kapsam" class={SECTION}>
            {@render heading(
              'Kapsam',
              viewOnly
                ? "Argus'un isteğinden anladığı: neyi, hangi sırayla test ediyor."
                : "Argus'un isteğinden anladığı: neyi, hangi sırayla test edecek. Gerekirse düzelt.",
            )}
            {#snippet scopeField()}
              {#if viewOnly}
                <p class={READ}>{plan!.understood}</p>
              {:else}
                <textarea bind:value={plan!.understood} readonly={!editable} rows="2" aria-label="Kapsam" class={FIELD}
                ></textarea>
              {/if}
            {/snippet}
            {@render revisedText(diff?.understood ?? null, 'kapsam', scopeField)}
          </section>

          <section id="bolum-vakalar" data-section="vakalar" class={SECTION}>
            {@render heading(
              'Vakalar',
              viewOnly
                ? 'Koşuda tek tek yürütülen test işleri. Satıra tıklayınca ayrıntısı açılır.'
                : 'Koşuda tek tek yürütülecek test işleri. İşaretli olanlar koşuya dahildir; işareti kaldırılan vaka yürütülmez.',
            )}
            <div class="overflow-hidden rounded-[10px] border">
              <div class="flex flex-wrap items-center justify-between gap-3 bg-[#f9fafb] px-4 py-2.5 text-[13px] text-[#475467]">
                {#if viewOnly}
                  <span><b class="font-semibold text-[#101828] tabular-nums">{plan.items.length}</b> vaka koşuda</span>
                {:else}
                <label class="inline-flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    class="accent-brand size-4"
                    checked={includedCount === plan.items.length}
                    indeterminate={includedCount > 0 && includedCount < plan.items.length}
                    disabled={!editable}
                    onchange={(e) => setAllIncluded(e.currentTarget.checked)}
                  />
                  <span
                    ><b class="font-semibold text-[#101828] tabular-nums">{includedCount} / {plan.items.length}</b> vaka koşuya
                    dahil</span
                  >
                </label>
                {/if}
                {#if !viewOnly && includedCount < plan.items.length}
                  <span class="text-[12.5px] text-[#b54708]">İşaretsiz {plan.items.length - includedCount} vaka yürütülmez</span>
                {/if}
              </div>
              {#each plan.items as item, i (i)}
                {@const change = diff?.items[i]}
                <div
                  class={cn('border-t', item.excluded ? 'bg-[#f9fafb]' : change ? CHANGE_ROW[change.kind] : 'bg-white')}
                  data-field={`vaka-${i}-baslik`}
                >
                  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
                  <div
                    class={cn(
                      'grid cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-[#fafbfc]',
                      viewOnly ? 'grid-cols-[22px_minmax(0,1fr)_auto_18px]' : 'grid-cols-[16px_22px_minmax(0,1fr)_auto_18px]',
                    )}
                    onclick={(e) => {
                      if ((e.target as HTMLElement).closest('input')) return
                      openItem = openItem === i ? null : i
                    }}
                  >
                    {#if !viewOnly}
                      <input
                        type="checkbox"
                        class="accent-brand size-4"
                        checked={!item.excluded}
                        disabled={!editable}
                        aria-label={`Vaka ${i + 1} koşuya dahil`}
                        onchange={(e) => setIncluded(item, e.currentTarget.checked)}
                      />
                    {/if}
                    <span class="font-mono text-[11.5px] text-[#98a2b3] tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    <span class={cn('min-w-0', item.excluded && 'opacity-55')}>
                      <span class="flex min-w-0 items-center gap-2">
                        {#if change && change.kind !== 'ayni'}{@render changeBadge(change.kind)}{/if}
                        <span class="truncate text-[13.5px] font-semibold">{item.title || 'Başlıksız vaka'}</span>
                      </span>
                      {#if change?.before}
                        <!-- Değişen vaka: önceki hâli üstte soluk, yeni amacı altta. -->
                        <span class="mt-1 block truncate text-[12px] text-[#98a2b3]"
                          ><span class="font-semibold">Önceki:</span>
                          {change.before.title === item.title ? '' : `${change.before.title} · `}{change.before.goal}</span
                        >
                      {/if}
                      <span class="block truncate text-[12.5px] text-[#475467]">{item.goal || 'Amaç yazılmadı'}</span>
                    </span>
                    <span class="hidden items-center gap-2 sm:flex">
                      {#if item.page}<span class="font-mono text-xs text-[#98a2b3]">{item.page}</span>{/if}
                      <span
                        class={cn('inline-flex h-[22px] items-center rounded-md border px-2 text-[11.5px] font-medium', SOURCE_TONE[item.source])}
                        >{SOURCE_LABEL[item.source]}</span
                      >
                    </span>
                    <Icon
                      name="chevronRight"
                      class={cn('size-[18px] text-[#98a2b3] transition-transform', openItem === i && 'rotate-90')}
                    />
                  </div>
                  {#if openItem === i && viewOnly}
                    <!-- Salt okuma: vakanın tamamı; düzenleme alanı yok. -->
                    <div class="grid gap-2.5 pt-1 pr-4 pb-4 pl-[50px]">
                      <p class={READ}>{item.goal || 'Amaç yazılmadı'}</p>
                      <div class="flex flex-wrap items-center gap-2 text-xs text-[#475467]">
                        <span
                          class={cn('inline-flex h-[22px] items-center rounded-md border px-2 text-[11.5px] font-medium', SOURCE_TONE[item.source])}
                          >{SOURCE_LABEL[item.source]}</span
                        >
                        {#if item.page}<span class="font-mono text-[#98a2b3]">{item.page}</span>{/if}
                        <span>{SOURCE_HELP[item.source]}</span>
                      </div>
                    </div>
                  {:else if openItem === i}
                    <div class="grid gap-3 pt-1 pr-4 pb-4 pl-[66px]">
                      <label class="grid gap-1.5 text-[12.5px] font-medium text-[#344054]"
                        >Başlık
                        <input
                          id={`vaka-${i}-baslik`}
                          bind:value={item.title}
                          readonly={!editable}
                          placeholder="Vakanın başlığı"
                          aria-invalid={errorOf(planErrors, `vaka-${i}-baslik`) ? true : undefined}
                          class="border-input focus-visible:border-ring aria-invalid:border-destructive h-9 w-full rounded-lg border px-3 text-sm font-normal text-[#101828] outline-none"
                        />
                      </label>
                      <label class="grid gap-1.5 text-[12.5px] font-medium text-[#344054]"
                        >Amaç
                        <textarea
                          bind:value={item.goal}
                          readonly={!editable}
                          rows="2"
                          placeholder="Ne denenecek, ne beklenir?"
                          class={cn(FIELD, 'font-normal text-[#101828]')}
                        ></textarea>
                      </label>
                      <div class="flex flex-wrap items-end gap-4">
                        <div class="grid gap-1.5">
                          <span class="text-[12.5px] font-medium text-[#344054]">Nasıl test edilir</span>
                          <div class="flex overflow-hidden rounded-lg border" role="radiogroup" aria-label="Nasıl test edilir">
                            {#each SOURCES as source (source)}
                              <button
                                type="button"
                                role="radio"
                                aria-checked={item.source === source}
                                title={SOURCE_HELP[source]}
                                disabled={!editable}
                                onclick={() => {
                                  item.source = source
                                  if (source === 'tanim') item.page = null
                                }}
                                class={cn(
                                  'h-8 px-3 text-[12.5px] font-medium transition-colors not-first:border-l',
                                  item.source === source ? 'bg-brand-soft text-brand-strong' : 'hover:bg-secondary',
                                )}>{SOURCE_LABEL[source]}</button
                              >
                            {/each}
                          </div>
                        </div>
                        {#if item.source !== 'tanim'}
                          <label class="grid min-w-[220px] flex-1 gap-1.5 text-[12.5px] font-medium text-[#344054]"
                            >Sayfa
                            <input
                              value={item.page ?? ''}
                              oninput={(e) => (item.page = e.currentTarget.value.trim() || null)}
                              readonly={!editable}
                              placeholder="ör. performans-donemler"
                              class="border-input focus-visible:border-ring h-8 rounded-lg border px-3 font-mono text-[12.5px] font-normal outline-none"
                            />
                          </label>
                        {/if}
                      </div>
                      <!-- Seçili türün ne yaptığı: rozet tek başına söylemez. -->
                      <p class="-mt-1 flex items-start gap-1.5 text-xs leading-[18px] text-[#475467]">
                        <Icon name="info" class="mt-px size-3.5 shrink-0 text-[#98a2b3]" /><span
                          ><b class="font-semibold text-[#344054]">{SOURCE_LABEL[item.source]}:</b>
                          {SOURCE_HELP[item.source]}</span
                        >
                      </p>
                      {#if editable}
                        <div class="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            class="text-destructive hover:text-destructive"
                            onclick={() => {
                              plan!.items.splice(i, 1)
                              openItem = null
                            }}><Icon name="opDelete" />Vakayı sil</Button
                          >
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
              {#if editable}
                <button id="vaka-ekle" type="button" class={ADD_ROW} onclick={addItem}
                  ><Icon name="add" class="size-4" />Vaka ekle</button
                >
              {/if}
            </div>
          </section>

          <section id="bolum-senaryolar" data-section="senaryolar" class={SECTION}>
            {@render heading('Senaryolar', 'Vakalarda aranacak durumlar: ne olmalı ve hangi sonuç bulgu sayılır.')}
            <div class="overflow-hidden rounded-[10px] border">
              <div
                class="hidden grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_120px] bg-[#f9fafb] text-[11.5px] font-semibold tracking-[0.04em] text-[#98a2b3] uppercase sm:grid"
              >
                <span class="px-3 py-2">Durum</span><span class="px-3 py-2">Ne olmalı</span><span class="px-3 py-2"
                  >Bulgu sayılır</span
                ><span></span>
              </div>
              {#each plan.scenarios as scenario, i (i)}
                {@const parts = scenarioParts(scenario)}
                {@const change = diff?.scenarios[i]}
                <div class={cn('group border-t text-[13px] leading-normal', change && CHANGE_ROW[change.kind])}>
                  {#if draft?.index === i}
                    {@render scenarioForm()}
                  {:else}
                    <div class="grid sm:grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_120px]">
                      <span class="px-3 pt-2.5 font-semibold sm:pb-2.5">{parts.name}</span>
                      <span class="px-3 py-1 text-[#344054] sm:py-2.5">{parts.expected}</span>
                      <span class="px-3 pb-2.5 text-[#344054] sm:pt-2.5">{parts.issue}</span>
                      {#if editable}
                        <span class="flex items-start justify-end px-2 py-1.5">
                          {#if change && change.kind !== 'ayni'}<span class="mt-1 group-focus-within:hidden group-hover:hidden"
                              >{@render changeBadge(change.kind)}</span
                            >{/if}
                          <span class="hidden gap-0.5 group-focus-within:flex group-hover:flex">
                          <button
                            type="button"
                            title="Düzenle"
                            aria-label={`Senaryo ${i + 1}'i düzenle`}
                            class={ICON_BTN}
                            onclick={() => openScenario(i)}><Icon name="opEdit" class="size-4" /></button
                          >
                          <button
                            type="button"
                            title="Sil"
                            aria-label={`Senaryo ${i + 1}'i sil`}
                            class={ICON_BTN}
                            onclick={() => {
                              plan!.scenarios.splice(i, 1)
                              draft = null
                            }}><Icon name="opDelete" class="size-4" /></button
                          >
                          </span>
                        </span>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
              {#if draft && draft.index === null}
                <div class="border-t">{@render scenarioForm()}</div>
              {:else if editable}
                <button type="button" class={ADD_ROW} onclick={() => openScenario(null)}
                  ><Icon name="add" class="size-4" />Senaryo ekle</button
                >
              {/if}
            </div>
          </section>

          <section id="bolum-bitis" data-section="bitis" class={SECTION}>
            {@render heading(
              'Bitiş ölçütü',
              'Koşu ne olunca tamamlanmış sayılır. Argus kapsam raporunu buna göre yazar; eksik kalan madde raporda "test edilemedi" olarak görünür.',
            )}
            {#snippet doneField()}
              {#if viewOnly}
                <p class={READ}>{plan!.doneWhen}</p>
              {:else}
                <textarea bind:value={plan!.doneWhen} readonly={!editable} rows="2" aria-label="Bitiş ölçütü" class={FIELD}
                ></textarea>
              {/if}
            {/snippet}
            {@render revisedText(diff?.doneWhen ?? null, 'bitiş ölçütü', doneField)}
          </section>

          {#each NOTES as note (note.key)}
            <section id={`bolum-${note.id}`} data-section={note.id} class={SECTION}>
              {@render heading(note.title, note.description)}
              {#if plan[note.key].length}
                <ol class="grid gap-1.5">
                  {#each plan[note.key] as _, i (i)}
                    {@const change = diff?.[note.key][i]}
                    <li class={cn('group flex items-start gap-2 rounded-lg border px-2.5 py-1.5', change && CHANGE_ROW[change.kind])}>
                      {#if viewOnly}
                        <p class="min-w-0 flex-1 py-1 text-[13px] leading-normal text-[#344054]">{plan[note.key][i]}</p>
                      {:else}
                      <textarea
                        bind:value={plan[note.key][i]}
                        readonly={!editable}
                        rows="1"
                        aria-label={`${note.title} ${i + 1}`}
                        class="block min-w-0 flex-1 resize-none bg-transparent py-1 text-[13px] leading-normal text-[#344054] outline-none [field-sizing:content]"
                      ></textarea>
                      {/if}
                      {#if change && change.kind !== 'ayni'}<span class="mt-1 shrink-0">{@render changeBadge(change.kind)}</span>{/if}
                      {#if editable}
                        <button
                          type="button"
                          title="Sil"
                          aria-label={`${note.title} ${i + 1}'i sil`}
                          class={cn(ICON_BTN, 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100')}
                          onclick={() => plan![note.key].splice(i, 1)}><Icon name="opDelete" class="size-4" /></button
                        >
                      {/if}
                    </li>
                  {/each}
                </ol>
              {:else}
                <p class="text-[13px] text-[#98a2b3]">{note.empty}</p>
              {/if}
            </section>
          {/each}
      </div>
      <!-- Sağ sütun Yeni koşu ve plan hazırlığıyla aynıdır: Koşu kartı; altında planın Bölümler kartı. -->
      <aside class="grid gap-4 lg:sticky lg:top-[212px]">
        {#if run}
          <RunSummary
            {run}
            code={run.code}
            project={run.project}
            application={run.application}
            environment={run.environment}
          />
        {/if}
        <!-- Bölümler kartı (Şikayet / DİF kayıt sayfasındaki sol gezinme kartının kalıbı): yapışkan; numara, ad ve durum;
             kaydırdıkça bulunulan bölüm seçili görünür, tıklayınca o bölüme kayar. -->
        <nav aria-label="Bölümler" class="bg-card rounded-xl border p-2.5">
          <h2 class="px-2.5 pt-1.5 pb-2.5 text-sm font-semibold">Bölümler</h2>
          {#each sections as section, i (section.id)}
            <a
              href={`#bolum-${section.id}`}
              onclick={(e) => {
                e.preventDefault()
                document.getElementById(`bolum-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              aria-current={activeSection === section.id ? 'location' : undefined}
              class={cn(
                'grid grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                activeSection === section.id ? 'bg-brand-soft' : 'hover:bg-secondary',
              )}
            >
              <span
                class={cn(
                  'grid size-6 place-items-center rounded-full text-[11.5px] font-semibold',
                  activeSection === section.id ? 'bg-brand text-white' : 'bg-white text-[#475467] shadow-[inset_0_0_0_1.5px_#d0d5dd]',
                )}>{i + 1}</span
              >
              <span class="min-w-0">
                <span
                  class={cn(
                    'block text-[13.5px] leading-5',
                    activeSection === section.id ? 'text-brand-strong font-semibold' : 'font-medium text-[#101828]',
                  )}>{section.title}</span
                >
                <span class={cn('block truncate text-xs leading-[17px]', section.warn ? 'text-[#b54708]' : 'text-[#475467]')}
                  >{section.detail}</span
                >
              </span>
            </a>
          {/each}
        </nav>
      </aside>
    </div>
  {/if}

  <Modal
    bind:open={confirmRevise}
    title="Elle yaptığın değişiklikler gidecek"
    description="Argus planı kendi yazdığı son hâlden, isteğine göre yeniden yazar. Plana elle yaptığın şu değişiklikler bırakılır:"
  >
    <ul class="grid gap-1.5 text-[13.5px] leading-5 text-[#344054]">
      {#each manualChanges as line, i (i)}
        <li class="flex items-start gap-2.5">
          <span class="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#98a2b3]"></span>{line}
        </li>
      {/each}
    </ul>
    {#snippet footer()}
      <Button variant="outline" onclick={() => (confirmRevise = false)}>Vazgeç</Button>
      <Button onclick={sendRevision}>Değişiklikleri bırak ve düzenlet</Button>
    {/snippet}
  </Modal>
</Page>
