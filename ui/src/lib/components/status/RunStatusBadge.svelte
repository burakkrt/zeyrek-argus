<script lang="ts">
  import type { RunStatus } from '@argus/shared'
  import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js'
  import { RUN_STATUS } from '$lib/format'
  import { cn } from '$lib/utils'

  /** Koşu durumu: açık zeminli, renkli noktalı 22 px etiket (platformun tablo durum etiketi). */
  const VARIANT: Record<RunStatus, BadgeVariant> = {
    sirada: 'info',
    calisiyor: 'info',
    bitti: 'success',
    hata: 'error',
    durduruldu: 'warning',
  }

  let { status }: { status: RunStatus } = $props()
</script>

<Badge variant={VARIANT[status]}>
  <span class={cn('size-1.5 rounded-full bg-current', status === 'calisiyor' && 'animate-pulse')}></span>
  {RUN_STATUS[status].label}
</Badge>
