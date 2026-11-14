<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Label } from '$lib/components/ui/label/index.js'

  /**
   * Form alanı kalıbı: etiket (zorunluysa işaretli), kontrol, altında açıklama ya da hata. Formdaki her kontrol bununla
   * sarılır; hata varsa açıklamanın yerini alır.
   */
  let {
    label,
    for: htmlFor,
    description,
    error,
    required = false,
    children,
  }: {
    label: string
    for?: string
    description?: string
    error?: string | null
    required?: boolean
    children: Snippet
  } = $props()
</script>

<div class="grid min-w-0 gap-2">
  <Label for={htmlFor} class="gap-1">
    {label}{#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
  </Label>
  {@render children()}
  {#if error}
    <p class="text-destructive text-xs">{error}</p>
  {:else if description}
    <p class="text-muted-foreground text-xs">{description}</p>
  {/if}
</div>
