<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import { turkishFilter } from '$lib/components/form/options'
  import * as Command from '$lib/components/ui/command/index.js'
  import type { IconName } from '$lib/icons'
  import { NAV_GROUPS } from '$lib/nav'
  import { go } from '$lib/router.svelte'

  /** Ctrl+K komut paleti: menüdeki sayfalar arasında arama (Zeyrek kabuğundaki "Sayfa ya da içerik ara"). */
  let { open = $bindable(false) }: { open?: boolean } = $props()

  const pages: Array<{ path: string; label: string; icon: IconName; module?: string }> = NAV_GROUPS.flatMap(
    (g) => g.entries,
  ).flatMap((entry) =>
    entry.children
      ? entry.children.map((c) => ({ ...c, icon: entry.icon, module: entry.label }))
      : entry.path
        ? [{ path: entry.path, label: entry.label, icon: entry.icon }]
        : [],
  )

  function pick(path: string) {
    open = false
    go(`/${path}`)
  }
</script>

<Command.Dialog
  bind:open
  filter={turkishFilter}
  title="Sayfa ya da içerik ara"
  description="Gitmek istediğiniz sayfanın adını yazın"
  class="sm:max-w-[480px]"
>
  <Command.Input placeholder="Sayfa ya da içerik ara" />
  <Command.List>
    <Command.Empty>Sonuç bulunamadı.</Command.Empty>
    <Command.Group heading="Sayfalar">
      {#each pages as page (page.path)}
        <Command.Item
          value={page.label}
          keywords={[page.path, ...(page.module ? [page.module] : [])]}
          onSelect={() => pick(page.path)}
        >
          <Icon name={page.icon} class="text-muted-foreground" />
          <span>{page.label}</span>
          {#if page.module}<span class="text-muted-foreground ml-auto text-xs">{page.module}</span>{/if}
        </Command.Item>
      {/each}
    </Command.Group>
  </Command.List>
</Command.Dialog>
