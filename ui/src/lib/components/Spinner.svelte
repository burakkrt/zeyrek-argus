<script lang="ts">
  import { cn } from '$lib/utils'

  /**
   * Yükleme göstergesi; uygulamada tek biçim. `sm` 16 px (açılır menü, düğme, satır içi), `md` 20 px, `lg` 28 px (sayfa).
   * Halka gri (IMS Cortex yükleyicisi): açık gri iz, koyu gri dönen çeyrek. Yazı yerine kullanılır; "Yükleniyor" ekran okuyucuya söylenir.
   */
  let { size = 'sm', class: className }: { size?: 'sm' | 'md' | 'lg'; class?: string } = $props()

  const SIZES = { sm: 'size-4 border-2', md: 'size-5 border-2', lg: 'size-7 border-[3px]' } as const
</script>

<span
  class={cn(
    'border-border border-t-muted-foreground inline-block shrink-0 animate-spin rounded-full',
    SIZES[size],
    className,
  )}
  role="status"
  aria-label="Yükleniyor"
></span>
