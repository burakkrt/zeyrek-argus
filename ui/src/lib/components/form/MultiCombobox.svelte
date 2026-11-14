<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { cn } from '$lib/utils'
  import { summarizeSelection, turkishFilter, type Option } from './options'

  /** Aramalı çoklu seçim: işaretli seçenekler, altta "tümünü seç" ve "temizle". Pencere seçimde kapanmaz. */
  let {
    options,
    value = $bindable([]),
    placeholder = 'Seçin',
    searchPlaceholder = 'Ara…',
    empty = 'Sonuç bulunamadı.',
    disabled = false,
    id,
  }: {
    options: Option[]
    value?: string[]
    placeholder?: string
    searchPlaceholder?: string
    empty?: string
    disabled?: boolean
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
        {disabled}
        class="border-input w-full justify-between px-3 font-normal"
      >
        <span class={cn('truncate', !value.length && 'text-muted-foreground')}>{label}</span>
        <Icon name="unfoldMore" class="text-muted-foreground" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-(--bits-popover-anchor-width) min-w-64 p-0" align="start">
    <Command.Root filter={turkishFilter}>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.List>
        <Command.Empty>{empty}</Command.Empty>
        <Command.Group>
          {#each options as option (option.value)}
            {@const on = value.includes(option.value)}
            <Command.Item
              value={option.label}
              keywords={[option.value]}
              onSelect={() => toggle(option.value)}
            >
              <span
                class={cn(
                  'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                )}
              >
                {#if on}<Icon name="check" class="size-3" />{/if}
              </span>
              <span class="truncate">{option.label}</span>
              {#if option.hint}<span class="text-muted-foreground ml-auto truncate text-xs"
                  >{option.hint}</span
                >{/if}
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
