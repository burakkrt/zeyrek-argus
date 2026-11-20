<script lang="ts">
  import type { Issue, IssueDetail, Proposal, ProposalAction, RunInfo } from '@argus/shared'
  import { onDestroy, onMount } from 'svelte'
  import Modal from '$lib/components/layout/Modal.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, qs } from '$lib/api'
  import { fixPrompt, type FixItem } from '$lib/closing'
  import { SEVERITY } from '$lib/format'
  import { notify } from '$lib/notify.svelte'
  import { pageName } from '$lib/page-name.svelte'
  import { pageLabel } from '$lib/monitor'
  import { closeBlocker, family } from '$lib/review'
  import { live } from '$lib/stream.svelte'

  /**
   * Kapanış: değerlendirmenin çıktıları tek yerde, koşu burada kapatılır.
   * - Düzeltilecekler: seçilen bulgular bir kodlama yapay zekâsına (Claude Code) verilecek tek istemde (`fixPrompt`);
   *   ekibin düzenlediği çözüm "ekibin belirlediği" diye girer. Kopyala düğmesi panoya alır.
   * - Öğrenme önerileri: "Kararlardan öğren" Argus'a kararları okutur (model çağrısı); çıkan kural önerileri insan
   *   kabul etmeden hafızaya girmez. Yanlış gözlem ve kapsam dışı nedenli kararlar öğrenmeye girmez.
   * - Bilerek bırakılanlar: "Bilerek böyle" denen bulgular; sonraki koşularda bulgu sayılmazlar.
   * - Koşuyu kapat: test verisi temizlenir, koşu kapanır. Bekleyen ya da anlaşılmayan karar kalırken kapatılamaz.
   */
  let { runId }: { runId: string } = $props()

  let loaded = $state<RunInfo | null>(null)
  let issues = $state<Issue[]>([])
  let loading = $state(true)
  let selected = $state<Record<string, boolean>>({})
  let details = $state<Record<string, IssueDetail>>({})
  let proposals = $state<Proposal[]>([])
  let learning = $state(false)
  let learned = $state<number | null>(null)
  let confirm = $state(false)
  let closing = $state(false)
  let copied = $state(false)

  const run = $derived(loaded ? (live.runs[loaded.id] ?? loaded) : null)
  const gate = $derived(
    run
      ? {
          ...run,
          continuations: run.continuations.map((c) => ({ ...c, status: live.runs[c.id]?.status ?? c.status })),
        }
      : null,
  )
  const blocker = $derived(gate && !gate.closedAt ? closeBlocker(gate) : null)
  const fixes = $derived(issues.filter((i) => i.status === 'duzeltilecek'))
  const kept = $derived(issues.filter((i) => i.status === 'kabul-edildi'))
  const chosen = $derived(fixes.filter((i) => selected[i.id]))
  const prompt = $derived(
    run
      ? fixPrompt(
          { project: run.project, application: run.application },
          chosen.map((i): FixItem => {
            const report = details[i.id]?.occurrences.find((o) => o.report)?.report ?? null
            return { title: i.title, pages: i.pages.map(pageLabel), fix: i.fix, fixEdited: i.fixEdited, report }
          }),
        )
      : '',
  )

  let gone = false
  onDestroy(() => (gone = true))

  async function load() {
    const opened = await api<RunInfo>(`/kosular/${runId}`)
    const r = opened.options.parentRunId ? await api<RunInfo>(`/kosular/${opened.options.parentRunId}`) : opened
    if (gone) return
    loaded = r
    pageName.current = r.code
    const lists = await Promise.all(
      family(r).map((id) =>
        api<Issue[]>(`/sorunlar${qs({ proje: r.project, uygulama: r.application, kosu: id, bastirilan: 1 })}`),
      ),
    )
    issues = [...new Map(lists.flat().map((i) => [i.id, i])).values()]
    selected = Object.fromEntries(issues.filter((i) => i.status === 'duzeltilecek').map((i) => [i.id, true]))
    // İstemin "nerede / ne oluyor / kabul ölçütleri" satırları bulgunun raporundan gelir.
    const fetched = await Promise.all(
      issues
        .filter((i) => i.status === 'duzeltilecek')
        .map((i) => api<IssueDetail>(`/sorunlar/${i.id}`).catch(() => null)),
    )
    details = Object.fromEntries(fetched.filter((d): d is IssueDetail => !!d).map((d) => [d.id, d]))
    await loadProposals()
  }

  async function loadProposals() {
    if (!loaded) return
    proposals = await api<Proposal[]>(
      `/hafiza/oneriler${qs({ durum: 'bekliyor', proje: loaded.project, uygulama: loaded.application })}`,
    ).catch(() => [])
  }

  onMount(() => {
    load()
      .catch((e: unknown) => notify.error('Koşu okunamadı', e instanceof Error ? e.message : String(e)))
      .finally(() => (loading = false))
  })

  async function copy() {
    if (!chosen.length) return notify.error('Kopyalanacak bulgu yok', 'En az bir düzeltilecek bulgu seç.')
    try {
      await navigator.clipboard.writeText(prompt)
      copied = true
      setTimeout(() => (copied = false), 2000)
    } catch (e) {
      notify.error('Kopyalanamadı', e instanceof Error ? e.message : String(e))
    }
  }

  async function learn() {
    if (!run) return
    learning = true
    try {
      const made = await post<Proposal[]>('/hafiza/ogren', { proje: run.project, uygulama: run.application })
      learned = made.length
      await loadProposals()
    } catch (e) {
      notify.error('Öğrenilemedi', e instanceof Error ? e.message : String(e))
    } finally {
      learning = false
    }
  }

  async function settle(id: string, accept: boolean) {
    try {
      await post(`/hafiza/oneriler/${id}/${accept ? 'kabul' : 'ret'}`, {})
      proposals = proposals.filter((p) => p.id !== id)
    } catch (e) {
      notify.error('Kaydedilemedi', e instanceof Error ? e.message : String(e))
    }
  }

  function askClose() {
    if (run?.closedAt) return notify.error('Koşu kapatılamaz', 'Koşu zaten kapatıldı.')
    if (blocker) return notify.error('Koşu kapatılamaz', blocker)
    confirm = true
  }

  async function close() {
    if (!run) return
    closing = true
    try {
      loaded = await post<RunInfo>(`/kosular/${run.id}/kapat`, {})
      confirm = false
      notify.success('Koşu kapatıldı')
    } catch (e) {
      notify.error('Koşu kapatılamadı', e instanceof Error ? e.message : String(e))
    } finally {
      closing = false
    }
  }

  const ACTION: Record<ProposalAction, string> = {
    ekle: 'Yeni kural',
    guncelle: 'Kuralı güncelle',
    birlestir: 'Kuralları birleştir',
    emekli: 'Kuralı kaldır',
  }
