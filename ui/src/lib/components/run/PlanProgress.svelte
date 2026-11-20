<script lang="ts">
  import type { RunEvent, RunInfo } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import { quietApi } from '$lib/api'
  import { plainCall } from '$lib/platform-steps'
  import { stripVoiceNote, VOICE_NOTE } from '$lib/dictation'
  import { subscribe } from '$lib/stream.svelte'
  import { cn } from '$lib/utils'

  /**
   * Plan hazırlığı (adım çizelgesi): Argus koşunun planını yazarken dört aşama sırayla görünür (istek okundu, hafıza ve
   * kurallar yüklendi, platform tanımları inceleniyor, plan yazılıyor); tamamlanan yeşil onaylı, süren mavi göstergeli,
   * bekleyen gri. Süren aşamanın altında son dört okuma (tek satır neden; çizelge tek ekrana sığsın): saat, ne yapıldığı,
   * hedefi ve nedeni; en yenisi üstte ve koyu. İçerik kartla hizalı, sola yaslıdır.
   * Sağ üstte geçen süre; çizelgenin üstünde kullanıcının test isteği (plan yeniden yazılırken son düzenleme isteği) (uzunsa ilk dört satır, sesle yazıldıysa işaretli)
   * ve ekleri. Yeni koşu'da girdi alanının yerine, Plan sayfasında plan hazır olana kadar gösterilir. Okumalar
   * koşunun olay akışından gelir (açılışta geçmiş, sonra canlı).
   */
  let { runId, run }: { runId: string; run: RunInfo | null } = $props()

  type Read = { title: string; target: string; reason: string | null; time: string }
  let activity = $state<Read[]>([])
  /** Test isteği uzunsa ilk satırları görünür; "Tamamını göster" açar. */
  let briefOpen = $state(false)
  // Argus planı yeniden yazarken "İsteğin" kullanıcının son düzenleme isteğidir; ilk hazırlıkta koşunun test isteği.
  const source = $derived(run?.planRequest ?? run?.options.brief ?? '')
  const brief = $derived(stripVoiceNote(source))
  const spoken = $derived(source.includes(VOICE_NOTE))
  const longBrief = $derived(brief.length > 260 || brief.split('\n').length > 4)
  // Ek kimliği `<kimlik>_<dosya adı>` biçimindedir; ad sunucuya sormadan gösterilir.
  const files = $derived(
    run?.planRequest ? [] : (run?.options.attachments ?? []).map((id) => id.replace(/^[0-9a-f-]{36}_/i, '')),
  )
  let now = $state(Date.now())

  const revising = $derived(run?.planState === 'duzenleniyor')
  // Sayaç baştan görünür: koşu kuyruktan çıkmadan (henüz başlamadan) oluşturulma anından sayar.
  const elapsed = $derived.by(() => {
    const start = run ? Date.parse(run.startedAt ?? run.createdAt) : null
    if (!start) return null
    const seconds = Math.max(0, Math.round((now - start) / 1000))
    return `${Math.floor(seconds / 60)} dk ${String(seconds % 60).padStart(2, '0')} sn`
  })

  const toRead = (event: RunEvent): Read | null => {
    if (event.type !== 'adim' || !event.platform) return null
    const call = plainCall({ tool: event.tool, outcome: event.outcome })
    return {
      title: call.title,
      target: event.platform.tool,
      reason: event.reason,
      time: new Date(event.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    }
  }

  onMount(() => {
    quietApi<RunEvent[]>(`/kosular/${runId}/olaylar`)
      .then((events) => (activity = events.flatMap((e) => toRead(e) ?? [])))
      .catch(() => undefined)
    const unsubscribe = subscribe((m) => {
      if (!('runId' in m) || m.runId !== runId || m.type === 'kare' || m.type === 'imlec') return
      const read = toRead(m)
      if (read) activity = [...activity, read]
    })
    const clock = setInterval(() => (now = Date.now()), 1000)
    return () => {
      unsubscribe()
      clearInterval(clock)
    }
  })

  const steps = $derived([
    { title: 'İstek okundu', detail: 'Girdi ve ekler', state: 'done' },
    {
      title: 'Hafıza ve kurallar yüklendi',
      detail: "Uygulamanın hafızası, Argus'un kuralları ve test yöntemleri",
      state: 'done',
    },
    {
      title: 'Platform tanımları inceleniyor',
      detail: activity.length ? `${activity.length} tanım okundu` : 'Gerekirse sayfa, servis, sorgu ve akış tanımlarına bakılır',
      state: 'active',
    },
    { title: 'Plan yazılıyor', detail: 'Kapsam, vakalar, senaryolar ve tamam sayılma ölçütü', state: 'wait' },
  ] as const)
</script>

<section class="bg-card rounded-xl border">
  <div class="grid gap-5 px-6 py-6">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-[#101828]">
          {revising ? 'Argus planı isteğine göre yeniden yazıyor' : 'Argus planı hazırlıyor'}
        </h2>
        <p class="text-muted-foreground mt-0.5 text-[13px] leading-5">
          Plan hazır olunca düzenleyip onaylayabilirsin; koşu sen onaylayana kadar başlamaz.
        </p>
      </div>
      {#if elapsed}
        <span
          class="rounded-md border bg-[#f9fafb] px-2.5 py-1 font-mono text-[12.5px] font-medium text-[#344054] tabular-nums"
          >{elapsed}</span
        >
      {/if}
    </header>

    {#if brief || files.length}
      <!-- Kullanıcının test isteği: Argus neyi planladığını bilerek beklensin. -->
      <section class="grid gap-2 rounded-[10px] border bg-[#f9fafb] px-4 py-3">
        <div class="flex items-center gap-2">
          <h3 class="text-[13px] font-semibold text-[#101828]">{run?.planRequest ? 'Düzenleme isteğin' : 'İsteğin'}</h3>
          {#if spoken}<span class="rounded-md border bg-white px-1.5 text-[11.5px] leading-5 text-[#475467]"
              >Konuşarak yazıldı</span
            >{/if}
        </div>
        {#if brief}
          <p
            class={cn(
              'text-[13.5px] leading-[1.6] break-words whitespace-pre-line text-[#344054]',
              longBrief && !briefOpen && 'line-clamp-4',
            )}
          >
            {brief}
          </p>
          {#if longBrief}
            <button
              type="button"
              class="text-brand justify-self-start text-[12.5px] font-medium hover:underline"
              onclick={() => (briefOpen = !briefOpen)}>{briefOpen ? 'Daralt' : 'Tamamını göster'}</button
            >
          {/if}
        {/if}
        {#if files.length}
          <ul class="flex flex-wrap gap-1.5" aria-label="Ekler">
            {#each files as name, i (i)}
              <li class="inline-flex max-w-[240px] items-center gap-1.5 rounded-md border bg-white px-2 py-0.5 text-[12px] text-[#344054]">
                <Icon name="attachFile" class="size-3.5 shrink-0 text-[#98a2b3]" /><span class="truncate">{name}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <ol class="grid" aria-label="Hazırlık adımları">
      {#each steps as step, i (i)}
        <li class="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
          {#if i < steps.length - 1}<span class="absolute top-[30px] bottom-0 left-[13.5px] w-px bg-[#e4e7ec]"></span>{/if}
          <span
            class={cn(
              'relative z-[1] grid size-7 place-items-center rounded-full border text-[12px] font-semibold',
              step.state === 'done' && 'border-[#abefc6] bg-[#ecfdf3] text-[#067647]',
              step.state === 'active' && 'border-[#cce0ff] bg-[#e9f2ff] text-[#0c66e4]',
              step.state === 'wait' && 'border-[#e4e7ec] bg-white text-[#98a2b3]',
            )}
          >
            {#if step.state === 'done'}<Icon name="check" class="size-4" />{:else if step.state === 'active'}<span
                class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
              ></span>{:else}{i + 1}{/if}
          </span>
          <div class="min-w-0 pt-0.5">
            <p class={cn('text-[14px] leading-6 font-medium', step.state === 'wait' ? 'text-[#98a2b3]' : 'text-[#101828]')}>
              {step.title}
            </p>
            <p class="text-muted-foreground text-[12.5px] leading-5">{step.detail}</p>
            {#if step.state === 'active' && activity.length}
              <ul class="mt-2.5 overflow-hidden rounded-[10px] border" aria-live="polite" aria-label="Son okunan tanımlar">
                {#each activity.slice(-4).reverse() as read, j (activity.length - j)}
                  <li
                    class={cn(
                      'grid grid-cols-[62px_minmax(0,1fr)] gap-2.5 px-3 py-2 text-[13px] leading-5 not-first:border-t',
                      j > 0 && 'text-[#667085]',
                    )}
                  >
                    <span class="font-mono text-[11.5px] leading-5 text-[#98a2b3] tabular-nums">{read.time}</span>
                    <span class="min-w-0">
                      <span class={cn(j === 0 ? 'font-semibold text-[#101828]' : 'font-medium text-[#475467]')}
                        >{read.title}</span
                      >
                      <span class="ml-1 font-mono text-[11.5px] text-[#98a2b3]">{read.target}</span>
                      {#if read.reason}<span class="block truncate text-[12.5px] leading-[18px]" title={read.reason}
                          >{read.reason}</span
                        >{/if}
                    </span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  </div>
</section>
