<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js'
  import CommandPalette from './CommandPalette.svelte'

  /**
   * Üst çubuk (Zeyrek kabuğu): 56 px (kenar menü başlığıyla aynı), yapışkan, beyaz. Solda iz (14 px, ikincil renk, "/" ayraç; son öğe ana renk),
   * sağda sayfa araması (Ctrl+K komut paletini açar).
   */
  let { crumbs }: { crumbs: string[] } = $props()

  let paletteOpen = $state(false)

  function onKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      paletteOpen = !paletteOpen
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<header class="bg-card sticky top-0 z-30 flex h-14 shrink-0 items-center gap-6 border-b px-7">
  <Breadcrumb.Root class="min-w-0">
    <Breadcrumb.List class="text-muted-foreground flex-nowrap gap-2 text-sm sm:gap-2">
      {#each crumbs as crumb, i (i)}
        {#if i > 0}<Breadcrumb.Separator class="text-muted-foreground">/</Breadcrumb.Separator>{/if}
        <Breadcrumb.Item class="min-w-0">
          {#if i === crumbs.length - 1}
            <Breadcrumb.Page class="text-foreground truncate font-normal">{crumb}</Breadcrumb.Page>
          {:else}
            <span class="truncate">{crumb}</span>
          {/if}
        </Breadcrumb.Item>
      {/each}
    </Breadcrumb.List>
  </Breadcrumb.Root>

  <button
    type="button"
    onclick={() => (paletteOpen = true)}
    class="bg-surface-alt text-muted-foreground hover:border-input ml-auto flex h-9 w-[360px] shrink-0 items-center gap-2.5 rounded-lg border px-3 text-sm transition-colors"
  >
    <Icon name="search" class="size-[18px]" />
    <span class="flex-1 text-left">Sayfa ya da içerik ara</span>
    <kbd
      class="bg-card text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none"
      >Ctrl K</kbd
    >
  </button>
</header>

<CommandPalette bind:open={paletteOpen} />
