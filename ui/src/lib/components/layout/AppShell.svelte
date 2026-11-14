<script lang="ts">
  import type { Snippet } from 'svelte'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import TopBar from './TopBar.svelte'

  /**
   * Uygulama kabuğu (Zeyrek kabuğu): solda kenar menü (264 px, 64 px ikon şeridine daralır), sağda yapışkan üst çubuk ve
   * sayfa. Sayfanın başlık şeridi ve içeriği `Page` ile çizilir.
   */
  let { sidebar, crumbs, children }: { sidebar: Snippet; crumbs: string[]; children: Snippet } = $props()
</script>

<Sidebar.Provider>
  {@render sidebar()}
  <Sidebar.Inset class="min-w-0">
    <TopBar {crumbs} />
    <main class="min-w-0 flex-1">{@render children()}</main>
  </Sidebar.Inset>
</Sidebar.Provider>
