<script lang="ts">
  import type { Occurrence } from '@argus/shared'
  import { fileUrl } from '$lib/api'
  import { findingDocument } from '$lib/finding'
  import { cn } from '$lib/utils'

  /**
   * Bulgu belgesi: akıştaki, değerlendirmedeki ve Bulgular'daki çekmecenin ortak gövdesi. Bulgunun başlığı (sebebi)
   * çekmece başlığında değil, "Bulgu" bölümündedir. Sıra sadeden teknik olana: Bulgu, Sonucu, Nerede oluyor, Nasıl
   * yakalandı (adımlar, beklenen, gerçekleşen, ekrandaki metin), Kök neden, Önerilen düzeltme (kabul ölçütleriyle),
   * Kanıt (kanıtın türü ve görüntü), Değerlendirme notu; boş bölüm çıkmaz (`findingDocument`). En altta tek satır künye.
   *
   * Tek tip yazı: bölüm başlığı 14/600 koyu; her metin 13.5/1.6 normal ikincil renk. Alt başlık yoktur: Kabul ölçütleri
   * kendi bölümüdür. Adımlar numaralıdır (sıralıdır); Beklenen, Gerçekleşen ve Ekrandaki metin sabit etiket sütunlu
   * (132 px) bir tablodadır.
   */
  let {
    title,
    occurrence,
    place,
    note = null,
    footer = null,
    shot = true,
  }: {
    /** Bulgunun başlığı: çekmece başlığında değil, "Bulgu" bölümünün ilk satırında durur. */
    title: string
    occurrence: Occurrence
    /** Raporda yer yoksa gösterilecek sayfa adı. */
    place: string
    /** Yargıcın ya da kaydın gerekçesi. */
    note?: string | null
    footer?: string | null
    /** Kanıt görüntüsü gösterilsin mi (Bulgular sayfası kendi işaretli görüntüsünü üstte gösterir). */
    shot?: boolean
  } = $props()

  const doc = $derived(findingDocument(occurrence, place))
</script>

{#snippet section(title: string)}
  <h3 class="mb-1 text-sm leading-5 font-semibold text-[#101828]">{title}</h3>
{/snippet}

{#snippet row(label: string, value: string, strong = false)}
  <tr class="border-t first:border-t-0">
    <th scope="row" class="w-[132px] bg-[#f9fafb] px-3 py-2 text-left align-top text-[13px] font-medium whitespace-nowrap text-[#344054]">
      {label}
    </th>
    <td class={cn('px-3 py-2 align-top [overflow-wrap:anywhere]', strong && 'text-[#101828]')}>{value}</td>
  </tr>
{/snippet}

<div class="grid content-start gap-5 text-[13.5px] leading-[1.6] text-[#475467]">
  <section>
    {@render section('Bulgu')}
    <p class="[overflow-wrap:anywhere]">{title}</p>
    {#if doc.summary}<p class="mt-1.5">{doc.summary}</p>{/if}
  </section>
  {#if doc.impact}
    <section>{@render section('Sonucu')}<p>{doc.impact}</p></section>
  {/if}
  <section>{@render section('Nerede oluyor')}<p class="whitespace-pre-line">{doc.location}</p></section>
  <section class="grid gap-3">
    <div>
      {@render section('Nasıl yakalandı')}
      {#if doc.steps.length}
        <ol class="grid list-decimal gap-0.5 pl-5 marker:font-medium marker:text-[#667085]">
          {#each doc.steps as step, i (i)}<li class="pl-1">{step}</li>{/each}
        </ol>
      {/if}
    </div>
    <!-- Beklenen ve gerçekleşen yan yana değil alt alta, sabit etiket sütunlu tabloda: etiket uzunluğu hizayı bozmaz. -->
    <div class="overflow-hidden rounded-lg border">
      <table class="w-full border-collapse text-[13.5px] leading-[1.55]">
        <tbody>
          {@render row('Beklenen', doc.expected || '—')}
          {@render row('Gerçekleşen', doc.observed || '—', true)}
          {#if doc.quote}{@render row('Ekrandaki metin', `"${doc.quote}"`)}{/if}
        </tbody>
      </table>
    </div>
  </section>
  {#if doc.rootCause}
    <section>{@render section('Kök neden')}<p class="[overflow-wrap:anywhere]">{doc.rootCause}</p></section>
  {/if}
  {#if doc.fix}
    <section>{@render section('Önerilen düzeltme')}<p>{doc.fix}</p></section>
  {/if}
  {#if doc.acceptance.length}
    <section>
      {@render section('Kabul ölçütleri')}
      <ul class="grid list-disc gap-0.5 pl-5 marker:text-[#98a2b3]">
        {#each doc.acceptance as item, i (i)}<li class="pl-1">{item}</li>{/each}
      </ul>
    </section>
  {/if}
  {#if doc.proof || (shot && occurrence.shot)}
    <section class="grid gap-2.5">
      <div>{@render section('Kanıt')}{#if doc.proof}<p class="[overflow-wrap:anywhere]">{doc.proof}</p>{/if}</div>
      {#if shot && occurrence.shot}
        <div>
          <a href={fileUrl(occurrence.runId, occurrence.shot)} target="_blank" rel="noreferrer" class="block">
            <img
              src={fileUrl(occurrence.runId, occurrence.shot)}
              alt="Bulgunun kanıt görüntüsü"
              class="w-full rounded-md border"
              loading="lazy"
            />
          </a>
          <p class="mt-1 text-[12.5px] text-[#98a2b3]">Sorunlu yer işaretli; büyütmek için tıkla.</p>
        </div>
      {/if}
    </section>
  {/if}
  {#if note}
    <section>{@render section('Değerlendirme notu')}<p>{note}</p></section>
  {/if}
  {#if footer}
    <p class="border-t pt-3.5 text-[12.5px] text-[#98a2b3]">{footer}</p>
  {/if}
</div>
