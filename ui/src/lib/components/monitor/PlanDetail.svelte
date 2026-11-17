<script lang="ts">
  import type { RunCoverage, RunStrategy } from '@argus/shared'
  import { SCOPE_LABELS } from '@argus/shared'
  import Drawer from '$lib/components/layout/Drawer.svelte'
  import { COVERAGE_STATUS } from '$lib/monitor'
  import type { PlanRow } from '$lib/run-plan'

  /**
   * "Plan nasıl kuruldu": Argus isteği nasıl anladı, neyi test etmeye karar verdi ve sonunda neyi kapsadı. Sağdan kayan
   * çekmecede açılır; akış arkada sürer.
   */
  let {
    open,
    rows,
    numbers,
    strategy,
    coverage,
    onclose,
  }: {
    open: boolean
    rows: PlanRow[]
    numbers: Map<string, number>
    strategy: RunStrategy | null
    coverage: RunCoverage | null
    onclose: () => void
  } = $props()
</script>

{#snippet field(label: string, items: string[])}
  {#if items.length}
    <section class="grid gap-1.5">
      <h3 class="text-[11px] font-semibold tracking-[.06em] text-zinc-500 uppercase">{label}</h3>
      <ul class="grid gap-1 pl-4 text-[13px] leading-[19px] text-zinc-800 [list-style:disc]">
        {#each items as item, i (i)}<li>{item}</li>{/each}
      </ul>
    </section>
  {/if}
{/snippet}

<Drawer {open} title="Plan nasıl kuruldu" eyebrow="Plan" {onclose}>
  <div class="grid gap-5">
    {#if strategy}
      <section class="grid gap-1.5">
        <h3 class="text-[11px] font-semibold tracking-[.06em] text-zinc-500 uppercase">
          Anlaşılan istek · {SCOPE_LABELS[strategy.scope]}
        </h3>
        <p class="text-[13.5px] leading-[20px] text-zinc-900">{strategy.understood}</p>
      </section>
      {@render field('Test senaryoları', strategy.scenarios)}
      {@render field(
        'Vakalar',
        rows.map((r) => `Vaka ${numbers.get(r.key) ?? r.index + 1} · ${r.title}`),
      )}
      {@render field('Tanımdan bilinenler', strategy.known)}
      {@render field('Tamam sayılır', strategy.doneWhen ? [strategy.doneWhen] : [])}
      {@render field('Bu koşuda yapılamayan', strategy.infeasible)}
      {@render field('Test yöntemleri', strategy.guides.length ? [strategy.guides.join(', ')] : [])}
    {/if}
    {#if coverage}
      {@render field(`Kapsam raporu · ${COVERAGE_STATUS[coverage.status].label}`, [coverage.summary])}
      {@render field('Test edilemeyen', coverage.untested)}
      {@render field('Bakılmayan (istek dışında)', coverage.outOfScope ?? [])}
    {/if}
    {#if !strategy && !coverage}<p class="text-[13px] text-zinc-500">
        Bu koşu girdisiz bir sayfa taraması; plan yazılmadı.
      </p>{/if}
  </div>
</Drawer>
