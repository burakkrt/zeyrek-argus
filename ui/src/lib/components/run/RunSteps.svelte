<script lang="ts">
  import type { RunInfo } from '@argus/shared'
  import Icon from '$lib/components/Icon.svelte'
  import { doneCount, runSteps, type StepId } from '$lib/run-steps'
  import { cn } from '$lib/utils'

  /**
   * Koşunun adım çubuğu: Tanım → Koşu → Değerlendirme → Kapanış. Koşunun bütün sayfalarında (Yeni koşu, izleme,
   * değerlendirme) başlık şeridinin altında, ayrı ve yapışkan bir şerittir (`Page` › `subheader`). Açılmış adıma
   * tıklayınca o sayfaya gidilir, kilitli adım pasiftir.
   *
   * Görünüm Zeyrek'in sihirbaz "Bölümler" şerididir (performans planı): ok biçimli dilimler (12 px uç), 48 px yükseklik,
   * bekleyen #F4F5F7, tamamlanan #EEF6F1 + yeşil dolu daire ve onay, geçerli #EDF3FC + mavi halkalı nokta; başlık
   * 13.5/18, alt yazı 11.5/15. Şerit 69 px'tir (10 px üst/alt dolgu, 1 px alt çizgi); izleme ekranı kalan yüksekliği
   * buna göre hesaplar.
   */
  let { run, current }: { run: RunInfo | null; current: StepId } = $props()

  const steps = $derived(runSteps(run, current))
</script>

<nav class="strip bg-card border-b px-7 py-2.5" aria-label="Koşunun adımları">
  <span class="strip-label">Adımlar</span>
  <div class="chevrons">
    {#each steps as step, i (step.id)}
      {@const Tag = step.href && step.state !== 'sel' ? 'a' : 'span'}
      <svelte:element
        this={Tag}
        href={Tag === 'a' ? step.href : undefined}
        class={cn('chevron', step.state)}
        aria-current={step.state === 'sel' ? 'step' : undefined}
        aria-disabled={step.state === 'lock' ? 'true' : undefined}
      >
        <span class="dot"
          >{#if step.state === 'done'}<Icon name="check" class="size-3.5" />{:else if step.state === 'sel'}<i
              class="pip"
            ></i>{:else}<i>{i + 1}</i>{/if}</span
        >
        <span class="text"><b>{step.title}</b><small>{step.sub}</small></span>
      </svelte:element>
    {/each}
  </div>
  <span class="strip-count"><b>{doneCount(steps)}</b>/{steps.length} tamamlandı</span>
</nav>

<style>
  .strip {
    display: flex;
    align-items: center;
    min-width: 0;
    overflow-x: auto;
  }
  .strip-label {
    flex: none;
    margin-right: 12px;
    font-size: 11.5px;
    line-height: 16px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #626f86;
  }
  .chevrons {
    --u: 12px;
    flex: 1 1 auto;
    display: flex;
    min-width: 640px;
  }
  .chevron {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: 48px;
    margin-left: calc(var(--u) * -1 + 3px);
    padding: 6.5px 16px 6.5px calc(var(--u) + 16px);
    background: #f4f5f7;
    color: #44546f;
    text-decoration: none;
    clip-path: polygon(
      0 0,
      calc(100% - var(--u)) 0,
      100% 50%,
      calc(100% - var(--u)) 100%,
      0 100%,
      var(--u) 50%
    );
    transition: background-color 0.15s;
  }
  .chevron:first-child {
    margin-left: 0;
    padding-left: 16px;
    border-radius: 8px 0 0 8px;
    clip-path: polygon(0 0, calc(100% - var(--u)) 0, 100% 50%, calc(100% - var(--u)) 100%, 0 100%);
  }
  .chevron:last-child {
    border-radius: 0 8px 8px 0;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, var(--u) 50%);
  }
  .chevron.done {
    background: #eef6f1;
  }
  .chevron.sel {
    background: #edf3fc;
  }
  .chevron.lock {
    cursor: not-allowed;
  }
  a.chevron.done:hover {
    background: #e4f1e9;
  }
  a.chevron.bekle:hover {
    background: #ecedf0;
  }
  a.chevron:focus-visible {
    outline: 2px solid #3a6fc4;
    outline-offset: -2px;
  }
  .dot {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 1.5px solid #b3b9c4;
    background: #ffffff;
  }
  .dot i {
    font-style: normal;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    color: #626f86;
  }
  .done .dot {
    border: 0;
    background: #1f845a;
    color: #ffffff;
  }
  .sel .dot {
    border-color: #3a6fc4;
  }
  .sel .dot .pip {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3a6fc4;
  }
  .lock .dot {
    opacity: 0.6;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .text b {
    font-size: 13.5px;
    line-height: 18px;
    font-weight: 500;
    color: #44546f;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .text small {
    font-size: 11.5px;
    line-height: 15px;
    color: #8590a2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .done .text b {
    color: #18181b;
  }
  .done .text small {
    color: #4b6b58;
  }
  .sel .text b {
    color: #0b3e99;
    font-weight: 600;
  }
  .sel .text small {
    color: #44546f;
  }
  .lock .text b,
  .lock .text small {
    color: #a5adba;
  }
  .strip-count {
    flex: none;
    padding: 0 4px 0 16px;
    font-size: 12.5px;
    line-height: 16px;
    color: #44546f;
    white-space: nowrap;
  }
  .strip-count b {
    color: #18181b;
    font-weight: 600;
  }
</style>
