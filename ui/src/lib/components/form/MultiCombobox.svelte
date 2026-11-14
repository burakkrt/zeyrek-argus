<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import Spinner from '$lib/components/Spinner.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { cn } from '$lib/utils'
  import { summarizeSelection, turkishFilter, type Option } from './options'

  /**
   * Aramalı çoklu seçim: işaretli seçenekler, altta "tümünü seç" ve "temizle". Pencere seçimde kapanmaz. Görünüm ve
   * `loading` Combobox'taki açılır menü standardıdır.
   */
  let {
    options,
    value = $bindable([]),
    placeholder = 'Seçin',
    searchPlaceholder = 'Ara…',
    empty = 'Sonuç bulunamadı.',
    disabled = false,
    loading = false,
    id,
  }: {
    options: Option[]
    value?: string[]
    placeholder?: string
    searchPlaceholder?: string
    empty?: string
    disabled?: boolean
    loading?: boolean
    id?: string
  } = $props()

  let open = $state(false)
  const label = $derived(summarizeSelection(options, value, placeholder))

  const toggle = (v: string) => (value = value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        {id}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        class="border-input hover:border-muted-foreground/40 aria-expanded:border-brand aria-expanded:ring-brand/10 hover:bg-card aria-expanded:bg-card w-full justify-between px-3 font-normal aria-expanded:ring-2"
      >
        <span class={cn('truncate', !value.length && 'text-placeholder')}
          >{loading && !value.length ? 'Yükleniyor…' : label}</span
        >
        {#if loading}<Spinner />{:else}<Icon name="unfoldMore" class="text-muted-foreground" />{/if}
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-(--bits-popover-anchor-width) min-w-64 gap-0 p-0" align="start">
    <Command.Root filter={turkishFilter}>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.List>
        <Command.Empty class="text-muted-foreground">{empty}</Command.Empty>
        <Command.Group class="p-0">
          {#each options as option (option.value)}
            {@const on = value.includes(option.value)}
            <Command.Item
              value={option.label}
              keywords={[option.value]}
              onSelect={() => toggle(option.value)}
              class={cn(
                on &&
                  'bg-brand-soft text-brand-strong data-selected:bg-brand-soft data-selected:text-brand-strong font-medium',
              )}
            >
              <span
                class={cn(
                  'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                )}
              >
                {#if on}<Icon name="check" class="size-3" />{/if}
              </span>
              <span class="min-w-0 flex-1 truncate">{option.label}</span>
              {#if option.hint}<span class="text-muted-foreground shrink-0 text-xs">{option.hint}</span>{/if}
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
      <div class="flex items-center justify-between border-t p-1.5">
        <Button variant="ghost" size="sm" onclick={() => (value = options.map((o) => o.value))}
          >Tümünü seç</Button
        >
        <Button variant="ghost" size="sm" disabled={!value.length} onclick={() => (value = [])}
          >Temizle</Button
        >
      </div>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
