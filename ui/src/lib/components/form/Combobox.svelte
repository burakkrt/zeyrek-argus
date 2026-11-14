<script lang="ts">
  import Icon from '$lib/components/Icon.svelte'
  import { tick } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Command from '$lib/components/ui/command/index.js'
  import * as Popover from '$lib/components/ui/popover/index.js'
  import { cn } from '$lib/utils'
  import { turkishFilter, type Option } from './options'

  /** Aramalı tekli seçim. Yerel `<select>` yerine kullanılır: arama Türkçe harfleri doğru eşler. */
  let {
    options,
    value = $bindable(null),
    placeholder = 'Seçin',
    searchPlaceholder = 'Ara…',
    empty = 'Sonuç bulunamadı.',
    disabled = false,
    invalid = false,
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
        {disabled}
        class="border-input w-full justify-between px-3 font-normal"
      >
        <span class={cn('truncate', !selected && 'text-muted-foreground')}
          >{selected?.label ?? placeholder}</span
        >
        <Icon name="unfoldMore" class="text-muted-foreground" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-(--bits-popover-anchor-width) min-w-60 p-0" align="start">
    <Command.Root filter={turkishFilter}>
      <Command.Input placeholder={searchPlaceholder} />
      <Command.List>
        <Command.Empty>{empty}</Command.Empty>
        <Command.Group>
          {#each options as option (option.value)}
            <Command.Item value={option.label} keywords={[option.value]} onSelect={() => pick(option.value)}>
              <Icon name="check" class={cn('text-primary', option.value !== value && 'invisible')} />
              <span class="truncate">{option.label}</span>
              {#if option.hint}<span class="text-muted-foreground ml-auto truncate text-xs"
                  >{option.hint}</span
                >{/if}
            </Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </Popover.Content>
</Popover.Root>
