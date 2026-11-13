<script lang="ts">
  import type { AppRef, MemoryBudget, Proposal, Rule } from '@argus/shared'
  import { onMount } from 'svelte'
  import { api, post, put, qs } from '../lib/api'
  import { formatDate, SCOPE_LABEL, TYPE_LABEL } from '../lib/format'

  type RuleRow = Rule & { stats: { uses: number; eligible: number; lastUsed: string | null } }

  let tab = $state<'kurallar' | 'oneriler' | 'dosyalar' | 'musteri'>('kurallar')
  let apps = $state<AppRef[]>([])
  let app = $state('')
  let rules = $state<RuleRow[]>([])
  let budgets = $state<MemoryBudget[]>([])
  let pendingDecisions = $state(0)
  let proposals = $state<Proposal[]>([])
  let files = $state<Array<{ path: string; size: number }>>([])
  let filePath = $state('')
  let fileContent = $state('')
  let fileSaved = $state('')
  let busy = $state('')
  let error = $state('')
  let info = $state('')
  let newRule = $state({ kapsam: 'uygulama', tur: 'sorun', metin: '', desen: '' })
  let customer = $state<{
    rows: number
    classes: { istek: number; veri: number; hata: number } | null
    proposals: Proposal[]
  } | null>(null)

  const appRef = $derived(app ? { proje: app.split('/')[0]!, uygulama: app.split('/')[1]! } : null)
  const byState = (state: Rule['state']) => rules.filter((r) => r.state === state)
  const waiting = $derived(proposals.filter((p) => p.status === 'bekliyor'))

  async function run<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
    busy = label
    error = ''
    try {
      return await work()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      return undefined
    } finally {
      busy = ''
    }
  }

  async function loadRules() {
    const result = await run('', () =>
      api<{ rules: RuleRow[]; budgets: MemoryBudget[]; pendingDecisions: number }>(
        `/hafiza/kurallar${qs(appRef ?? {})}`,
      ),
    )
    if (result) {
      rules = result.rules
      budgets = result.budgets
      pendingDecisions = result.pendingDecisions
    }
  }

  async function loadProposals() {
    proposals = (await run('', () => api<Proposal[]>(`/hafiza/oneriler${qs(appRef ?? {})}`))) ?? []
  }

  async function loadFiles() {
    files = (await run('', () => api<Array<{ path: string; size: number }>>('/hafiza/dosyalar'))) ?? []
  }

  async function reload() {
    await Promise.all([loadRules(), loadProposals()])
  }

  $effect(() => {
    void app
    void reload()
  })

  async function setState(rule: RuleRow, durum: Rule['state']) {
    await run('Kaydediliyor…', () =>
      post('/hafiza/kurallar/durum', {
        id: rule.id,
        durum,
        ...(rule.app ? { proje: rule.app.project, uygulama: rule.app.application } : {}),
      }),
    )
    await loadRules()
  }

  async function addRule() {
    if (!newRule.metin.trim()) return
    await run('Kural yazılıyor…', () => post('/hafiza/kurallar', { ...newRule, ...(appRef ?? {}) }))
    newRule = { ...newRule, metin: '', desen: '' }
    await loadRules()
  }

  async function learn() {
    if (!appRef) return
    const result = await run('Ders çıkarılıyor…', () => post<Proposal[]>('/hafiza/ogren', appRef))
    if (result)
      info = result.length
        ? `${result.length} öneri: ${result.filter((p) => p.status === 'otomatik').length} kendiliğinden devrede, ${result.filter((p) => p.status === 'bekliyor').length} onay bekliyor.`
        : 'Çıkarılacak yeni ders yok.'
    tab = 'oneriler'
    await reload()
  }

  async function maintain(model: boolean) {
    if (!appRef) return
    const result = await run(model ? 'Yapay zekâyla bakım…' : 'Bakım…', () =>
      post<Proposal[]>('/hafiza/bakim', { ...appRef, model }),
    )
    if (result)
      info = result.length
        ? `${result.length} bakım önerisi onay bekliyor.`
        : 'Bakım önerisi yok; hafıza temiz.'
    tab = 'oneriler'
    await reload()
  }

  async function decideProposal(p: Proposal, accept: boolean) {
    await run('Kaydediliyor…', () => post(`/hafiza/oneriler/${p.id}/${accept ? 'kabul' : 'ret'}`))
    await reload()
  }

  async function openFile(path: string) {
    const result = await run('', () => api<{ content: string }>(`/hafiza/dosya${qs({ yol: path })}`))
    if (result) {
      filePath = path
      fileContent = result.content
      fileSaved = result.content
    }
  }

  async function saveFile() {
    const ok = await run('Kaydediliyor…', () => put('/hafiza/dosya', { yol: filePath, icerik: fileContent }))
    if (ok) {
      fileSaved = fileContent
      info = `${filePath} kaydedildi.`
      await loadRules()
    }
  }

  async function syncMemory() {
    const result = await run('Hafıza yeniden okunuyor…', () =>
      post<Array<{ decisions: number }>>('/hafiza/yenile'),
    )
    if (result) info = `Hafıza yeniden okundu: ${result.reduce((n, r) => n + r.decisions, 0)} karar.`
    await Promise.all([loadFiles(), reload()])
  }

  async function uploadCustomer(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !appRef) return
    const form = new FormData()
    form.set('dosya', file)
    form.set('proje', appRef.proje)
    form.set('uygulama', appRef.uygulama)
    customer =
      (await run('Müşteri bulguları okunuyor ve ders çıkarılıyor…', () =>
        api('/hafiza/musteri', { method: 'POST', body: form }),
      )) ?? null
    input.value = ''
    await reload()
  }

  onMount(async () => {
    apps = await api<AppRef[]>('/hafiza/uygulamalar').catch(() => [])
    if (apps[0]) app = `${apps[0].project}/${apps[0].application}`
    await loadFiles()
  })
