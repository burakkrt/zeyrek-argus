<script lang="ts">
  import type { FindingKind, Issue, IssueDetail, IssueStatus } from '@argus/shared'
  import { onMount } from 'svelte'
  import Shot from '../components/Shot.svelte'
  import { api, fileUrl, post, qs } from '../lib/api'
  import { formatDate, KIND, OUTCOME, SEVERITY, STATUS } from '../lib/format'
  import { pageLabel } from '../lib/monitor'
  import { go } from '../lib/router.svelte'
  import { appQuery } from '$lib/workspace.svelte'

  let { selectedId }: { selectedId: string | null } = $props()

  let statuses = $state<IssueStatus[]>(['acik', 'duzeltilecek'])
  let kinds = $state<FindingKind[]>(['kesin', 'tutarsizlik'])
  let query = $state('')
  let runFilter = $state(new URLSearchParams(location.hash.split('?')[1] ?? '').get('kosu') ?? '')
  let suppressed = $state(false)
  let issues = $state<Issue[]>([])
  let detail = $state<IssueDetail | null>(null)
  let occurrenceIndex = $state(0)
  let note = $state('')
  let comment = $state('')
  let error = $state('')
  let busy = $state(false)
  let formats = $state<Array<{ name: string }>>([])
  let format = $state('bulgu')

  const filterQuery = $derived(
    qs({
      ...appQuery(),
      durum: statuses.join(','),
      tur: kinds.join(','),
      q: query,
      kosu: runFilter,
      bastirilan: suppressed ? 1 : undefined,
    }),
  )
  const occurrence = $derived(detail?.occurrences[occurrenceIndex] ?? null)

  async function load() {
    try {
      issues = await api<Issue[]>(`/sorunlar${filterQuery}`)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  async function open(id: string | null) {
    detail = null
    occurrenceIndex = 0
    if (!id) return
    try {
      detail = await api<IssueDetail>(`/sorunlar/${id}`)
      error = ''
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  $effect(() => {
    void open(selectedId)
  })

  $effect(() => {
    void filterQuery
    void load()
  })

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  async function decide(status: IssueStatus) {
    if (!detail) return
    busy = true
    try {
      detail = await post<IssueDetail>(`/sorunlar/${detail.id}/karar`, { durum: status, not: note })
      note = ''
      await load()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      busy = false
    }
  }

  async function addComment() {
    if (!detail || !comment.trim()) return
    detail = await post<IssueDetail>(`/sorunlar/${detail.id}/yorum`, { metin: comment })
    comment = ''
  }

  function exportAs(kind: 'md' | 'csv' | 'json') {
    location.href = `/api/disa-aktar${filterQuery}${filterQuery ? '&' : '?'}bicim=${kind}&sablon=${encodeURIComponent(format)}`
  }

  async function importFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const result = await post<{ imported: number }>('/ice-aktar', JSON.parse(await file.text()))
      error = ''
      alert(`${result.imported} sorunun kararı ve yorumları hafızaya işlendi.`)
      await load()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  onMount(async () => {
    formats = await api<Array<{ name: string }>>('/hafiza/bicimler').catch(() => [])
  })
</script>

<div class="row head">
  <div>
    <h1>Bulgular</h1>
    <p class="muted">
      Kök nedene göre tek kayıt; her görüldüğü yer bir görünüm. Kararın Git'teki hafızaya yazılır, takım
      paylaşır.
    </p>
  </div>
  <span class="spacer"></span>
  <select bind:value={format} title="Markdown biçimi (memory/formats)">
    {#each formats as f (f.name)}<option value={f.name}>{f.name}</option>{/each}
  </select>
  <button onclick={() => exportAs('md')}>Markdown + görüntüler</button>
  <button onclick={() => exportAs('csv')}>Excel (CSV)</button>
  <button onclick={() => exportAs('json')}>JSON</button>
  <label class="button">İçe aktar<input type="file" accept=".json" hidden onchange={importFile} /></label>
</div>

{#if error}<p class="error">{error}</p>{/if}

<div class="card filters row">
  {#each Object.entries(STATUS) as [value, s] (value)}
    <button
      class="chip"
      class:on={statuses.includes(value as IssueStatus)}
      onclick={() => (statuses = toggle(statuses, value as IssueStatus))}>{s.label}</button
    >
  {/each}
  <span class="sep"></span>
  {#each Object.entries(KIND) as [value, k] (value)}
    <button
      class="chip"
      class:on={kinds.includes(value as FindingKind)}
      onclick={() => (kinds = toggle(kinds, value as FindingKind))}>{k.label}</button
    >
  {/each}
  <label class="small"><input type="checkbox" bind:checked={suppressed} /> bastırılanlar</label>
  {#if runFilter}<button class="chip on" onclick={() => (runFilter = '')}>yalnız bir koşu ✕</button>{/if}
  <span class="spacer"></span>
  <input placeholder="Ara…" bind:value={query} />
</div>

<div class="layout">
  <section class="list">
    {#if !issues.length}<p class="muted card">Bu süzgeçte bulgu yok.</p>{/if}
    {#each issues as issue (issue.id)}
      <button
        class="item card"
        class:active={detail?.id === issue.id}
        onclick={() => go(`/bulgular/${issue.id}`)}
      >
        <div class="row">
          {#if issue.contested}<span
              class="badge warn"
              title="İki kişinin kararı zıt: sorun bastırılmaz ve öğrenmeye girmez. Ayrışan kişi kararını değiştirince ya da onaylayınca çözülür."
              >Tartışmalı</span
            >{/if}
          <span class={`badge ${SEVERITY[issue.severity].tone}`} title={SEVERITY[issue.severity].hint}
            >{SEVERITY[issue.severity].label}</span
          >
          <span class={`badge ${KIND[issue.kind].tone}`}>{KIND[issue.kind].label}</span>
          <span class={`badge ${STATUS[issue.status].tone}`}>{STATUS[issue.status].label}</span>
          {#if issue.source === 'goz'}<span class="badge" title="Belirlenimci göz buldu (token harcamadan)"
              >göz</span
            >{/if}
          <span class="spacer"></span>
          <span class="muted small">{issue.seenCount}× · {formatDate(issue.lastSeen)}</span>
        </div>
        <strong class="title">{issue.title}</strong>
        <span class="muted small">{issue.pages.map(pageLabel).join(', ')}</span>
      </button>
    {/each}
  </section>

  <section class="detail">
    {#if detail}
      <div class="card stack">
        <div class="row">
          {#if detail.contested}<span
              class="badge warn"
              title="İki kişinin kararı zıt: sorun bastırılmaz ve öğrenmeye girmez. Ayrışan kişi kararını değiştirince ya da onaylayınca çözülür."
              >Tartışmalı</span
            >{/if}
          <span class={`badge ${SEVERITY[detail.severity].tone}`} title={SEVERITY[detail.severity].hint}
            >{SEVERITY[detail.severity].label}</span
          >
          <span class={`badge ${KIND[detail.kind].tone}`}>{KIND[detail.kind].label}</span>
          <span class={`badge ${STATUS[detail.status].tone}`}>{STATUS[detail.status].label}</span>
          <code class="muted">{detail.key}</code>
        </div>
        <h2>{detail.title}</h2>
        {#if occurrence}
          <div class="shot">
            {#if occurrence.shot}<Shot
                src={fileUrl(occurrence.runId, occurrence.shot)}
                width={620}
                height={388}
              />{:else}<p class="muted">Bu görünümde ekran görüntüsü yok.</p>{/if}
          </div>
          {#if detail.occurrences.length > 1}
            <div class="row occ">
              {#each detail.occurrences as o, i (o.id)}
                <button
                  class="chip"
                  class:on={i === occurrenceIndex}
                  onclick={() => (occurrenceIndex = i)}
                  title={o.reason ?? ''}
                >
                  {pageLabel(o.page)} · {formatDate(o.at)}
                  <span class={`badge ${OUTCOME[o.outcome].tone}`}>{OUTCOME[o.outcome].label}</span>
                </button>
              {/each}
            </div>
          {/if}
          <dl>
            <dt>Sayfa</dt>
            <dd>{pageLabel(occurrence.page)} · <a href={`#/monitor/${occurrence.runId}`}>koşuyu izle</a></dd>
            <dt>Senaryo</dt>
            <dd>{occurrence.scenario || '—'}</dd>
            <dt>Beklenen</dt>
            <dd>{occurrence.expected || '—'}</dd>
            <dt>Gözlenen</dt>
            <dd>{occurrence.observed || '—'}</dd>
            {#if occurrence.reason}<dt>Not</dt>
              <dd>{occurrence.reason}</dd>{/if}
            {#if occurrence.rules.length}<dt>Dayandığı kural</dt>
              <dd>{occurrence.rules.join(', ')}</dd>{/if}
          </dl>
        {/if}

        {#if detail.elsewhere.length}
          <div class="stack">
            <h3>Başka makinelerde görüldü</h3>
            {#each detail.elsewhere as s (s.author)}
              <div class="sighting">
                <div class="row small">
                  <strong>{s.author}</strong>
                  <span class="muted">{s.page} · {s.seenCount}× · son {formatDate(s.lastSeen)}</span>
                </div>
                {#if s.observed}<p class="small">{s.observed}</p>{/if}
                {#if s.quote}<p class="muted small">Ekranda: “{s.quote}”</p>{/if}
              </div>
            {/each}
            {#if !occurrence}<p class="muted small">
                Bu bilgisayarda henüz görülmedi; sayfa bir sonraki koşuda yeniden denetlenir.
              </p>{/if}
          </div>
        {/if}

        <div class="decide">
          <h3>Karar</h3>
          <textarea
            rows="2"
            placeholder="Yorum (isteğe bağlı): “düzelt ama tüm filtrelerde aynı sorun var, dikkat”"
            bind:value={note}
          ></textarea>
          <div class="row">
            <button class="primary" disabled={busy} onclick={() => decide('duzeltilecek')}
              >Düzeltilecek</button
            >
            <button disabled={busy} onclick={() => decide('bulgu-degil')}>Bulgu değil</button>
            <button disabled={busy} onclick={() => decide('duzeldi')}>Düzeldi</button>
            {#if detail.status !== 'acik'}<button class="ghost" disabled={busy} onclick={() => decide('acik')}
                >Yeniden aç</button
              >{/if}
          </div>
          <p class="muted small">
            "Bulgu değil" yalnız bu sorunu susturur; genel bir "sorun sayma" kuralı ancak senin onayınla
            devreye girer.
          </p>
        </div>

        <div>
          <h3>Yorumlar</h3>
          {#each detail.comments as c, i (i)}
            <div class="comment">
              <strong>{c.author}</strong> <span class="muted small">{formatDate(c.at)}</span>
              <div>{c.text}</div>
            </div>
          {:else}<p class="muted small">Yorum yok.</p>{/each}
          <div class="row">
            <input
              class="grow"
              placeholder="Yorum ekle…"
              bind:value={comment}
              onkeydown={(e) => e.key === 'Enter' && addComment()}
            />
            <button onclick={addComment} disabled={!comment.trim()}>Ekle</button>
          </div>
        </div>

        <div>
          <h3>Tarihçe</h3>
          <ul class="history small">
            <li>{formatDate(detail.firstSeen)} — ilk görüldü</li>
            {#each detail.history as h, i (i)}
              <li>
                {formatDate(h.at)} — <strong>{h.author}</strong>: {h.from ? STATUS[h.from].label : '—'} → {STATUS[
                  h.to
                ].label}{h.note ? ` · ${h.note}` : ''}
              </li>
            {/each}
          </ul>
        </div>
      </div>
    {:else}
      <p class="muted card">Ayrıntısını görmek için soldan bir bulgu seç.</p>
    {/if}
  </section>
</div>

<style>
  .head {
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .filters {
    margin-bottom: 12px;
  }

  .sep {
    width: 1px;
    height: 20px;
    background: var(--border);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(280px, 420px) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  @media (max-width: 1000px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .list {
    display: grid;
    gap: 8px;
    min-width: 0;
    max-height: calc(100vh - 220px);
    overflow-y: auto;
  }

  .item {
    display: grid;
    gap: 4px;
    width: 100%;
    min-width: 0;
    height: auto;
    padding: 10px 12px;
    text-align: left;
    white-space: normal;
  }

  .item.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .title {
    overflow-wrap: anywhere;
  }

  .detail {
    position: sticky;
    top: 16px;
  }

  .occ {
    gap: 6px;
  }

  dl {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 4px 12px;
    margin: 0;
  }

  dt {
    color: var(--muted);
    font-size: 12px;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .sighting {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-left: 3px solid var(--border);
  }

  .sighting p {
    margin: 0;
  }

  .decide {
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 8px;
    background: var(--panel-2);
  }

  .comment {
    padding: 6px 0;
    border-bottom: 1px dashed var(--border);
    white-space: pre-wrap;
  }

  .grow {
    flex: 1;
  }

  .history {
    margin: 0;
    padding-left: 18px;
  }
</style>