</script>

<Page title={run ? `${run.code} · Kapanış` : 'Kapanış'} description={run?.options.brief ?? run?.pages.join(', ') ?? ''}>
  {#snippet actions()}
    {#if run}<Button variant="outline" href={`#/onay/${run.id}`}>Değerlendirmeye dön</Button>{/if}
    <Button onclick={askClose}>{run?.closedAt ? 'Kapatıldı' : 'Koşuyu kapat'}</Button>
  {/snippet}
  {#snippet subheader()}<RunSteps {run} current="kapanis" />{/snippet}
  {#if run}
    {#if blocker}
      <p class="rounded-lg bg-[#fff7d6] px-4 py-3 text-[13px] text-[#533f04]">
        {blocker} <a class="font-semibold underline" href={`#/onay/${run.id}`}>Değerlendirmeye dön</a>
      </p>
    {/if}

    <section class="bg-card grid gap-4 rounded-xl border p-5">
      <header class="flex flex-wrap items-start gap-3">
        <div class="grid gap-0.5">
          <h2 class="text-[15px] font-semibold text-[#172b4d]">Düzeltilecekler ({fixes.length})</h2>
          <p class="text-[12.5px] text-[#626f86]">
            Seçtiklerin tek istem olur; Claude Code'a yapıştır. Ekibin değiştirdiği çözüm istemde öyle belirtilir.
          </p>
        </div>
        <Button class="ml-auto" variant="outline" onclick={copy}>{copied ? 'Kopyalandı' : 'İstemi kopyala'}</Button>
      </header>
      {#if fixes.length}
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ul class="grid content-start gap-1.5">
            {#each fixes as issue (issue.id)}
              <li>
                <label class="hover:bg-secondary flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2">
                  <input type="checkbox" bind:checked={selected[issue.id]} class="mt-0.5 size-4 accent-[#0c66e4]" />
                  <span class="grid min-w-0 gap-0.5">
                    <span class="text-[13.5px] leading-5 font-medium text-[#172b4d]">{issue.title}</span>
                    <span class="text-[12px] text-[#626f86]"
                      >{issue.severity} {SEVERITY[issue.severity].label} · {issue.pages.map(pageLabel).join(', ')}{issue.fixEdited
                        ? ' · çözümü ekip değiştirdi'
                        : ''}</span
                    >
                  </span>
                </label>
              </li>
            {/each}
          </ul>
          <pre
            class="scroll-thin max-h-[420px] overflow-auto rounded-lg bg-[#f7f8f9] px-4 py-3 font-mono text-[12px] leading-[18px] whitespace-pre-wrap text-[#172b4d]">{chosen.length
              ? prompt
              : 'Bulgu seçilmedi.'}</pre>
        </div>
      {:else}
        <p class="text-muted-foreground text-[13px]">Düzeltilecek bulgu yok.</p>
      {/if}
    </section>

    <section class="bg-card grid gap-4 rounded-xl border p-5">
      <header class="flex flex-wrap items-start gap-3">
        <div class="grid gap-0.5">
          <h2 class="text-[15px] font-semibold text-[#172b4d]">Öğrenme önerileri ({proposals.length})</h2>
          <p class="text-[12.5px] text-[#626f86]">
            Argus kararlarından kural önerir; kabul etmediğin hiçbir kural hafızaya girmez. Yanlış gözlem ve kapsam dışı
            nedenli kararlardan kural çıkmaz.
          </p>
        </div>
        <Button class="ml-auto" variant="outline" disabled={learning} onclick={learn}
          >{learning ? 'Öğreniliyor…' : 'Kararlardan öğren'}</Button
        >
      </header>
      {#if learned !== null && !proposals.length}
        <p class="text-muted-foreground text-[13px]">
          {learned ? `${learned} öneri çıktı; bekleyen öneri kalmadı.` : 'Kararlardan yeni kural çıkmadı.'}
        </p>
      {/if}
      {#each proposals as p (p.id)}
        <article class="grid gap-1.5 rounded-lg border px-4 py-3">
          <div class="flex flex-wrap items-center gap-2 text-[12px]">
            <span class="rounded bg-[#e9f2ff] px-1.5 leading-[18px] font-semibold text-[#0055cc]">{ACTION[p.action]}</span>
            <span class="text-[#626f86]">{p.rule.scope} · {p.rule.type}</span>
            <span class="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onclick={() => settle(p.id, false)}>Reddet</Button>
              <Button size="sm" onclick={() => settle(p.id, true)}>Kabul et</Button>
            </span>
          </div>
          <p class="text-[13.5px] leading-5 text-[#172b4d]">{p.rule.text}</p>
          <p class="text-[12.5px] leading-[18px] text-[#626f86]">{p.reason}</p>
        </article>
      {:else}
        {#if learned === null}
          <p class="text-muted-foreground text-[13px]">Bekleyen öneri yok. Kararlardan öğrenmek için düğmeye bas.</p>
        {/if}
      {/each}
    </section>

    <section class="bg-card grid gap-3 rounded-xl border p-5">
      <div class="grid gap-0.5">
        <h2 class="text-[15px] font-semibold text-[#172b4d]">Bilerek bırakılanlar ({kept.length})</h2>
        <p class="text-[12.5px] text-[#626f86]">Gerçek ama böyle kalması kararlaştırıldı; sonraki koşularda bulgu sayılmaz.</p>
      </div>
      {#each kept as issue (issue.id)}
        <a href={`#/bulgular/${issue.id}`} class="hover:bg-secondary grid gap-0.5 rounded-lg border px-3 py-2">
          <span class="text-[13.5px] leading-5 font-medium text-[#172b4d]">{issue.title}</span>
          <span class="text-[12px] text-[#626f86]">{issue.pages.map(pageLabel).join(', ')}</span>
        </a>
      {:else}
        <p class="text-muted-foreground text-[13px]">Bilerek bırakılan bulgu yok.</p>
      {/each}
    </section>
  {:else if !loading}
    <p class="text-muted-foreground text-sm">Koşu bulunamadı.</p>
  {/if}
</Page>

{#if run}
  <Modal
    bind:open={confirm}
    title="Koşuyu kapat"
    description="Koşunun test verisi temizlenir ve koşu kapanır. Kapatılan koşu yeniden değerlendirilmez."
    size="sm"
  >
    <div class="grid grid-cols-3 gap-2">
      {#each [[run.review.accepted, 'Düzeltilecek'], [run.review.kept, 'Bilerek böyle'], [run.review.rejected, 'Bulgu değil']] as [n, label] (label)}
        <div class="bg-surface-alt grid rounded-lg px-3 py-2">
          <b class="text-lg tabular-nums">{n}</b><span class="text-muted-foreground text-xs">{label}</span>
        </div>
      {/each}
    </div>
    {#snippet footer()}
      <Button variant="outline" onclick={() => (confirm = false)}>Vazgeç</Button>
      <Button disabled={closing} onclick={close}>Kapat</Button>
    {/snippet}
  </Modal>
{/if}
