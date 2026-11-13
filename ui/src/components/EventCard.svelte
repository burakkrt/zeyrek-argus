<script lang="ts">
  import type { RunEvent } from '@argus/shared'
  import { fileUrl } from '../lib/api'
  import { formatTime, KIND, OUTCOME, TOOL_LABELS } from '../lib/format'
  import Shot from './Shot.svelte'

  let { event }: { event: RunEvent } = $props()
  let openNetwork = $state(false)
</script>

{#if event.type === 'sayfa-basladi'}
  <div class="page-head">
    <strong>Sayfa: {event.page}</strong>
    <a class="small mono" href={event.url} target="_blank" rel="noreferrer">{event.url}</a>
  </div>
{:else if event.type === 'yonlendirme'}
  <div class="bubble user">
    <span class="muted small">Sen · {formatTime(event.at)}</span>
    <div>{event.message}</div>
  </div>
{:else}
  <div class={`item ${event.type}`}>
    <span class="time mono">{formatTime(event.at)}</span>
    <div class="body">
      {#if event.type === 'kosu-basladi'}
        <strong>Koşu başladı</strong> <span class="muted">· {event.pages.length} sayfa</span>
      {:else if event.type === 'arastirma'}
        <div class="row">
          <strong>Araştırma</strong>
          <span class="badge">{event.eyeFindings} göz bulgusu</span>
          <span class="badge">{event.tooltips} ipucu okundu</span>
          <span class="badge">{event.requests} istek</span>
          <span class="badge" title="İsteme giren / bütçeye sığmayan kurallar ve tahmini token"
            >kural {event.rules.used}{event.rules.dropped ? ` (+${event.rules.dropped} sığmadı)` : ''} · ~{event
              .rules.tokens} token</span
          >
        </div>
        {#if event.shot}<div class="shot">
            <Shot src={fileUrl(event.runId, event.shot)} width={240} height={150} />
          </div>{/if}
      {:else if event.type === 'plan'}
        <strong>Plan</strong> <span class="muted">{event.summary}</span>
        <ol class="tasks">
          {#each event.tasks as task, i (i)}<li>
              <strong>{task.title}</strong> <span class="muted">— {task.goal}</span>
            </li>{/each}
        </ol>
      {:else if event.type === 'gorev-basladi'}
        <strong class="task">Görev {event.index + 1}: {event.title}</strong>
      {:else if event.type === 'gorev-bitti'}
        <span class="muted">Görev {event.index + 1} bitti:</span> {event.summary}
      {:else if event.type === 'adim'}
        <div class="row step">
          <span class="badge accent">{TOOL_LABELS[event.tool] ?? event.tool}</span>
          <span>{event.outcome}</span>
          {#if event.reason}<span class="muted small">— {event.reason}</span>{/if}
        </div>
        {#if event.shot}<div class="shot">
            <Shot src={fileUrl(event.runId, event.shot)} width={200} height={125} />
          </div>{/if}
      {:else if event.type === 'ag'}
        {@const blocked = event.requests.filter((r) => r.blocked).length}
        {@const failed = event.requests.filter((r) => r.status >= 400).length}
        <button class="ghost small" onclick={() => (openNetwork = !openNetwork)}>
          {openNetwork ? '▾' : '▸'}
          {event.requests.length} istek
          {#if blocked}<span class="badge warn">{blocked} engellendi</span>{/if}
          {#if failed}<span class="badge fail">{failed} hata</span>{/if}
        </button>
        {#if openNetwork}
          <table class="net">
            <tbody>
              {#each event.requests as r, i (i)}
                <tr>
                  <td class="mono">{r.method}</td>
                  <td class="mono url">{new URL(r.url).pathname}</td>
                  <td
                    >{#if r.blocked}<span class="badge warn">engellendi</span>{:else}<span
                        class={`badge ${r.status >= 400 ? 'fail' : 'ok'}`}>{r.status}</span
                      >{/if}</td
                  >
                  <td class="muted small">{r.ms} ms</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      {:else if event.type === 'bulgu'}
        <a class="finding" href={`#/bulgular/${event.issueId}`}>
          <div class="row">
            <span class={`badge ${KIND[event.kind].tone}`}>{KIND[event.kind].label}</span>
            <span class={`badge ${OUTCOME[event.outcome].tone}`}>{OUTCOME[event.outcome].label}</span>
            <strong>{event.title}</strong>
          </div>
          {#if event.reason}<div class="muted small">{event.reason}</div>{/if}
        </a>
        {#if event.shot}<div class="shot">
            <Shot src={fileUrl(event.runId, event.shot)} width={240} height={150} />
          </div>{/if}
      {:else if event.type === 'sorun-durumu'}
        <span class={`badge ${event.state === 'yok' ? 'ok' : 'warn'}`}
          >{event.state === 'yok' ? 'Düzelmiş' : 'Hâlâ var'}</span
        >
        <code>{event.key}</code> <span class="muted">{event.note}</span>
      {:else if event.type === 'bilgi'}
        <span class="muted">ℹ {event.message}</span>
      {:else if event.type === 'hata'}
        <span class="error-text">⚠ {event.message}</span>
      {:else if event.type === 'sayfa-bitti'}
        <strong>Sayfa bitti</strong>
      {:else if event.type === 'kosu-bitti'}
        <strong>Koşu bitti</strong>
        <span class="muted">· {event.status}{event.error ? ` · ${event.error}` : ''}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-head {
    display: grid;
    gap: 2px;
    margin: 18px 0 6px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--accent-soft);
  }

  .page-head a {
    overflow-wrap: anywhere;
  }

  .item {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--border);
  }

  .time {
    color: var(--muted);
    font-size: 11px;
    padding-top: 2px;
  }

  .body {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .task {
    color: var(--accent);
  }

  .tasks {
    margin: 6px 0 0;
    padding-left: 20px;
  }

  .shot {
    margin-top: 6px;
  }

  .finding {
    display: grid;
    gap: 2px;
    color: var(--text);
    text-decoration: none;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-2);
  }

  .finding:hover {
    border-color: var(--accent);
  }

  .net td {
    padding: 3px 6px;
    font-size: 12px;
  }

  .net .url {
    overflow-wrap: anywhere;
  }

  .error-text {
    color: var(--fail);
  }

  .bubble.user {
    margin: 8px 0 8px auto;
    max-width: 75%;
    padding: 8px 12px;
    border-radius: 12px 12px 2px 12px;
    background: var(--accent);
    color: #fff;
  }

  .bubble.user .muted {
    color: rgba(255, 255, 255, 0.75);
  }
</style>
