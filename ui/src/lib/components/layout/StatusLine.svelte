<script lang="ts">
  import { cn } from '$lib/utils'

  /** Durum satırı: renkli nokta + kısa metin (bağlantı, anahtar, servis). */
  let { ok, label, title }: { ok: boolean; label: string; title?: string } = $props()
</script>

<div class="text-muted-foreground flex min-w-0 items-center gap-2 text-xs" {title}>
  <span class={cn('size-1.5 shrink-0 rounded-full', ok ? 'bg-success' : 'bg-destructive')}></span>
  <span class="truncate">{label}</span>
</div>
