<script lang="ts">
  import type { Occurrence } from '@argus/shared'
  import { fileUrl } from '$lib/api'
  import { findingDocument } from '$lib/finding'

  /**
   * Bulgu belgesi: akıştaki, değerlendirmedeki ve Bulgular'daki çekmecenin ortak gövdesi. Bulgunun başlığı (sebebi)
   * çekmece başlığında değil, "Bulgu" bölümündedir. Sıra sadeden teknik olana: Bulgu, Sonucu, Nerede oluyor, Nasıl
   * yakalandı (adımlar, beklenen, gerçekleşen, ekrandaki metin), Kök neden, Önerilen düzeltme (kabul ölçütleriyle),
   * Kanıt (kanıtın türü ve görüntü), Değerlendirme notu; boş bölüm çıkmaz (`findingDocument`). En altta tek satır künye.
   *
   * Tek tip yazı: bölüm başlığı 14/600 koyu; her metin 13.5/1.6 normal ikincil renk (kalın ya da renkli vurgu yok);
   * alt etiketler (Beklenen, Gerçekleşen, Kabul ölçütleri…) 12.5/500 soluk ve metnin üstünde, böylece etiket uzunluğu
   * hizayı bozmaz.
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

{#snippet field(label: string, value: string)}
  <div>
    <p class="text-[12.5px] leading-5 font-medium text-[#98a2b3]">{label}</p>
    <p class="[overflow-wrap:anywhere]">{value}</p>
  </div>
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
  <section class="grid gap-2.5">
    <div>
      {@render section('Nasıl yakalandı')}
      {#if doc.steps.length}
        <ul class="grid list-disc gap-0.5 pl-4 marker:text-[#98a2b3]">
          {#each doc.steps as step, i (i)}<li>{step}</li>{/each}
        </ul>
      {/if}
    </div>
    {@render field('Beklenen', doc.expected || '—')}
    {@render field('Gerçekleşen', doc.observed || '—')}
    {#if doc.quote}{@render field('Ekrandaki metin', `"${doc.quote}"`)}{/if}
  </section>
  {#if doc.rootCause}
    <section>{@render section('Kök neden')}<p class="[overflow-wrap:anywhere]">{doc.rootCause}</p></section>
  {/if}
  {#if doc.fix || doc.acceptance.length}
    <section class="grid gap-2.5">
      <div>{@render section('Önerilen düzeltme')}{#if doc.fix}<p>{doc.fix}</p>{/if}</div>
      {#if doc.acceptance.length}
        <div>
          <p class="text-[12.5px] leading-5 font-medium text-[#98a2b3]">Kabul ölçütleri</p>
          <ul class="grid list-disc gap-0.5 pl-4 marker:text-[#98a2b3]">
            {#each doc.acceptance as item, i (i)}<li>{item}</li>{/each}
          </ul>
        </div>
      {/if}
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
