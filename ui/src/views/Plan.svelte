<script lang="ts">
  import { SCOPE_LABELS, type ItemSource, type RunInfo, type RunStrategy } from '@argus/shared'
  import { onDestroy, onMount, untrack } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Dictation from '$lib/components/form/Dictation.svelte'
  import Field from '$lib/components/form/Field.svelte'
  import FormErrors from '$lib/components/form/FormErrors.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import PlanProgress from '$lib/components/run/PlanProgress.svelte'
  import RunSummary from '$lib/components/run/RunSummary.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, quietApi } from '$lib/api'
  import { notify } from '$lib/notify.svelte'
  import { pageName } from '$lib/page-name.svelte'
  import { go } from '$lib/router.svelte'
  import { live } from '$lib/stream.svelte'
  import { cn } from '$lib/utils'
  import { errorOf, validateFields, type FieldError } from '$lib/validation'

  /**
   * Plan adımı: Yeni koşu başlatılınca Argus isteği, hafızayı ve kuralları okuyup (gerekirse tanımlara bakarak) koşunun
   * planını yazar ve tarayıcıyı açmadan durur. İnsan planı burada düzenler: kapsam, senaryolar, vakalar (ekle, sil,
   * değiştir) ve tamam sayılma ölçütü; değişiklikler kendiliğinden kaydedilir. "Argus'a düzenlet" isteği (yazarak ya da
   * konuşarak) planı yeniden yazdırır. "Planı onayla ve başlat" koşuyu bu planla başlatır; planlayıcı yeniden çağrılmaz.
   * Argus yazarken plan hazırlığı çizelgesi görünür (`PlanProgress`); plan hazır olunca sayfa canlı akıştan kendiliğinden
   * güncellenir.
   */
  let { runId }: { runId: string } = $props()

  const SOURCES: Array<{ id: ItemSource; label: string }> = [
    { id: 'ekran', label: 'Ekranda' },
    { id: 'tanim', label: 'Tanımda' },
    { id: 'ikisi', label: 'İkisinde' },
  ]

  let loaded = $state<RunInfo | null>(null)
  let plan = $state<RunStrategy | null>(null)
  let request = $state('')
  let requestSubmitted = $state(false)
  let approveSubmitted = $state(false)
  let busy = $state(false)
  let formErrors = $state<ReturnType<typeof FormErrors> | null>(null)


  const run = $derived(loaded ? (live.runs[loaded.id] ?? loaded) : null)
  const planState = $derived(run?.planState ?? null)
  const drafting = $derived(planState === 'hazirlaniyor' || planState === 'duzenleniyor')
  const editable = $derived(planState === 'taslak' && !!plan)
  const requestErrors = $derived(
    requestSubmitted
      ? validateFields([{ id: 'plan-istek', label: 'İstek', value: request, required: "Argus'tan ne istediğini yaz." }])
      : [],
  )
  const planErrors = $derived<FieldError[]>(
    approveSubmitted && plan
      ? [
          ...(plan.items.some((i) => i.title.trim())
            ? []
            : [{ id: 'vaka-ekle', label: 'Vakalar', message: 'Planda en az bir vaka olmalı.' }]),
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
      const data = await (known ? quietApi : api)<{ plan: RunStrategy | null }>(`/kosular/${runId}/plan`)
      plan = data.plan
      lastSaved = JSON.stringify(plan)
    }
  }

  let gone = false
  onDestroy(() => {
    gone = true
    clearTimeout(saveTimer)
  })
  onMount(() => {
    load().catch((e: unknown) => notify.error('Plan okunamadı', e instanceof Error ? e.message : String(e)))
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

  function addItem() {
    if (!plan) return
    plan.items.push({ title: '', goal: '', source: 'ekran', page: null, fullScan: false, independent: false })
    queueMicrotask(() => document.getElementById(`vaka-${plan!.items.length - 1}-baslik`)?.focus())
  }

  async function revise() {
    requestSubmitted = true
    if (!request.trim()) return document.getElementById('plan-istek')?.focus()
    busy = true
    try {
      clearTimeout(saveTimer)
      loaded = await post<RunInfo>(`/kosular/${runId}/plan/duzenle`, { mesaj: request.trim(), plan })
      request = ''
      requestSubmitted = false
      notify.info('Plan yeniden yazılıyor', 'Argus isteğine göre planı yeniden hazırlıyor.')
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
    if (planErrors.length) return formErrors?.focusFirst()
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

{#snippet heading(title: string, description: string)}
  <div>
    <h2 class="text-base leading-[22px] font-semibold">{title}</h2>
    <p class="text-muted-foreground text-[13px]">{description}</p>
  </div>
{/snippet}

<Page
  title={run ? `${run.code} · Plan` : 'Plan'}
  description="Argus koşunun planını yazar; düzenle ya da Argus'a düzenlet, onaylayınca koşu başlar"
>
  {#snippet actions()}
    <Button disabled={busy} onclick={approve}><Icon name="mediaPlay" />Planı onayla ve başlat</Button>
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
        <RunSummary
          {run}
          code={run.code}
          project={run.project}
          application={run.application}
          environment={run.environment}
        />
      {/if}
    </div>
  {:else if plan}
    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div class="bg-card min-w-0 rounded-xl border">
        <div class="grid gap-7 p-6">
          <FormErrors bind:this={formErrors} errors={planErrors} />

          <section class="grid gap-3">
            {@render heading('Kapsam', 'Argus isteği böyle anladı; gerekirse düzelt.')}
            <textarea
              bind:value={plan.understood}
              readonly={!editable}
              rows="2"
              aria-label="Kapsam"
              class="border-input focus-visible:border-ring focus-visible:ring-ring/15 block w-full resize-none rounded-lg border px-3 py-2 text-sm leading-6 outline-none [field-sizing:content] focus-visible:ring-2"
            ></textarea>
          </section>

          <section class="grid gap-3">
            {@render heading('Vakalar', 'Koşu bu vakaları sırayla dener. Vaka ekleyebilir, silebilir, değiştirebilirsin.')}
            <ol class="grid gap-3">
              {#each plan.items as item, i (i)}
                <li class="grid gap-3 rounded-lg border p-4" data-field={`vaka-${i}-baslik`}>
                  <div class="flex items-start gap-3">
                    <span
                      class="bg-brand-soft text-brand-strong mt-1.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold"
                      >{i + 1}</span
                    >
                    <div class="grid min-w-0 flex-1 gap-2">
                      <input
                        id={`vaka-${i}-baslik`}
                        bind:value={item.title}
                        readonly={!editable}
                        placeholder="Vakanın başlığı"
                        aria-label={`Vaka ${i + 1} başlığı`}
                        aria-invalid={errorOf(planErrors, `vaka-${i}-baslik`) ? true : undefined}
                        class="border-input focus-visible:border-ring aria-invalid:border-destructive h-9 w-full rounded-lg border px-3 text-sm font-medium outline-none"
                      />
                      <textarea
                        bind:value={item.goal}
                        readonly={!editable}
                        rows="2"
                        placeholder="Ne denenecek, ne beklenir?"
                        aria-label={`Vaka ${i + 1} amacı`}
                        class="border-input focus-visible:border-ring block w-full resize-none rounded-lg border px-3 py-2 text-[13.5px] leading-6 outline-none [field-sizing:content]"
                      ></textarea>
                      <div class="flex flex-wrap items-center gap-2 text-[13px]">
                        <span class="text-muted-foreground">Nerede test edilir</span>
                        <div class="flex overflow-hidden rounded-lg border" role="radiogroup" aria-label="Kaynak">
                          {#each SOURCES as source (source.id)}
                            <button
                              type="button"
                              role="radio"
                              aria-checked={item.source === source.id}
                              disabled={!editable}
                              onclick={() => {
                                item.source = source.id
                                if (source.id === 'tanim') item.page = null
                              }}
                              class={cn(
                                'h-8 px-3 text-[12.5px] font-medium transition-colors not-first:border-l',
                                item.source === source.id ? 'bg-brand-soft text-brand-strong' : 'hover:bg-secondary',
                              )}>{source.label}</button
                            >
                          {/each}
                        </div>
                        {#if item.source !== 'tanim'}
                          <input
                            value={item.page ?? ''}
                            oninput={(e) => (item.page = e.currentTarget.value.trim() || null)}
                            readonly={!editable}
                            placeholder="Sayfa (ör. performans-donemler)"
                            aria-label={`Vaka ${i + 1} sayfası`}
                            class="border-input focus-visible:border-ring h-8 min-w-[220px] flex-1 rounded-lg border px-3 font-mono text-[12.5px] outline-none"
                          />
                        {/if}
                      </div>
                    </div>
                    {#if editable}
                      <button
                        type="button"
                        aria-label={`Vaka ${i + 1}'i sil`}
                        title="Vakayı sil"
                        onclick={() => plan!.items.splice(i, 1)}
                        class="text-muted-foreground hover:text-destructive hover:bg-secondary grid size-8 shrink-0 place-items-center rounded-lg"
                      >
                        <Icon name="close" class="size-4" />
                      </button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ol>
            {#if editable}
              <div>
                <Button id="vaka-ekle" variant="outline" size="sm" onclick={addItem}><Icon name="add" />Vaka ekle</Button>
              </div>
            {/if}
          </section>

          <section class="grid gap-3">
            {@render heading('Senaryolar', 'Vakaların sınayacağı durumlar ve beklenen davranış.')}
            <ul class="grid gap-2">
              {#each plan.scenarios as _, i (i)}
                <li class="flex items-start gap-2">
                  <span class="text-muted-foreground mt-2 text-[13px] tabular-nums">{i + 1}.</span>
                  <textarea
                    bind:value={plan.scenarios[i]}
                    readonly={!editable}
                    rows="1"
                    aria-label={`Senaryo ${i + 1}`}
                    class="border-input focus-visible:border-ring block min-w-0 flex-1 resize-none rounded-lg border px-3 py-1.5 text-[13.5px] leading-6 outline-none [field-sizing:content]"
                  ></textarea>
                  {#if editable}
                    <button
                      type="button"
                      aria-label={`Senaryo ${i + 1}'i sil`}
                      title="Senaryoyu sil"
                      onclick={() => plan!.scenarios.splice(i, 1)}
                      class="text-muted-foreground hover:text-destructive hover:bg-secondary mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                    >
                      <Icon name="close" class="size-4" />
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if editable}
              <div>
                <Button variant="outline" size="sm" onclick={() => plan!.scenarios.push('')}
                  ><Icon name="add" />Senaryo ekle</Button
                >
              </div>
            {/if}
          </section>

          <section class="grid gap-3">
            {@render heading('Tamam sayılır', 'Kapsam ne olunca test edilmiş sayılır.')}
            <textarea
              bind:value={plan.doneWhen}
              readonly={!editable}
              rows="1"
              aria-label="Tamam sayılır"
              class="border-input focus-visible:border-ring block w-full resize-none rounded-lg border px-3 py-2 text-[13.5px] leading-6 outline-none [field-sizing:content]"
            ></textarea>
          </section>

          {#if plan.known.length || plan.infeasible.length}
            <section class="grid gap-4 border-t pt-6 text-[13.5px] leading-6 text-[#475467]">
              {#if plan.known.length}
                <div>
                  <h3 class="text-sm font-semibold text-[#101828]">Tanımdan bilinenler</h3>
                  <ul class="mt-1 list-disc pl-5">{#each plan.known as k, i (i)}<li>{k}</li>{/each}</ul>
                </div>
              {/if}
              {#if plan.infeasible.length}
                <div>
                  <h3 class="text-sm font-semibold text-[#101828]">Bu koşuda test edilemeyecekler</h3>
                  <ul class="mt-1 list-disc pl-5">{#each plan.infeasible as k, i (i)}<li>{k}</li>{/each}</ul>
                </div>
              {/if}
            </section>
          {/if}
        </div>
      </div>

      <aside class="grid gap-5 lg:sticky lg:top-[148px]">
        <section class="bg-card grid gap-3 rounded-xl border p-5">
          {@render heading("Argus'a düzenlet", 'Ne değişsin? Argus planı isteğine göre yeniden yazar.')}
          <Field label="İstek" for="plan-istek" error={errorOf(requestErrors, 'plan-istek')}>
            <div class="border-input focus-within:border-ring overflow-hidden rounded-lg border">
              <textarea
                id="plan-istek"
                bind:value={request}
                rows="4"
                disabled={!editable}
                aria-invalid={requestErrors.length ? true : undefined}
                aria-describedby={requestErrors.length ? 'plan-istek-hata' : undefined}
                placeholder="Ör. Kalibrasyon aşamasını da ekle; yetki vakasını çıkar."
                class="placeholder:text-placeholder block w-full resize-none bg-transparent px-3 py-2 text-[13.5px] leading-6 outline-none [field-sizing:content]"
              ></textarea>
              <div class="flex justify-end px-2 pb-2">
                <Dictation value={request} onupdate={(text) => (request = text)} />
              </div>
            </div>
          </Field>
          <Button variant="outline" disabled={busy || !editable} onclick={revise}>Planı yeniden yazdır</Button>
        </section>
        <section class="bg-card rounded-xl border p-5">
          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[13px]">
            <dt class="text-muted-foreground">Kapsam türü</dt>
            <dd class="text-right">{SCOPE_LABELS[plan.scope]}</dd>
            <dt class="text-muted-foreground">Vaka</dt>
            <dd class="text-right tabular-nums">{plan.items.length}</dd>
            <dt class="text-muted-foreground">Senaryo</dt>
            <dd class="text-right tabular-nums">{plan.scenarios.length}</dd>
            <dt class="text-muted-foreground">Test yöntemleri</dt>
            <dd class="text-right">{plan.guides.join(', ') || '—'}</dd>
          </dl>
        </section>
      </aside>
    </div>
  {/if}
</Page>