</script>

<div class="row head">
  <div>
    <h1>Hafıza</h1>
    <p class="muted">
      Kontrolcünün öğrendikleri. Hepsi <code>memory/</code> altında düz dosya: Git'e girer, takım pull alınca aynı
      bilgiyle çalışır.
    </p>
  </div>
  <span class="spacer"></span>
  <select bind:value={app}>
    {#each apps as a (`${a.project}/${a.application}`)}<option value={`${a.project}/${a.application}`}
        >{a.project}/{a.application}</option
      >{/each}
  </select>
  <button onclick={learn} disabled={!appRef || !!busy}
    >Öğren{pendingDecisions ? ` (${pendingDecisions} yeni karar)` : ''}</button
  >
  <button onclick={() => maintain(false)} disabled={!appRef || !!busy}>Bakım</button>
  <button
    onclick={() => maintain(true)}
    disabled={!appRef || !!busy}
    title="Benzer kuralları birleştirme ve kısaltma önerileri (yapay zekâ)">Bakım (YZ)</button
  >
</div>

{#if error}<p class="error">{error}</p>{/if}
{#if info}<p class="notice">{info}</p>{/if}
{#if busy}<p class="muted small">{busy}</p>{/if}

<div class="tabs">
  <button class:active={tab === 'kurallar'} onclick={() => (tab = 'kurallar')}
    >Kurallar ({rules.filter((r) => r.state !== 'emekli').length})</button
  >
  <button class:active={tab === 'oneriler'} onclick={() => (tab = 'oneriler')}
    >Öneriler{waiting.length ? ` (${waiting.length})` : ''}</button
  >
  <button class:active={tab === 'dosyalar'} onclick={() => (tab = 'dosyalar')}>Dosyalar</button>
  <button class:active={tab === 'musteri'} onclick={() => (tab = 'musteri')}>Müşteri bulguları</button>
</div>

{#if tab === 'kurallar'}
  {#if budgets.length}
    <section class="card budgets">
      <h3>İstem bütçesi (sayfa başına, tahmini token)</h3>
      {#each budgets as b (b.scope)}
        <div class="budget">
          <span class="small">{SCOPE_LABEL(b.scope)} · {b.rules} kural</span>
          <div class="bar">
            <div
              class:over={b.tokens > b.limit}
              style={`width:${Math.min(100, (b.tokens / b.limit) * 100)}%`}
            ></div>
          </div>
          <span class="small muted">{b.tokens} / {b.limit}</span>
        </div>
      {/each}
      <p class="muted small">
        Deseni olan kurallar bütçeye girmez: token harcamadan göz olarak koşar. Bütçe dolarsa Bakım önerir.
      </p>
    </section>
  {/if}

  {#each [{ state: 'aday' as const, title: 'Onay bekleyen kurallar' }, { state: 'onayli' as const, title: 'Devredeki kurallar' }] as group (group.state)}
    <section class="card stack">
      <h2>{group.title} ({byState(group.state).length})</h2>
      {#each byState(group.state) as rule (rule.file)}
        <div class="rule">
          <div class="row">
            <span class={`badge ${TYPE_LABEL[rule.type]!.tone}`}>{TYPE_LABEL[rule.type]!.label}</span>
            <span class="badge">{SCOPE_LABEL(rule.scope)}</span>
            {#if rule.pattern}<span
                class="badge info"
                title="Belirlenimci göz: ekranda bu düzenli ifade aranır">desen: {rule.pattern}</span
              >{/if}
            <code class="muted">{rule.id}</code>
            <span class="spacer"></span>
            <span class="muted small" title="Bulgulardaki atıf / isteme girdiği sayfa"
              >kullanım {rule.stats.uses} / {rule.stats.eligible}</span
            >
            {#if rule.state === 'aday'}<button class="small primary" onclick={() => setState(rule, 'onayli')}
                >Onayla</button
              >{/if}
            <button class="small" onclick={() => setState(rule, 'emekli')}
              >{rule.state === 'aday' ? 'Reddet' : 'Emekliye ayır'}</button
            >
            <button class="small ghost" onclick={() => ((tab = 'dosyalar'), openFile(rule.file))}
              >Düzenle</button
            >
          </div>
          <div>{rule.text}</div>
          {#if rule.sources.length}<div class="muted small">
              Kaynak: {rule.sources.join(', ')} · {rule.author} · {rule.date}
            </div>{/if}
        </div>
      {:else}<p class="muted small">Yok.</p>{/each}
    </section>
  {/each}

  <section class="card stack">
    <h2>Elle kural ekle</h2>
    <div class="row">
      <select bind:value={newRule.tur}>
        <option value="sorun">Sorun ara</option>
        <option value="sorun-degil">Sorun sayma</option>
        <option value="bilgi">Bilgi</option>
      </select>
      <input bind:value={newRule.kapsam} placeholder="uygulama | platform | modul:pf | sayfa:pf-karne" />
      <input bind:value={newRule.desen} placeholder="desen (isteğe bağlı, ör. [âîû])" />
    </div>
    <textarea rows="2" bind:value={newRule.metin} placeholder="Tek cümle: ne aranır ya da ne bulgu sayılmaz."
    ></textarea>
    <div><button class="primary" onclick={addRule} disabled={!newRule.metin.trim()}>Kural ekle</button></div>
  </section>

  {#if byState('emekli').length}
    <details class="card">
      <summary>Emekli kurallar ({byState('emekli').length})</summary>
      {#each byState('emekli') as rule (rule.file)}
        <div class="rule muted">
          <div class="row">
            <code>{rule.id}</code><span class="spacer"></span><button
              class="small"
              onclick={() => setState(rule, 'onayli')}>Yeniden devreye al</button
            >
          </div>
          <div>{rule.text}</div>
        </div>
      {/each}
    </details>
  {/if}
{:else if tab === 'oneriler'}
  <section class="card stack">
    <h2>Onay bekleyen öneriler ({waiting.length})</h2>
    <p class="muted small">
      "Sorun sayma" kuralları ve devredeki kuralları değiştiren öneriler hep onay bekler: görmezden gelmeyi
      öğrenmek tehlikelidir.
    </p>
    {#each waiting as p (p.id)}
      <div class="rule">
        <div class="row">
          <span class="badge accent">{p.action}</span>
          <span class={`badge ${TYPE_LABEL[p.rule.type]!.tone}`}>{TYPE_LABEL[p.rule.type]!.label}</span>
          <span class="badge">{SCOPE_LABEL(p.rule.scope)}</span>
          <code class="muted">{p.rule.id}</code>
          <span class="muted small">· {p.origin}</span>
          <span class="spacer"></span>
          <button class="small primary" onclick={() => decideProposal(p, true)}>Kabul</button>
          <button class="small" onclick={() => decideProposal(p, false)}>Ret</button>
        </div>
        <div>{p.rule.text}</div>
        {#if p.related.length}<div class="small muted">İlgili: {p.related.join(', ')}</div>{/if}
        <div class="small muted">
          Gerekçe: {p.reason}{p.sources.length ? ` · kaynak: ${p.sources.join(', ')}` : ''}
        </div>
      </div>
    {:else}<p class="muted small">Bekleyen öneri yok.</p>{/each}
  </section>
  <section class="card">
    <h2>Geçmiş</h2>
    <table>
      <tbody>
        {#each proposals.filter((p) => p.status !== 'bekliyor') as p (p.id)}
          <tr>
            <td class="small">{formatDate(p.createdAt)}</td>
            <td
              ><span class={`badge ${p.status === 'ret' ? '' : 'ok'}`}
                >{p.status === 'otomatik' ? 'kendiliğinden' : p.status}</span
              ></td
            >
            <td class="small"><code>{p.rule.id}</code> — {p.rule.text}</td>
            <td
              >{#if p.status === 'otomatik'}<button class="small" onclick={() => decideProposal(p, false)}
                  >Geri al</button
                >{/if}</td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{:else if tab === 'dosyalar'}
  <div class="files">
    <section class="card tree">
      <div class="row">
        <h2>memory/</h2>
        <span class="spacer"></span><button
          class="small"
          onclick={syncMemory}
          title="git pull sonrası kararları ve kuralları yeniden oku">Yenile</button
        >
      </div>
      {#each files as f (f.path)}
        <button class="file" class:active={f.path === filePath} onclick={() => openFile(f.path)}
          >{f.path}</button
        >
      {/each}
    </section>
    <section class="card stack">
      {#if filePath}
        <div class="row">
          <code>{filePath}</code>
          <span class="spacer"></span>
          {#if fileContent !== fileSaved}<span class="badge warn">kaydedilmedi</span>{/if}
          <button class="primary" onclick={saveFile} disabled={fileContent === fileSaved}>Kaydet</button>
        </div>
        <textarea class="editor mono" rows="26" bind:value={fileContent} spellcheck="false"></textarea>
        <p class="muted small">
          Kural dosyası: <code>kapsam</code> (platform | uygulama | modul:önek | sayfa:slug), <code>tur</code>
          (sorun | sorun-degil | bilgi), <code>durum</code> (aday | onayli | emekli), isteğe bağlı
          <code>desen</code>. Bozuk dosya kaydedilmez.
        </p>
      {:else}
        <p class="muted">
          Soldan bir dosya seç. Kurallar, kararlar, uygulama notları ve çıktı biçimleri burada düz metin.
        </p>
      {/if}
    </section>
  </div>
{:else}
  <section class="card stack">
    <h2>Müşteri bulgularını içe aktar</h2>
    <p class="muted">
      Excel (.xlsx) yükle. Satırlar <code>memory/apps/…/customer/</code> altına yazılır ve isteme hiç girmez; ders
      çıkarıcı satırları istek / veri / hata diye ayırır ve tekrarlayan hata türlerinden kural önerir.
    </p>
    <label class="button" class:disabled={!appRef}
      >Excel seç<input
        type="file"
        accept=".xlsx"
        hidden
        onchange={uploadCustomer}
        disabled={!appRef}
      /></label
    >
    {#if customer}
      <div class="notice">
        {customer.rows} satır okundu.
        {#if customer.classes}İstek {customer.classes.istek} · veri {customer.classes.veri} · hata {customer
            .classes.hata}.
        {/if}
        {customer.proposals.length} kural önerisi ({customer.proposals.filter((p) => p.status === 'otomatik')
          .length} kendiliğinden devrede).
      </div>
    {/if}
  </section>
{/if}

<style>
  .head {
    align-items: flex-start;
    margin-bottom: 8px;
  }

  section {
    margin-bottom: 12px;
  }

  .budgets {
    display: grid;
    gap: 6px;
  }

  .budget {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr) 90px;
    gap: 10px;
    align-items: center;
  }

  .bar {
    height: 8px;
    border-radius: 99px;
    background: var(--panel-2);
    overflow: hidden;
  }

  .bar div {
    height: 100%;
    background: var(--accent);
  }

  .bar div.over {
    background: var(--fail);
  }

  .rule {
    display: grid;
    gap: 4px;
    padding: 10px 0;
    border-top: 1px solid var(--border);
    overflow-wrap: anywhere;
  }

  .files {
    display: grid;
    grid-template-columns: minmax(240px, 340px) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }

  .tree {
    display: grid;
    gap: 2px;
    max-height: calc(100vh - 230px);
    overflow-y: auto;
  }

  .file {
    justify-content: flex-start;
    height: auto;
    padding: 4px 8px;
    border: 0;
    font-family: var(--mono);
    font-size: 12px;
    white-space: normal;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .file.active {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .editor {
    min-height: 420px;
  }
</style>
