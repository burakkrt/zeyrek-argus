<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { Skeleton } from '$lib/components/ui/skeleton/index.js'
  import { workspace } from '$lib/workspace.svelte'
  import Modal from './Modal.svelte'
  import WorkspaceForm from './WorkspaceForm.svelte'

  /**
   * Kenar menünün dibindeki çalışma alanı kartı: uygulama adı ve proje · dal; tıklayınca değiştirme penceresi açılır.
   * Şeritte yalnız uygulamanın baş harfi görünür, adı ipucudur. Çalışma alanı gelene kadar aynı ölçüde iskelet durur
   * (kart kaybolup gelmez, menü zıplamaz).
   */
  const sidebar = Sidebar.useSidebar()
  let open = $state(false)
  let canSubmit = $state(false)
  let saving = $state(false)

  const current = $derived(workspace.current)
  const appName = $derived(workspace.labels?.application ?? current?.application ?? '')
  const detail = $derived(
    current ? `${workspace.labels?.project ?? current.project} · ${current.environment}` : '',
  )
  const box =
    'flex h-12 w-full items-center gap-2.5 rounded-lg border px-2.5 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0'
</script>

{#if !workspace.ready}
  <div class={box} aria-hidden="true">
    <Skeleton class="size-7 shrink-0" />
    <span class="grid flex-1 gap-1.5 group-data-[collapsible=icon]:hidden">
      <Skeleton class="h-3 w-20" />
      <Skeleton class="h-2.5 w-32" />
    </span>
  </div>
{:else if current}
  <button
    type="button"
    onclick={() => (open = true)}
    class="{box} hover:bg-secondary text-left transition-colors"
    title={sidebar.open ? 'Çalışma alanını değiştir' : `${appName} · ${detail}`}
    aria-label="Çalışma alanını değiştir"
  >
    <span
      class="bg-brand-soft text-brand-strong grid size-7 shrink-0 place-items-center rounded-md text-[13px] font-semibold"
      >{appName.slice(0, 1).toLocaleUpperCase('tr')}</span
    >
    <span class="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
      <span class="block truncate text-sm leading-[18px] font-semibold">{appName}</span>
      <span class="text-muted-foreground block truncate text-xs leading-4">{detail}</span>
    </span>
    <Icon name="unfoldMore" class="text-muted-foreground size-[18px] group-data-[collapsible=icon]:hidden" />
  </button>
{/if}

<Modal
  bind:open
  title="Çalışma alanını değiştir"
  description="Arayüz seçtiğin proje, uygulama ve dala göre baştan yüklenir."
>
  {#if open}
    <WorkspaceForm
      id="calisma-alani-degistir"
      initial={current}
      bind:canSubmit
      bind:saving
      ondone={() => (open = false)}
    />
  {/if}
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
    <Button type="submit" form="calisma-alani-degistir" disabled={!canSubmit}>
      {saving ? 'Geçiliyor…' : 'Çalışma alanına geç'}
    </Button>
  {/snippet}
</Modal>
