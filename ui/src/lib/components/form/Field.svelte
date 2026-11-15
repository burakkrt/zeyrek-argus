<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Label } from '$lib/components/ui/label/index.js'

  /**
   * Form alanı kalıbı: etiket (zorunluysa işaretli), kontrol, altında açıklama ya da hata. Formdaki her kontrol bununla
   * sarılır; hata varsa açıklamanın yerini alır.
   *
   * Kontrol bir düğmeyse (açılır menü tetiği) etikete tıklamak onu yalnız odaklar: tarayıcı etiket tıklamasını düğmeye
   * tıklama sayar ve açık bir menüyü kapatıp bu menüyü açıyordu.
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

  function focusOnly(event: MouseEvent) {
    const target = htmlFor ? document.getElementById(htmlFor) : null
    if (target instanceof HTMLButtonElement) {
      event.preventDefault()
      target.focus()
    }
  }
</script>

<div class="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
  <Label for={htmlFor} class="gap-1" onclick={focusOnly}>
    {label}{#if required}<span class="text-destructive" aria-hidden="true">*</span>{/if}
  </Label>
  {@render children()}
  {#if error}
    <p class="text-destructive text-xs">{error}</p>
  {:else if description}
    <p class="text-muted-foreground text-xs">{description}</p>
  {/if}
</div>
