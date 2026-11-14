<script lang="ts">
  import type { FindingKind, RunEvent, RunInfo } from '@argus/shared'
  import { onDestroy, onMount } from 'svelte'
  import EventCard from '../components/EventCard.svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import Modal from '$lib/components/layout/Modal.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import Panel from '$lib/components/layout/Panel.svelte'
  import RunStatusBadge from '$lib/components/status/RunStatusBadge.svelte'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { api, fileUrl, post } from '$lib/api'
  import { formatCost, formatDuration, KIND, OUTCOME } from '$lib/format'
  import { buildMonitor, nextPlayhead, stepPercent, TOOL_LABEL, type MonitorFinding } from '$lib/monitor'
  import { live, subscribe } from '$lib/stream.svelte'
  import { cn } from '$lib/utils'

  /**
   * Koşu monitörü: koşu canlı izlenir ya da kayıttan geri sarılır. Ortada sahne (canlı tarayıcı ya da adımın karesi,
   * üstünde imleç ve hedef çerçevesi), altında tek satır anlatı (ne yaptı · neden) ve bulgu işaretli zaman çizelgesi;
   * solda plan (sayfa › görev), sağda bulgular. Canlı akış hızlıyken her adım en az 1,2 sn gösterilir (kaçırma olmaz);
   * bulguya tıklayınca o anın kaydı açılır. Ham olay akışı "Tüm olaylar" penceresindedir. Model çağrısı yoktur: anlatı
   * modelin zaten verdiği "neden", kare ve hedef sunucunun modelsiz ölçümüdür.
   */
  let { runId }: { runId: string } = $props()

  const MIN_STEP_MS = 1_200
  const KIND_BADGE: Record<FindingKind, BadgeVariant> = {
    kesin: 'error',
    tutarsizlik: 'warning',
    not: 'info',
  }
  const KIND_PIN: Record<FindingKind, string> = {
    kesin: 'bg-destructive',
    tutarsizlik: 'bg-warning',
    not: 'bg-info',
  }

  let run = $state<RunInfo | null>(null)
  let events = $state<RunEvent[]>([])
  let frame = $state<string | null>(null)
  let error = $state<string | null>(null)
  let message = $state('')
  let allEvents = $state(false)
  let following = $state(true)
  let shown = $state(-1)
  let shownAt = $state(0)
  let selected = $state<MonitorFinding | null>(null)
  let now = $state(Date.now())

  const current = $derived(live.runs[runId] ?? run)
  const running = $derived(current?.status === 'calisiyor' || current?.status === 'sirada')
  const model = $derived(buildMonitor(events))
  const latest = $derived(model.steps.length - 1)
  const step = $derived(model.steps[shown] ?? null)
  const behind = $derived(following ? latest - shown : 0)
  const atLive = $derived(following && running && shown >= latest)
  const elapsed = $derived.by(() => {
    void now
    return current ? formatDuration(current.startedAt, current.finishedAt) : '—'
  })

  // Sahnenin görüntüsü: seçili bulgunun kanıtı > canlı tarayıcı (canlıya yetişmişken) > adımın karesi.
  const scene = $derived.by(() => {
    if (selected?.event.shot) return { src: fileUrl(runId, selected.event.shot), live: false, overlay: false }
    if (atLive && frame) {
      const fresh = step ? now - Date.parse(step.at) < 2_500 : false
      return { src: frame, live: true, overlay: fresh }
    }
    if (step?.shot) return { src: fileUrl(runId, step.shot), live: false, overlay: true }
    return null
  })

  const activeTask = $derived(step ? { page: step.page, task: step.task } : null)

  function goTo(index: number) {
    selected = null
    following = false
    shown = Math.min(Math.max(index, 0), latest)
  }

  function backToLive() {
    selected = null
    following = true
    shown = latest
    shownAt = Date.now()
  }

  function openFinding(finding: MonitorFinding) {
    following = false
    shown = finding.step
    selected = finding
  }

  function onBarClick(event: MouseEvent) {
    const bar = event.currentTarget as HTMLElement
    const rect = bar.getBoundingClientRect()
    goTo(Math.round(((event.clientX - rect.left) / rect.width) * latest))
  }

  function onKeydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return
    if (event.key === 'ArrowLeft') goTo(shown - 1)
    if (event.key === 'ArrowRight') goTo(shown + 1)
  }

  async function steer() {
    if (!message.trim()) return
    try {
      await post(`/kosular/${runId}/yonlendir`, { mesaj: message })
      message = ''
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function stop() {
    await post(`/kosular/${runId}/durdur`).catch((e: unknown) => (error = String(e)))
  }

  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | undefined

  onMount(async () => {
    try {
      ;[run, events] = await Promise.all([
        api<RunInfo>(`/kosular/${runId}`),
        api<RunEvent[]>(`/kosular/${runId}/olaylar`),
      ])
      // Açılışta son adım görünür; biten koşu kayıttan izlenir.
      shown = model.steps.length - 1
      shownAt = Date.now()
      following = run.status === 'calisiyor' || run.status === 'sirada'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    unsubscribe = subscribe((m) => {
      if (m.type === 'kare') {
        if (m.runId === runId) frame = `data:image/jpeg;base64,${m.data}`
        return
      }
      if (m.type === 'kosu-guncellendi' || m.type === 'calisma-alani') {
        if (m.type === 'kosu-guncellendi' && m.run.id === runId) run = m.run
        return
      }
      if (m.runId !== runId || events.some((e) => e.seq === m.seq)) return
      events.push(m)
    })
    timer = setInterval(() => {
      now = Date.now()
      const next = nextPlayhead({ shown, shownAt, following }, latest, now, MIN_STEP_MS)
      shown = next.shown
      shownAt = next.shownAt
    }, 250)
  })

  onDestroy(() => {
    unsubscribe?.()
    clearInterval(timer)
  })
</script>

<svelte:window onkeydown={onKeydown} />

<Page
  title={running ? 'Canlı koşu' : 'Koşu kaydı'}
  description={current
    ? `${current.project}/${current.application} · ${current.environment} · ${current.pages.length} sayfa`
    : ''}
>
  {#snippet actions()}
    {#if current}
      <span class="text-muted-foreground tabular text-[13px]">{elapsed} · {formatCost(current.usage)}</span>
      <RunStatusBadge status={current.status} />
    {/if}
    <Button variant="outline" onclick={() => (allEvents = true)}>Tüm olaylar</Button>
    {#if running}<Button variant="outline" onclick={stop}>Durdur</Button>{/if}
  {/snippet}

  {#if error}
    <Alert.Root variant="destructive">
      <Icon name="error" />
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  <div class="grid grid-cols-[240px_minmax(0,1fr)_300px] items-start gap-5">
    <Panel title="Plan" flush>
      <div class="flex flex-col py-2">
        {#each model.pages as page (page.page)}
          <div class="flex items-center gap-2 px-4 pt-2 pb-1">
            <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">{page.page}</span>
            {#if page.status === 'suruyor'}<Spinner />{:else if page.status === 'bitti'}<Icon
                name="checkCircle"
                class="text-success size-4"
              />{/if}
          </div>
          {#each page.tasks as task (task.index)}
            {@const active = activeTask?.page === page.page && activeTask.task === task.index}
            <button
              type="button"
              onclick={() => task.firstStep !== null && goTo(task.firstStep)}
              disabled={task.firstStep === null}
              class={cn(
                'mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] disabled:cursor-default',
                active ? 'bg-brand-soft text-brand-strong font-medium' : 'hover:bg-secondary',
                task.status === 'bitti' && !active && 'text-muted-foreground',
              )}
            >
              <Icon
                name={task.status === 'bitti' ? 'checkCircle' : 'circleOutline'}
                class={cn('size-4', task.status === 'suruyor' ? 'text-brand' : 'text-muted-foreground')}
              />
              <span class="min-w-0 flex-1 truncate">{task.title}</span>
            </button>
          {/each}
        {/each}
        {#if !model.pages.length}<p class="text-muted-foreground px-4 py-3 text-[13px]">
            Plan bekleniyor.
          </p>{/if}
      </div>
    </Panel>

    <Card.Root class="gap-4 px-5 py-5">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold">
          {selected ? 'Bulgunun anı' : atLive ? 'Şimdi' : `Adım ${shown + 1} / ${model.steps.length}`}
        </span>
        {#if atLive}<Badge variant="success"
            ><span class="size-1.5 animate-pulse rounded-full bg-current"></span>Canlı</Badge
          >{/if}
        {#if behind > 1}
          <span class="text-muted-foreground ml-auto text-[13px]">Canlıdan {behind} adım geride</span>
          <Button size="sm" variant="outline" onclick={backToLive}>Canlıya atla</Button>
        {/if}
      </div>

      <div class="bg-surface-alt relative aspect-[16/10] overflow-hidden rounded-lg border">
        {#if scene}
          <img src={scene.src} alt="Tarayıcı görüntüsü" class="size-full object-contain" />
          {#if scene.overlay && step?.target && !selected}
            {@const t = step.target}
            <div
              class="border-brand pointer-events-none absolute rounded-[3px] border-2 border-dashed"
              style={`left:${t.x * 100}%;top:${t.y * 100}%;width:${t.width * 100}%;height:${t.height * 100}%`}
            ></div>
            <div
              class="pointer-events-none absolute"
              style={`left:${(t.x + t.width / 2) * 100}%;top:${(t.y + t.height / 2) * 100}%`}
            >
              <span class="border-brand absolute -top-3 -left-3 size-6 animate-ping rounded-full border-2"
              ></span>
              <Icon name="cursor" class="text-foreground size-6 drop-shadow-[0_1px_1px_rgb(255_255_255)]" />
            </div>
          {/if}
        {:else}
          <div class="text-muted-foreground grid size-full place-items-center text-sm">
            {running ? 'Görüntü bekleniyor' : 'Bu adımın görüntüsü yok'}
          </div>
        {/if}
      </div>

      {#if selected}
        <div class="grid gap-1">
          <div class="flex items-center gap-2">
            <Badge variant={KIND_BADGE[selected.event.kind]}>{KIND[selected.event.kind].label}</Badge>
            <span class="text-sm font-medium">{selected.event.title}</span>
          </div>
          {#if selected.event.reason}<p class="text-muted-foreground text-[13px]">
              {selected.event.reason}
            </p>{/if}
        </div>
      {:else if step}
        <div class="grid gap-1">
          <div class="flex items-center gap-2">
            <Badge variant="brand">{TOOL_LABEL[step.tool] ?? step.tool}</Badge>
            <span class="truncate text-sm font-medium">{step.outcome}</span>
          </div>
          {#if step.reason}<p class="text-muted-foreground text-[13px]">Neden: {step.reason}</p>{/if}
        </div>
      {:else}
        <p class="text-muted-foreground text-[13px]">
          {running ? 'Sayfa açılıyor, ilk adım bekleniyor.' : 'Bu koşuda adım yok.'}
        </p>
      {/if}

      {#if model.steps.length}
        <div class="grid gap-2">
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="relative h-5 cursor-pointer" onclick={onBarClick}>
            <div class="bg-border absolute inset-x-0 top-2 h-1 rounded-full"></div>
            <div
              class="bg-brand absolute top-2 left-0 h-1 rounded-full"
              style={`width:${stepPercent(shown, model.steps.length)}%`}
            ></div>
            {#each model.findings as finding (finding.event.seq)}
              <button
                type="button"
                title={finding.event.title}
                aria-label={`Bulgu: ${finding.event.title}`}
                onclick={(e) => {
                  e.stopPropagation()
                  openFinding(finding)
                }}
                class={cn(
                  'absolute top-0.5 size-4 -translate-x-1/2 rounded-full border-2 border-white',
                  KIND_PIN[finding.event.kind],
                )}
                style={`left:${stepPercent(finding.step, model.steps.length)}%`}
              ></button>
            {/each}
          </div>
          <div class="flex items-center gap-2">
            <Button size="icon-sm" variant="outline" aria-label="Önceki adım" onclick={() => goTo(shown - 1)}>
              <Icon name="chevronLeft" />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Sonraki adım"
              onclick={() => goTo(shown + 1)}
            >
              <Icon name="chevronRight" />
            </Button>
            <span class="text-muted-foreground tabular text-[13px]"
              >{shown + 1} / {model.steps.length} adım</span
            >
            {#if running && !following}
              <Button size="sm" class="ml-auto" onclick={backToLive}>Canlıya dön</Button>
            {/if}
          </div>
        </div>
      {/if}

      {#if running}
        <form
          class="flex gap-2"
          onsubmit={(e) => {
            e.preventDefault()
            void steer()
          }}
        >
          <Input placeholder="Kontrolcüyü yönlendir: tarih filtresini de dene" bind:value={message} />
          <Button type="submit" variant="outline" disabled={!message.trim()}>Gönder</Button>
        </form>
      {/if}
    </Card.Root>

    <Panel title={`Bulgular · ${model.findings.length}`} flush>
      <div class="flex flex-col gap-2 p-3">
        {#each model.findings as finding (finding.event.seq)}
          <button
            type="button"
            onclick={() => openFinding(finding)}
            class={cn(
              'grid gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
              selected?.event.seq === finding.event.seq
                ? 'border-brand-border bg-brand-soft'
                : 'hover:bg-secondary',
            )}
          >
            <span class="flex items-center gap-1.5">
              <Badge variant={KIND_BADGE[finding.event.kind]}>{KIND[finding.event.kind].label}</Badge>
              <span class="text-muted-foreground text-xs">{OUTCOME[finding.event.outcome].label}</span>
            </span>
            <span class="text-[13px] leading-[18px]">{finding.event.title}</span>
          </button>
        {/each}
        {#if !model.findings.length}
          <p class="text-muted-foreground px-1 py-2 text-[13px]">
            {running ? 'Henüz bulgu yok.' : 'Bu koşuda bulgu yok.'}
          </p>
        {/if}
        {#if selected}
          <a class="text-brand px-1 pt-1 text-[13px]" href={`#/bulgular/${selected.event.issueId}`}
            >Bulgu kaydını aç</a
          >
        {/if}
      </div>
    </Panel>
  </div>
</Page>

<Modal
  bind:open={allEvents}
  title="Tüm olaylar"
  description="Koşunun ham akışı: araştırma, ağ istekleri, maliyet ve ayrıntılar."
  size="lg"
>
  <div class="legacy grid gap-2">
    {#each events as event (event.seq)}<EventCard {event} />{/each}
  </div>
</Modal>
