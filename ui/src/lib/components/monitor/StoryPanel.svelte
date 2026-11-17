<script lang="ts">
  import type { RunCoverage, RunStrategy } from '@argus/shared'
  import { SCOPE_LABELS } from '@argus/shared'
  import { tick } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import { SEVERITY } from '$lib/format'
  import { actionOf, COVERAGE_STATUS, pageLabel, type MonitorFinding, type MonitorStep } from '$lib/monitor'
  import type { PlanRow } from '$lib/run-plan'
  import { cn } from '$lib/utils'

  /**
   * Sağ panel: koşunun tek ağacı (kutu yok). Üstte sabit plan özeti; "Plan nasıl kuruldu" çekmecede açılır (PlanDetail).
   * Ağaç tektir: gövde Vaka 1'den başlar ve vakaları sırayla bağlayarak son vakaya iner; her vaka gövdeden çıkan bir dal
   * (numara, başlık, beklenen sonuç), altındaki dallar çalışan adım ("şu an") ve bulgulardır (şüpheler dahil, tek liste,
   * hepsi her zaman açık). Bulgu iki satırdır: üstte işaret, renkli tür ve önem, altında başlığın tamamı; türlere göre
   * toplam yalnız üstteki plan özetinde durur. Önemli metin (beklenen, başlık) kesilmez. Adımlar panelde yok (tuvalde ve şeritte durur); sorunsuz biten vaka başlıkta "Sorunsuz" yazar. Çizgiler
   * QM hedef ağacının kalıbıdır: `#D0D5DD` kılavuz ve dirsek, sivri dirsek, 22 px girinti, düğüm
   * noktası yok. Koşan vakalar (paralelde birden çok) mavi ve "Şu an" etiketli, canlıda ilki görünür alana kayar; az önce bulunan bulgunun satırı parlar.
   */
  let {
    rows,
    numbers,
    findings,
    steps,
    strategy,
    coverage,
    running,
    active,
    currentStep,
    offset,
    onjump,
    onstep,
    onfinding,
    onplan,
    recent,
  }: {
    rows: PlanRow[]
    /** Vakanın koşu genelindeki numarası (`sayfa#sıra` → 1, 2, …); tuvaldeki etiketle aynı. */
    numbers: Map<string, number>
    findings: MonitorFinding[]
    steps: MonitorStep[]
    strategy: RunStrategy | null
    coverage: RunCoverage | null
    running: boolean
    /** O an koşan vakaların anahtarları (paralelde birden çok; ilki en önce başlayan). */
    active: string[]
    /** O anki adımın sırası. */
    currentStep: number | null
    /** An → oynatma süresi (saat gösterimi). */
    offset: (at: number) => number
    onjump: (at: number) => void
    onstep: (at: number) => void
    onfinding: (index: number) => void
    /** "Plan nasıl kuruldu": planın ayrıntısı çekmecede açılır. */
    onplan: () => void
    /** Az önce bulunan bulgu: satırı kısa bir vurguyla parlar. */
    recent: number | null
  } = $props()

  /** Bundan uzun beklenen metni üç satırda durur, "Tamamını göster" ile açılır (eski koşularda dayanak da içindeydi). */
  const EXPECTED_SHORT = 180
  /** Bulgunun türü künyede: işaret, renkli tür adı ve önem. Kanıtlı kırmızı, tutarsızlık amber, şüphe gri. */
  const KINDS = ['kesin', 'tutarsizlik', 'not'] as const
  const KIND = {
    kesin: { label: 'Bulgu', text: 'text-[#c4321f]', mark: 'bg-[#c4321f]' },
    tutarsizlik: { label: 'Tutarsızlık', text: 'text-[#b7700c]', mark: 'rotate-45 scale-[.85] bg-[#d68a14]' },
    not: { label: 'Şüphe', text: 'text-[#667085]', mark: 'rounded-full border-[1.5px] border-[#667085]' },
  } as const
  const STATUS = { suruyor: 'Sürüyor', bitti: 'Bitti', bekliyor: 'Bekliyor' } as const

  let expectedOpen = $state(new Set<string>())
  let list = $state<HTMLElement | null>(null)

  const done = $derived(rows.filter((r) => r.status === 'bitti').length)
  const totals = $derived(
    KINDS.map((kind) => [kind, findings.filter((f) => f.event.kind === kind).length] as const),
  )
  const multiPage = $derived(new Set(rows.map((r) => r.page)).size > 1)

  const clock = (at: number) => {
    const s = Math.max(0, Math.round(offset(at) / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }
  const stepsOf = (row: PlanRow) => steps.filter((s) => s.page === row.page && s.task === row.index)
  const stepLine = (step: MonitorStep) => {
    const label = step.platform?.label?.trim()
    if (label) return label
    const action = actionOf(step)
    return `${action.verb}${action.object ? ` · ${action.object}` : ''}`
  }
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }

  // Canlıda koşan vakaların ilki görünür alana kayar; yalnız o değişince (paralel vakalar arasında gidip gelmez,
  // kullanıcının kaydırmasını her adımda bozmaz).
  const lead = $derived(active[0] ?? null)
  $effect(() => {
    const key = lead
    if (!key || !list) return
    void tick().then(() =>
      list
        ?.querySelector<HTMLElement>(`[data-case="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
  })
</script>

<div bind:this={list} class="min-h-0 flex-1 overflow-y-auto">
  <!-- Plan: üstte sabit, kısa; ayrıntı pencerede -->
  <section class="sticky top-0 z-10 border-b bg-white px-3 py-2.5">
    <div class="flex items-center gap-2">
      <span class="text-[11px] font-bold tracking-[.08em] text-zinc-500 uppercase">Plan</span>
      {#if strategy}<span class="text-[11.5px] text-zinc-500">{SCOPE_LABELS[strategy.scope]}</span>{/if}
      {#if coverage}<span class="text-[11.5px] text-zinc-400"
          >· kapsam {COVERAGE_STATUS[coverage.status].label.toLocaleLowerCase('tr')}</span
        >{/if}
      <button
        type="button"
        class="ml-auto text-[12px] font-medium text-[#1d3fc4] hover:underline"
        onclick={onplan}>Plan nasıl kuruldu</button
      >
    </div>
    {#if strategy}<p class="mt-1 line-clamp-2 text-[13px] leading-[18px] text-zinc-900">
        {strategy.understood}
      </p>{/if}
    <p class="mt-1 text-[12px] text-zinc-500 tabular-nums">
      <b class="font-semibold text-zinc-800">{done}/{rows.length}</b> vaka bitti{#each totals as [kind, n] (kind)}{#if n}
          · <b class={cn('font-semibold', KIND[kind].text)}>{n}</b>
          {KIND[kind].label.toLocaleLowerCase('tr')}{/if}{/each}
    </p>
  </section>

  <!-- Ağaç -->
  {#if !rows.length}
    <p class="px-3 py-4 text-[13px] text-zinc-500">{running ? 'Plan yazılıyor…' : 'Bu koşuda vaka yok.'}</p>
  {/if}
  <ol class="tree px-3 pt-2 pb-4">
    {#each rows as row (row.key)}
      {@const isActive = active.includes(row.key)}
      {@const own = stepsOf(row)}
      {@const now =
        isActive && running ? own.findLast((s) => currentStep !== null && s.seq <= currentStep) : undefined}
      <li data-case={row.key} class={cn('case', isActive && 'live')}>
        <button
          type="button"
          class="head grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-1.5 text-left"
          disabled={row.at === null}
          onclick={() => row.at !== null && onjump(row.at)}
        >
          <span class="min-w-0">
            <span class="flex items-center gap-1.5 text-[10.5px] font-bold tracking-[.07em] uppercase">
              <span class={isActive ? 'text-[#2b59ff]' : 'text-zinc-400'}
                >Vaka {numbers.get(row.key) ?? row.index + 1}</span
              >
              {#if multiPage}<span class="font-medium tracking-normal text-zinc-400 normal-case"
                  >· {pageLabel(row.page)}</span
                >{/if}
              {#if isActive}<span
                  class="rounded bg-[#2b59ff] px-1.5 leading-4 tracking-[.05em] text-white whitespace-nowrap"
                  >Şu an</span
                >{/if}
            </span>
            <span
              class={cn(
                'mt-0.5 block text-[13.5px] leading-[19px] font-semibold',
                isActive ? 'text-[#1d3fc4]' : 'text-zinc-900',
              )}>{row.title}</span
            >
          </span>
          <span class="flex flex-col items-end text-[11px] leading-[17px]">
            {#if row.status === 'bitti' && !row.findings.length}
              <span class="flex items-center gap-0.5 font-medium text-emerald-700"
                ><Icon name="check" class="size-3.5" />Sorunsuz</span
              >
            {:else}
              <span class={row.status === 'suruyor' ? 'font-medium text-[#2b59ff]' : 'text-zinc-400'}
                >{STATUS[row.status]}</span
              >
            {/if}
            <span class="text-zinc-400 tabular-nums">{row.at !== null ? clock(row.at) : ''}</span>
          </span>
        </button>
        {#if row.expected}
          {@const long = row.expected.length > EXPECTED_SHORT}
          {@const open = expectedOpen.has(row.key)}
          <p class="-mt-1 pr-1 pb-2 pl-0.5 text-[12px] leading-[17px] text-zinc-500">
            <span class={cn(long && !open && 'line-clamp-3')}
              ><span class="text-zinc-400">Beklenen:</span> {row.expected}</span
            >
            {#if long}<button
                type="button"
                class="mt-0.5 text-[11.5px] font-medium text-[#1d3fc4] hover:underline"
                onclick={() => (expectedOpen = toggle(expectedOpen, row.key))}
                >{open ? 'Kısalt' : 'Tamamını göster'}</button
              >{/if}
          </p>
        {/if}

        <ul class={cn('branches', isActive && 'live')}>
          {#if now}
            <li class="branch">
              <button type="button" onclick={() => onstep(now.at)} class="row text-[#1d3fc4]">
                <span class="flex min-w-0 items-center gap-1.5"
                  ><span class="size-1.5 shrink-0 animate-pulse rounded-full bg-[#2b59ff]"></span><span
                    class="truncate text-[12.5px]">{stepLine(now)}</span
                  ></span
                >
                <span class="text-[11px] tabular-nums">{clock(now.at)}</span>
              </button>
            </li>
          {/if}
          {#each row.findings as index (index)}
            {@const finding = findings[index]!}
            {@const kind = KIND[finding.event.kind]}
            <li class="branch">
              <button
                type="button"
                onclick={() => onfinding(index)}
                class={cn('row finding', recent === index && 'flash')}
              >
                <span class="min-w-0">
                  <span
                    class="flex items-center gap-1.5 text-[10.5px] leading-4 font-bold tracking-[.07em] uppercase"
                  >
                    <span class={cn('size-[7px] shrink-0 -translate-y-px', kind.mark)}></span>
                    <span class={kind.text}>{kind.label}</span>
                    <span class="font-medium tracking-normal text-zinc-400 normal-case"
                      >· {finding.event.severity} {SEVERITY[finding.event.severity].label}</span
                    >
                  </span>
                  <span class="mt-0.5 block text-[13px] leading-[18px] font-medium text-zinc-900"
                    >{finding.event.title}</span
                  >
                </span>
                <span class="text-[11px] text-zinc-400 tabular-nums">{clock(finding.at)}</span>
              </button>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ol>
</div>

<style>
  /* Tek gövde: her vaka gövdeden çıkan bir dal; gövde Vaka 1'in dirseğinden başlar, son vakanın dirseğinde biter. */
  .case {
    position: relative;
    padding-left: 22px;
  }
  .case::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 14px;
    height: 15px;
    border-left: 1.5px solid #d0d5dd;
    border-bottom: 1.5px solid #d0d5dd;
  }
  .case:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-left: 1.5px solid #d0d5dd;
  }
  .case:first-child::before {
    border-left-color: transparent;
  }
  .case:first-child::after {
    top: 14px;
  }
  .case.live::before {
    border-bottom-color: #a9bcff;
  }
  /* QM hedef ağacı kalıbı: #D0D5DD kılavuz ve dirsek, 22 px girinti, sivri dirsek, düğüm noktası yok. */
  .branches {
    position: relative;
    margin-left: 8px;
    padding-bottom: 6px;
  }
  .branch {
    position: relative;
    padding-left: 22px;
  }
  .branch::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    width: 14px;
    height: 15px;
    border-left: 1.5px solid #d0d5dd;
    border-bottom: 1.5px solid #d0d5dd;
  }
  .branch:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-left: 1.5px solid #d0d5dd;
  }
  .branches.live > .branch::before,
  .branches.live > .branch:not(:last-child)::after {
    border-color: #a9bcff;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 8px;
    align-items: start;
    width: 100%;
    text-align: left;
    padding: 5px 4px 5px 2px;
    border-radius: 6px;
  }
  .row > :last-child {
    text-align: right;
    padding-top: 1px;
  }
  .row.finding {
    padding-top: 6px;
    padding-bottom: 7px;
  }
  button.row:hover {
    background: #f6f7f9;
  }
  /* Az önce bulunan bulgu: satır kısa bir süre kırmızımsı parlar, sonra normale döner. */
  .flash {
    animation: flash 2.4s ease-out;
  }
  @keyframes flash {
    0%,
    35% {
      background-color: #fde6e3;
    }
    100% {
      background-color: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash {
      animation: none;
    }
  }
</style>
