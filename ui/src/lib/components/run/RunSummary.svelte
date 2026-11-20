<script lang="ts">
  import type { RunInfo } from '@argus/shared'
  import { formatDate } from '$lib/format'
  import { cn } from '$lib/utils'

  /**
   * Koşunun özeti (Yeni koşu ve Plan sayfasının sağ sütunundaki kart; yapışkanlığı sütun verir): kod, durum, uygulama, dal, oluşturulma zamanı
   * ve ek sayısı. Test kullanıcısı burada yoktur (Ayarlar'da belirlenir). Koşu başlatılmadan kod
   * önizlemedir; plan yazılırken ve sayfa yenilendikten sonra da kart durur.
   */
  let {
    run,
    code,
    project,
    application,
    environment,
  }: { run: RunInfo | null; code: string | null; project: string; application: string; environment: string } =
    $props()

  const STATE = {
    yok: { label: 'Başlatılmadı', tone: 'neutral' },
    hazirlaniyor: { label: 'Plan hazırlanıyor', tone: 'info' },
    duzenleniyor: { label: 'Plan yeniden yazılıyor', tone: 'info' },
    taslak: { label: 'Plan onay bekliyor', tone: 'warn' },
    onaylandi: { label: 'Plan onaylandı', tone: 'ok' },
  } as const
  const TONE = {
    neutral: 'border-[#e4e7ec] bg-[#f9fafb] text-[#344054]',
    info: 'border-[#cce0ff] bg-[#e9f2ff] text-[#0055cc]',
    warn: 'border-[#fedf89] bg-[#fffaeb] text-[#b54708]',
    ok: 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]',
  } as const

  const status = $derived(STATE[run?.planState ?? 'yok'])
  const files = $derived(run?.options.attachments?.length ?? 0)
</script>

<section class="bg-card text-card-foreground rounded-xl border">
  <header class="flex items-center justify-between gap-3 border-b px-5 py-4">
    <h2 class="text-base leading-[22px] font-semibold">Koşu</h2>
    <span class="font-mono text-[12.5px] text-[#344054]" title={run ? undefined : 'Koşu başlatılınca atanır'}
      >{code ?? '—'}</span
    >
  </header>
  <dl class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 text-[13px]">
    <dt class="text-muted-foreground">Durum</dt>
    <dd class="justify-self-end">
      <span class={cn('inline-flex h-6 items-center rounded-md border px-2 text-[12px] font-medium', TONE[status.tone])}
        >{status.label}</span
      >
    </dd>
    <dt class="text-muted-foreground">Uygulama</dt>
    <dd class="truncate text-right" title="{project} · {application}">{project} · {application}</dd>
    <dt class="text-muted-foreground">Dal</dt>
    <dd class="truncate text-right">{environment}</dd>
    <dt class="text-muted-foreground">Oluşturuldu</dt>
    <dd class="text-right tabular-nums">{run ? formatDate(run.createdAt) : '—'}</dd>
    <dt class="text-muted-foreground">Ek</dt>
    <dd class="text-right tabular-nums">{run ? (files ? `${files} dosya` : 'Yok') : '—'}</dd>
  </dl>
</section>
