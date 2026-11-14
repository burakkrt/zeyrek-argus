<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import type { IconName } from '$lib/icons'

  /**
   * Boş durum: kesik çizgili kutu, ikon, başlık, tek cümle ve isteğe bağlı eylem (platform standardı). Liste, tablo ve
   * panel boşken bununla gösterilir.
   */
  let {
    title,
    description,
    icon = 'inbox',
    action,
  }: { title: string; description?: string; icon?: IconName; action?: Snippet } = $props()
</script>

<div class="flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-6 py-10 text-center">
  <Icon name={icon} class="text-muted-foreground mb-1 size-7" />
  <p class="font-semibold">{title}</p>
  {#if description}<p class="text-muted-foreground text-[13px]">{description}</p>{/if}
  {#if action}<div class="mt-3">{@render action()}</div>{/if}
</div>
