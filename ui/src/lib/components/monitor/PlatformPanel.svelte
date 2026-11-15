<script lang="ts">
  import type { PlatformRead } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import { prettyJson } from '$lib/monitor'

  /**
   * Sahnede platform işlemi: o anki adım bir tanım okuması ya da platforma yazmaysa tarayıcı karesinin yerine araç,
   * girdisi ve sonucun başı gösterilir (izleme yalnız tarayıcı değildir; tanımdan çalışan koşu da izlenir).
   */
  let { read, failed }: { read: PlatformRead; failed: boolean } = $props()
</script>

<div
  class="bg-card absolute inset-0 flex flex-col overflow-hidden text-[12.5px]"
  aria-label="Platform işlemi"
>
  <div class="flex h-10 shrink-0 items-center gap-2 border-b px-4">
    <Icon name="database" class={failed ? 'text-destructive size-4' : 'text-brand size-4'} />
    <span class="font-semibold"
      >{read.write
        ? failed
          ? 'Platforma yazılamadı'
          : 'Platforma yazıldı'
        : failed
          ? 'Tanım okunamadı'
          : 'Tanım okundu'}</span
    >
    <code class="text-muted-foreground truncate font-mono text-xs">{read.tool}</code>
  </div>
  <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 p-4">
    <div>
      <p class="text-muted-foreground mb-1 text-xs">Girdi</p>
      <pre
        class="bg-muted max-h-28 overflow-auto rounded-md px-3 py-2 font-mono text-xs whitespace-pre-wrap">{prettyJson(
          read.input,
        ) || '{}'}</pre>
    </div>
    <div class="flex min-h-0 flex-col">
      <p class="text-muted-foreground mb-1 text-xs">Sonuç</p>
      <pre
        class="bg-muted min-h-0 flex-1 overflow-auto rounded-md px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">{prettyJson(
          read.result,
        )}</pre>
    </div>
  </div>
</div>
