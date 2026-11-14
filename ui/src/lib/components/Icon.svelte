<script lang="ts">
  import { icons, type IconName } from '$lib/icons'
  import { cn } from '$lib/utils'

  /**
   * İkon: Material Symbols Outlined. SVG'nin kendisi çizilir (sarmalayıcı yok) ki shadcn bileşenlerinin
   * `[&_svg:not([class*='size-'])]:size-4` gibi ikon kuralları işlesin. Varsayılan 20 px öznitelikle verilir (CSS her
   * zaman kazanır); boyut `class` ile (`size-4` …) ezilir, renk yazı rengidir. SVG paketten derleme anında gelir
   * (kullanıcı girdisi değildir), `@html` bu yüzden güvenlidir.
   */
  let { name, class: className }: { name: IconName; class?: string } = $props()

  const markup = $derived(
    icons[name].replace(
      /<svg[^>]*?viewBox="([^"]+)"[^>]*>/,
      (_m, viewBox: string) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="20" height="20" fill="currentColor" aria-hidden="true" data-slot="icon" class="${cn('shrink-0', className)}">`,
    ),
  )
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -->
{@html markup}
