<script lang="ts">
  /** Küçük ekran görüntüsü; tıklanınca tam ekran büyür (Esc ya da tık kapatır). */
  let {
    src,
    alt = 'Ekran görüntüsü',
    width = 160,
    height = 100,
  }: { src: string | null; alt?: string; width?: number; height?: number } = $props()
  let open = $state(false)

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false
  }
</script>

<svelte:window onkeydown={onKey} />

{#if src}
  <button class="wrap" onclick={() => (open = true)} title="Büyüt">
    <img class="thumb" {src} {alt} style={`width:${width}px;height:${height}px`} loading="lazy" />
  </button>
  {#if open}
    <button class="overlay" onclick={() => (open = false)} aria-label="Kapat">
      <img {src} {alt} />
    </button>
  {/if}
{/if}

<style>
  .wrap {
    padding: 0;
    border: 0;
    height: auto;
    background: none;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: grid;
    place-items: center;
    padding: 24px;
    height: auto;
    border: 0;
    border-radius: 0;
    background: rgba(8, 10, 20, 0.82);
    cursor: zoom-out;
  }

  .overlay img {
    max-width: 100%;
    max-height: 100%;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
</style>
