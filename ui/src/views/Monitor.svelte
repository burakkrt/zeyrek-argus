<script lang="ts">
  import type { RunEvent, RunInfo } from '@argus/shared'
  import { onDestroy, onMount, tick } from 'svelte'
  import EventCard from '../components/EventCard.svelte'
  import Shot from '../components/Shot.svelte'
  import { api, fileUrl, post } from '../lib/api'
  import { formatCost, formatDuration, formatTokens, KIND, OUTCOME, RUN_STATUS } from '../lib/format'
  import { live, subscribe } from '../lib/stream.svelte'

  let { runId }: { runId: string } = $props()
  let run = $state<RunInfo | null>(null)
  let events = $state<RunEvent[]>([])
  let frame = $state<string | null>(null)
  let message = $state('')
  let error = $state('')
  let follow = $state(true)
  let timeline: HTMLElement | undefined = $state()
  let now = $state(Date.now())

  const current = $derived(live.runs[runId] ?? run)
  const elapsed = $derived.by(() => {
    void now
    return current ? formatDuration(current.startedAt, current.finishedAt) : '—'
  })
  const running = $derived(current?.status === 'calisiyor' || current?.status === 'sirada')
  const findings = $derived(
    events.filter((e): e is Extract<RunEvent, { type: 'bulgu' }> => e.type === 'bulgu'),
  )
  const visibleFindings = $derived(findings.filter((f) => f.outcome !== 'bastirildi'))
  const lastShot = $derived(
    [...events].reverse().find((e) => e.type === 'bulgu' && e.shot && e.outcome !== 'bastirildi') as
      { shot: string | null } | undefined,
  )
  const currentTask = $derived(
    [...events].reverse().find((e) => e.type === 'gorev-basladi' || e.type === 'sayfa-basladi'),
  )
  const plan = $derived(
    [...events].reverse().find((e) => e.type === 'plan') as Extract<RunEvent, { type: 'plan' }> | undefined,
  )
  const doneTasks = $derived(
    new Set(
      events
        .filter((e) => e.type === 'gorev-bitti' && e.page === plan?.page)
        .map((e) => (e as { index: number }).index),
    ),
  )

  async function scrollDown() {
    if (!follow || !timeline) return
    await tick()
    timeline.scrollTop = timeline.scrollHeight
  }

  function onScroll() {
    if (!timeline) return
    follow = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80
  }

  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | undefined

  onMount(async () => {
    try {
      ;[run, events] = await Promise.all([
        api<RunInfo>(`/kosular/${runId}`),
        api<RunEvent[]>(`/kosular/${runId}/olaylar`),
      ])
      await scrollDown()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    unsubscribe = subscribe((m) => {
      if (m.type === 'kare') {
        if (m.runId === runId) frame = `data:image/jpeg;base64,${m.data}`
        return
      }
      if (m.type === 'kosu-guncellendi') {
        if (m.run.id === runId) run = m.run
        return
      }
      if (m.type === 'calisma-alani') return
      if (m.runId !== runId || events.some((e) => e.seq === m.seq)) return
      if (m.type === 'yonlendirme') {
        // Yerel yankıyı sunucunun kaydıyla değiştir (iki kez görünmesin).
        const echo = events.findIndex(
          (e) => e.seq < 0 && e.type === 'yonlendirme' && e.message.trim() === m.message.trim(),
        )
        if (echo >= 0) events.splice(echo, 1)
      }
      events.push(m)
      void scrollDown()
    })
    timer = setInterval(() => (now = Date.now()), 1000)
  })

  onDestroy(() => {
    unsubscribe?.()
    clearInterval(timer)
  })

  async function steer() {
    if (!message.trim()) return
    try {
      await post(`/kosular/${runId}/yonlendir`, { mesaj: message })
      events.push({
        type: 'yonlendirme',
        message,
        runId,
        seq: -Date.now(),
        at: new Date().toISOString(),
        page: null,
      })
      message = ''
      void scrollDown()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function stop() {
    await post(`/kosular/${runId}/durdur`).catch((e: unknown) => (error = String(e)))
  }
</script>

{#if current}
  <header class="card head">
    <div>
      <div class="row">
        <h1>{current.project}/{current.application}</h1>
        <span class="badge">{current.environment}</span>
        <span class={`badge ${RUN_STATUS[current.status].tone}`}>{RUN_STATUS[current.status].label}</span>
      </div>
      <div class="muted small">{current.pages.join(' · ')}</div>
    </div>
    <span class="spacer"></span>
    <div class="metrics">
      <div><span class="muted small">Süre</span><strong>{elapsed}</strong></div>
      <div><span class="muted small">Maliyet</span><strong>{formatCost(current.usage)}</strong></div>
      <div title={formatTokens(current.usage)}>
        <span class="muted small">İstek</span><strong>{current.usage.requests}</strong>
      </div>
      <div><span class="muted small">Bulgu</span><strong>{visibleFindings.length}</strong></div>
    </div>
    {#if running}<button class="danger" onclick={stop}>Durdur</button>{/if}
  </header>
{/if}

{#if error}<p class="error">{error}</p>{/if}

<div class="layout">
  <section class="card timeline-wrap">
    <div class="row">
      <h2>Akış</h2>
      <span class="muted small">{events.length} olay</span>
      <span class="spacer"></span>
      {#if !follow}<button class="small" onclick={() => ((follow = true), scrollDown())}>Sona git ↓</button
        >{/if}
    </div>
    <div class="timeline" bind:this={timeline} onscroll={onScroll}>
      {#each events as event (event.seq)}
        <EventCard {event} />
      {/each}
      {#if running}<div class="typing muted small"><span class="pulse"></span> Kontrolcü çalışıyor…</div>{/if}
    </div>
    {#if running}
      <form
        class="steer"
        onsubmit={(e) => {
          e.preventDefault()
          void steer()
        }}
      >
        <input
          placeholder="Kontrolcüyü yönlendir: ör. “tarih filtresini de dene”, “formdaki zorunlu alanlara bak”"
          bind:value={message}
        />
        <button class="primary" disabled={!message.trim()}>Gönder</button>
      </form>
    {/if}
  </section>

  <aside class="side">
    <section class="card">
      <div class="row">
        <h2>{running ? 'Canlı görüntü' : 'Son bulgunun kanıtı'}</h2>
        {#if running && frame}<span class="badge fail"><span class="pulse"></span> canlı</span>{/if}
      </div>
      {#if running && frame}
        <img class="screen" src={frame} alt="Canlı tarayıcı görüntüsü" />
      {:else if lastShot?.shot}
        <Shot src={fileUrl(runId, lastShot.shot)} width={420} height={262} />
      {:else}
        <div class="screen empty muted">Görüntü bekleniyor…</div>
      {/if}
      {#if currentTask}
        <p class="small muted now">
          Şu an: <strong
            >{currentTask.type === 'gorev-basladi'
              ? currentTask.title
              : `${currentTask.page} açılıyor`}</strong
          >
        </p>
      {/if}
    </section>

    {#if plan}
      <section class="card">
        <h2>Plan · {plan.page}</h2>
        <ol class="plan">
          {#each plan.tasks as task, i (i)}
            <li class:done={doneTasks.has(i)}>{task.title}</li>
          {/each}
        </ol>
      </section>
    {/if}

    <section class="card">
      <div class="row">
        <h2>Bu koşunun bulguları</h2>
        <span class="spacer"></span>
        <a class="small" href={`#/bulgular?kosu=${runId}`}>Hepsi →</a>
      </div>
      {#if !findings.length}<p class="muted small">Henüz yok.</p>{/if}
      <ul class="found">
        {#each findings as f (f.seq)}
          <li class:muted={f.outcome === 'bastirildi'}>
            <a href={`#/bulgular/${f.issueId}`}>
              <span class={`badge ${KIND[f.kind].tone}`}>{KIND[f.kind].label}</span>
              {f.title}
            </a>
            <span class={`badge ${OUTCOME[f.outcome].tone}`}>{OUTCOME[f.outcome].label}</span>
          </li>
        {/each}
      </ul>
    </section>
    {#if current}<p class="muted small">{formatTokens(current.usage)}</p>{/if}
  </aside>
</div>

<style>
  .head {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .metrics {
    display: flex;
    gap: 18px;
  }

  .metrics div {
    display: grid;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 440px;
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 1100px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .timeline-wrap {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: calc(100vh - 150px);
    min-height: 420px;
  }

  .timeline {
    overflow-y: auto;
    padding-right: 6px;
  }

  .steer {
    display: flex;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .steer input {
    flex: 1;
  }

  .side {
    display: grid;
    gap: 12px;
    position: sticky;
    top: 16px;
  }

  .screen {
    width: 100%;
    aspect-ratio: 16 / 10;
    border-radius: 8px;
    border: 1px solid var(--border);
    object-fit: contain;
    background: var(--panel-2);
  }

  .screen.empty {
    display: grid;
    place-items: center;
  }

  .now {
    margin: 8px 0 0;
  }

  .plan {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 4px;
  }

  .plan li.done {
    color: var(--muted);
    text-decoration: line-through;
  }

  .found {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
    max-height: 300px;
    overflow-y: auto;
  }

  .found li {
    display: flex;
    gap: 6px;
    justify-content: space-between;
    align-items: flex-start;
  }

  .found a {
    color: var(--text);
  }

  .typing {
    padding: 10px 0;
  }

  .pulse {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--fail);
    animation: pulse 1.2s infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
</style>
