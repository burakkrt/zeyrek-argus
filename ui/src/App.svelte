<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from './lib/api'
  import { route, go } from './lib/router.svelte'
  import { connect, live } from './lib/stream.svelte'
  import Start from './views/Start.svelte'
  import Monitor from './views/Monitor.svelte'
  import Runs from './views/Runs.svelte'
  import Issues from './views/Issues.svelte'
  import Memory from './views/Memory.svelte'
  import Settings from './views/Settings.svelte'

  interface Status {
    mcp: { ok: boolean; detail: string }
    anthropic: { set: boolean; source: string | null; hint: string | null }
    activeRunId: string | null
  }

  let status = $state<Status | null>(null)
  const activeRun = $derived(
    Object.values(live.runs).find((r) => r.status === 'calisiyor') ??
      (status?.activeRunId ? { id: status.activeRunId } : null),
  )

  const nav = [
    { path: 'baslat', label: 'Başlat', icon: '▶' },
    { path: 'kosular', label: 'Koşular', icon: '◷' },
    { path: 'bulgular', label: 'Bulgular', icon: '⚑' },
    { path: 'hafiza', label: 'Hafıza', icon: '◈' },
    { path: 'ayarlar', label: 'Ayarlar', icon: '⚙' },
  ]

  onMount(() => {
    connect()
    api<Status>('/durum')
      .then((s) => (status = s))
      .catch(() => undefined)
  })
</script>

<div class="shell">
  <aside>
    <a class="brand" href="#/baslat">
      <span class="eye"></span>
      <span><strong>Zeyrek Argus</strong><br /><span class="muted small">Kalite kontrolcüsü</span></span>
    </a>
    <nav>
      {#each nav as item (item.path)}
        <a class:active={route.parts[0] === item.path} href={`#/${item.path}`}
          ><span class="icon">{item.icon}</span>{item.label}</a
        >
      {/each}
      {#if activeRun}
        <button class="live" onclick={() => go(`/monitor/${activeRun.id}`)}>
          <span class="pulse"></span> Canlı koşu
        </button>
      {/if}
    </nav>
    <div class="status small">
      <div>
        <span class="dot" class:on={live.connected}></span>
        {live.connected ? 'Sunucuya bağlı' : 'Bağlantı yok'}
      </div>
      {#if status}
        <div title={status.mcp.detail}>
          <span class="dot" class:on={status.mcp.ok}></span> MCP {status.mcp.ok
            ? status.mcp.detail
            : 'ayarlı değil'}
        </div>
        <div>
          <span class="dot" class:on={status.anthropic.set}></span> Yapay zekâ {status.anthropic.set
            ? status.anthropic.hint
            : 'anahtar yok'}
        </div>
      {/if}
    </div>
  </aside>
  <main>
    {#if route.parts[0] === 'monitor' && route.parts[1]}
      {#key route.parts[1]}<Monitor runId={route.parts[1]} />{/key}
    {:else if route.parts[0] === 'kosular'}
      <Runs />
    {:else if route.parts[0] === 'bulgular'}
      <Issues selectedId={route.parts[1] ?? null} />
    {:else if route.parts[0] === 'hafiza'}
      <Memory />
    {:else if route.parts[0] === 'ayarlar'}
      <Settings />
    {:else}
      <Start />
    {/if}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    min-height: 100vh;
  }

  aside {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 18px 14px;
    background: var(--panel);
    border-right: 1px solid var(--border);
  }

  .brand {
    display: flex;
    gap: 10px;
    align-items: center;
    color: var(--text);
    text-decoration: none;
    line-height: 1.25;
  }

  .eye {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: radial-gradient(circle, #1e1b4b 0 22%, #fff 23% 42%, var(--accent) 43%);
    flex: none;
  }

  nav {
    display: grid;
    gap: 2px;
  }

  nav a {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    color: var(--text);
    text-decoration: none;
  }

  nav a:hover {
    background: var(--panel-2);
  }

  nav a.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 600;
  }

  .icon {
    width: 18px;
    text-align: center;
    opacity: 0.8;
  }

  .live {
    margin-top: 8px;
    justify-content: flex-start;
    border-color: var(--accent);
    color: var(--accent);
  }

  .pulse {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--fail);
    animation: pulse 1.2s infinite;
  }

  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }

  .status {
    margin-top: auto;
    display: grid;
    gap: 4px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--fail);
    margin-right: 4px;
  }

  .dot.on {
    background: var(--ok);
  }

  main {
    padding: 22px 26px;
    min-width: 0;
  }

  @media (max-width: 800px) {
    .shell {
      grid-template-columns: 1fr;
    }

    aside {
      position: static;
      height: auto;
    }
  }
</style>
