<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import { tick } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { cn } from '$lib/utils'
  import { turkishFilter, type Option } from './options'

  /**
   * Aramalı tekli seçim. Yerel `<select>` yerine kullanılır: arama Türkçe harfleri doğru eşler.
   *
   * Açılır menü standardı (MultiCombobox da aynı): açıkken tetik mavi kenar + açık mavi halka; listede üzerine gelinen
   * öğe gri, seçili öğe açık mavi zemin + koyu mavi yazı (tik yok). `loading`: seçenekler okunurken tetik pasif
   * olur ve okunun yerinde gri spinner döner (IMS Cortex açılır menüsü gibi).
   */
  let {
    options,
    value = $bindable(null),
    placeholder = 'Seçin',
    searchPlaceholder = 'Ara…',
    empty = 'Sonuç bulunamadı.',
    disabled = false,
    invalid = false,
    loading = false,
    id,
    onchange,
  }: {
    options: Option[]
    value?: string | null
    placeholder?: string
    searchPlaceholder?: string
    empty?: string
    disabled?: boolean
    invalid?: boolean
    loading?: boolean
    id?: string
    onchange?: (value: string) => void
  } = $props()

  let open = $state(false)
  let trigger = $state<HTMLButtonElement | null>(null)
  const selected = $derived(options.find((o) => o.value === value))

  function pick(next: string) {
    value = next
    onchange?.(next)
    open = false
    tick().then(() => trigger?.focus())
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger bind:ref={trigger}>
    {#snippet child({ props })}
      <Button
        {...props}
        {id}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        class="border-input hover:border-muted-foreground/40 aria-expanded:border-brand aria-expanded:ring-brand/15 hover:bg-card aria-expanded:bg-card w-full justify-between px-3 font-normal aria-expanded:ring-3"
      >
        <span class={cn('truncate', !selected && 'text-muted-foreground')}
          >{selected?.label ?? (loading ? 'Yükleniyor…' : placeholder)}</span
        >
        {#if loading}<Spinner />{:else}<Icon name="unfoldMore" class="text-muted-foreground" />{/if}
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-(--bits-popover-anchor-width) min-w-60 gap-0 p-0" align="start">
    <Command.Root filter={turkishFilter}>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.List>
        <Command.Empty class="text-muted-foreground">{empty}</Command.Empty>
        <Command.Group class="p-0">
          {#each options as option (option.value)}
            {@const on = option.value === value}
            <Command.Item
              value={option.label}
              keywords={[option.value]}
              onSelect={() => pick(option.value)}
              class={cn(
                on &&
                  'bg-brand-soft text-brand-strong data-selected:bg-brand-soft data-selected:text-brand-strong font-medium',
              )}
            >
              <span class="min-w-0 flex-1 truncate">{option.label}</span>
              {#if option.hint}<span
                  class={cn('shrink-0 text-xs', on ? 'text-brand-strong/70' : 'text-muted-foreground')}
                  >{option.hint}</span
                >{/if}
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
