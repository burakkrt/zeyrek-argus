<script lang="ts">
  import type { RunInfo } from '@argus/shared'
  import { onMount } from 'svelte'
  import { runQuery } from '$lib/workspace.svelte'
  import { api, qs } from '../lib/api'
  import { formatCost, formatDate, formatDuration, RUN_STATUS } from '../lib/format'
  import { go } from '../lib/router.svelte'
  import { live } from '../lib/stream.svelte'

  let runs = $state<RunInfo[]>([])
  let error = $state('')
  const rows = $derived(runs.map((r) => live.runs[r.id] ?? r))

  onMount(() => {
    api<RunInfo[]>(`/kosular${qs(runQuery())}`)
      .then((r) => (runs = r))
      .catch((e: unknown) => (error = String(e)))
  })
</script>

<h1>Koşular</h1>
<p class="muted">Her keşif burada kalır; tıklayınca monitörde adım adım yeniden izlenir.</p>
{#if error}<p class="error">{error}</p>{/if}

<section class="card">
  {#if !rows.length}
    <p class="muted">Henüz koşu yok. <a href="#/baslat">Yeni keşif başlat →</a></p>
  {:else}
    <table>
      <thead>
        <tr
          ><th>Tarih</th><th>Uygulama</th><th>Ortam</th><th>Sayfalar</th><th>Durum</th><th>Süre</th><th
            >Maliyet</th
          ><th>Bulgu</th></tr
        >
      </thead>
      <tbody>
        {#each rows as run (run.id)}
          <tr class="clickable" onclick={() => go(`/monitor/${run.id}`)}>
            <td>{formatDate(run.createdAt)}</td>
            <td><strong>{run.project}/{run.application}</strong></td>
            <td><span class="badge">{run.environment}</span></td>
            <td class="small"
              >{run.pages.length > 3
                ? `${run.pages.slice(0, 3).join(', ')} +${run.pages.length - 3}`
                : run.pages.join(', ')}</td
            >
            <td
              ><span class={`badge ${RUN_STATUS[run.status].tone}`}>{RUN_STATUS[run.status].label}</span
              >{#if run.error}<div class="small muted">{run.error}</div>{/if}</td
            >
            <td class="small">{formatDuration(run.startedAt, run.finishedAt)}</td>
            <td class="small">{formatCost(run.usage)}</td>
            <td class="small">
              {#if run.counts.new}<span class="badge fail">{run.counts.new} yeni</span>{/if}
              {#if run.counts.repeated}<span class="badge warn">{run.counts.repeated} bilinen</span>{/if}
              {#if run.counts.suppressed}<span class="badge">{run.counts.suppressed} bastırıldı</span>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>
