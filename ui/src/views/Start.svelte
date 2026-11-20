<script lang="ts">
  import type { RunInfo } from '@argus/shared'
  import { onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import PlanProgress from '$lib/components/run/PlanProgress.svelte'
  import RunSummary from '$lib/components/run/RunSummary.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import Attachments, { type AttachedFile } from '$lib/components/form/Attachments.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, post, qs } from '$lib/api'
  import { notify } from '$lib/notify.svelte'
  import Dictation from '$lib/components/form/Dictation.svelte'
  import FormErrors from '$lib/components/form/FormErrors.svelte'
  import { segments } from '$lib/composer'
  import { startErrors } from '$lib/start'
  import { cn } from '$lib/utils'
  import { errorOf } from '$lib/validation'
  import { live } from '$lib/stream.svelte'
  import { workspace } from '$lib/workspace.svelte'
  import { go } from '../lib/router.svelte'

  /**
   * Yeni koşu: yalnız girdi (ne test edilsin; bağlantı ve ekler); girdi konuşarak da yazılır (`Dictation`, yerel Whisper).
   * "Koşuyu başlat"tan sonra sayfa değişmez: girdi alanının yerinde plan hazırlığı çizelgesi açılır (`PlanProgress`),
   * plan hazır olunca planı düzenleme sayfasına (Plan) geçilir. Sayfalar koşu başında girdiden seçilir; derinlik
   * seçilmez, motor kalite öncelikli çalışır. Proje · uygulama · dal çalışma alanından, test kullanıcısı Ayarlar'daki
   * varsayılan hesaptan gelir.
   */
  /** Sunucunun kabul ettiği ek türleri (`server/src/runs/attachments.ts`). */
  const ACCEPT = [
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'pdf',
    'xlsx',
    'docx',
    'csv',
    'txt',
    'md',
    'json',
    'log',
  ]
  const target = workspace.current!

  let brief = $state('')
  let files = $state<AttachedFile[]>([])
  let attachments = $state<ReturnType<typeof Attachments> | null>(null)
  let uploading = $state(false)
  /** Başlatılınca atanacak kodun önizlemesi (sunucu ayırmaz; yenilemede tükenmez). */
  let nextCode = $state<string | null>(null)
  let starting = $state(false)
  /** Başlatılan koşu: plan hazırlanırken girdi alanının yerinde çizelge görünür. */
  let created = $state<RunInfo | null>(null)
  const createdRun = $derived(created ? (live.runs[created.id] ?? created) : null)
  $effect(() => {
    if (createdRun && createdRun.planState !== 'hazirlaniyor' && createdRun.planState !== 'duzenleniyor')
      go(`/plan/${createdRun.id}`)
  })
  /** Konuşarak yazma sürerken alan salt okunur (metni konuşma yazar). */
  let dictating = $state(false)
  let dictation = $state<ReturnType<typeof Dictation> | null>(null)
  /** Konuşmanın geçici (henüz kesinleşmemiş) kısmı; görünüm italik ve soluk çizer. */
  let interim = $state('')
  let textarea = $state<HTMLTextAreaElement | null>(null)
  let backdrop = $state<HTMLDivElement | null>(null)
  const parts = $derived(segments(brief, dictating ? interim : ''))
  // Doğrulama ilk "Koşuyu başlat"tan sonra her değişiklikte yeniden yapılır: düzelen alan hatasından kurtulur.
  let submitted = $state(false)
  let formErrors = $state<ReturnType<typeof FormErrors> | null>(null)
  const errors = $derived(submitted ? startErrors({ brief, files: files.length, uploading }) : [])

  const upload = async (file: File) => {
    const form = new FormData()
    form.append('dosya', file, file.name || 'ekran-goruntusu.png')
    return (await api<{ id: string }>('/ekler', { method: 'POST', body: form })).id
  }

  function onPaste(event: ClipboardEvent) {
    // Yapıştırılan görsel ya da dosya ek olur (alanın içinde önizlemesiyle görünür).
    const pasted = [...(event.clipboardData?.files ?? [])]
    if (pasted.length) {
      event.preventDefault()
      void attachments?.add(pasted)
      return
    }
    // Konuşma sürerken alan salt okunurdur; yapıştırılan metin konuşmanın akışına girer.
    if (dictating) {
      event.preventDefault()
      dictation?.insert(event.clipboardData?.getData('text') ?? '')
    }
  }

  // Dosya alanın üstüne sürüklenince alan vurgulanır, bırakılınca ek olur.
  let dragDepth = $state(0)
  const hasFiles = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')

  async function start() {
    submitted = true
    if (startErrors({ brief, files: files.length, uploading }).length) return formErrors?.focusFirst()
    starting = true
    try {
      const run = await post<RunInfo>('/kosular', {
        proje: target.project,
        uygulama: target.application,
        ortam: target.environment,
        sayfalar: [],
        secenekler: { brief: brief.trim() || null, attachments: files.map((f) => f.id), reviewPlan: true },
      })
      // Koşu önce planını yazar: sayfa değişmez, girdinin yerinde plan hazırlığı görünür; plan hazır olunca planı
      // düzenleme sayfasına geçilir.
      created = run
    } catch (e) {
      notify.error('Koşu başlatılamadı', e instanceof Error ? e.message : String(e))
      starting = false
    }
  }

  onMount(() => {
    void api<{ code: string }>('/kosular/siradaki-kod')
      .then((code) => (nextCode = code.code))
      .catch(() => undefined)
  })
</script>

{#snippet heading(title: string, description: string)}
  <div>
    <h2 class="text-base leading-[22px] font-semibold">{title}</h2>
    <p class="text-muted-foreground text-[13px]">{description}</p>
  </div>
{/snippet}

<Page
  title={nextCode ? `Yeni koşu · ${nextCode}` : 'Yeni koşu'}
>
  {#snippet actions()}
    {#if !created}
      <Button disabled={starting} onclick={start}>
        <Icon name="mediaPlay" />
        {starting ? 'Hazırlanıyor…' : 'Planı hazırla'}
      </Button>
    {/if}
  {/snippet}
  {#snippet subheader()}<RunSteps run={createdRun} current="plan" />{/snippet}
  <!-- Solda girdi kabı, sağda ayrı yapışkan kutu (koşunun özeti) -->
  <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    {#if created}
      <div class="min-w-0"><PlanProgress runId={created.id} run={createdRun} /></div>
    {:else}
    <div class="bg-card text-card-foreground min-w-0 rounded-xl border">
      <section class="flex flex-col gap-3 p-6">
        {@render heading('Ne test edilsin?', 'Neyi test etmek istediğini anlat; Argus buna göre koşunun planını hazırlar.')}
        <FormErrors bind:this={formErrors} {errors} />
        <!-- Girdi alanı (Claude masaüstündeki gibi): içeride eklerin önizlemesi, saydam yazı alanı ve arkasında aynı
             metni biçimli çizen katman (bağlantı mavi, konuşmanın geçici kısmı italik ve soluk, sesle yazma notu soluk),
             altta ayrı şerit: solda ek, sağda konuşarak yazma. Metin şeridin altına girmez. Dosya alanın üstüne
             sürüklenebilir, görsel Ctrl+V ile yapıştırılabilir. -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          data-field="girdi"
          class={cn(
            'border-input focus-within:border-ring focus-within:ring-ring/15 relative rounded-lg border transition-colors focus-within:ring-2',
            errorOf(errors, 'girdi') && 'border-destructive focus-within:border-destructive focus-within:ring-destructive/15',
            dragDepth > 0 && 'border-brand bg-brand-soft/40',
          )}
          ondragenter={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            dragDepth += 1
          }}
          ondragover={(e) => hasFiles(e) && e.preventDefault()}
          ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
          ondrop={(e) => {
            if (!hasFiles(e)) return
            e.preventDefault()
            dragDepth = 0
            void attachments?.add([...(e.dataTransfer?.files ?? [])])
          }}
        >
          <!-- Ek bileşeni hep bağlıdır (ekle düğmesi ve yapıştırma onu çağırır); boşken yer kaplamaz. -->
          <div class={cn('outline-none', (files.length || uploading) && 'px-3 pt-3')} data-field="ekler" id="ekler" tabindex="-1">
              <Attachments
                bind:this={attachments}
                bind:files
                bind:uploading
                {upload}
                accept={ACCEPT}
                maxFiles={6}
                variant="satir"
              />
          </div>
          <div class="relative">
            <div
              bind:this={backdrop}
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap text-[#101828] [scrollbar-gutter:stable]"
            >
              {#each parts as part, i (i)}{#if part.kind === 'baglanti'}<span class="text-[#0c66e4] underline decoration-[#0c66e4]/40 underline-offset-2">{part.text}</span>{:else if part.kind === 'gecici'}<span class="text-[#98a2b3] italic">{part.text}</span>{:else if part.kind === 'not'}<span class="text-[#98a2b3]">{part.text}</span>{:else}{part.text}{/if}{/each}&#8203;
            </div>
            <textarea
              bind:this={textarea}
              id="girdi"
              aria-invalid={errorOf(errors, 'girdi') ? true : undefined}
              aria-describedby={errorOf(errors, 'girdi') ? 'girdi-hata' : undefined}
              bind:value={brief}
              onpaste={onPaste}
              onscroll={() => backdrop && textarea && (backdrop.scrollTop = textarea.scrollTop)}
              readonly={dictating}
              rows="6"
              aria-label="Ne test edilsin?"
              placeholder="Hangi modülü, akışı ya da kuralı test edelim; nelere dikkat edilsin? Ekran görüntüsü yapıştırabilir, bağlantı ya da dosya ekleyebilirsin."
              class="placeholder:text-placeholder relative block max-h-[40svh] min-h-36 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 break-words text-transparent caret-[#101828] outline-none [field-sizing:content] [scrollbar-gutter:stable] selection:bg-[#0c66e4]/25"
            ></textarea>
          </div>
          <div class="flex items-center justify-between px-2 pb-2">
            <button
              type="button"
              onclick={() => attachments?.open()}
              aria-label="Dosya ekle"
              title="Dosya ekle (görsel, PDF, Excel, Word, CSV ya da metin; en çok 6 dosya, her biri 10 MB)"
              class="text-muted-foreground hover:bg-secondary hover:text-foreground grid size-8 place-items-center rounded-full transition-colors"
            >
              <Icon name="add" class="size-5" />
            </button>
            <Dictation
              bind:this={dictation}
              value={brief}
              onupdate={(text, live) => {
                brief = text
                interim = live
              }}
              onrecording={(on) => {
                dictating = on
                if (!on) interim = ''
              }}
            />
          </div>
          {#if dragDepth > 0}
            <div
              class="text-brand pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] text-[13px] font-semibold"
            >
              Dosyaları bırakın
            </div>
          {/if}
        </div>
        {#if errorOf(errors, 'girdi')}
          <p id="girdi-hata" class="text-destructive -mt-1.5 text-xs">{errorOf(errors, 'girdi')}</p>
        {/if}
        {#if errorOf(errors, 'ekler')}
          <p class="text-destructive -mt-1.5 text-xs">{errorOf(errors, 'ekler')}</p>
        {/if}
      </section>
    </div>
    {/if}

    <aside class="lg:sticky lg:top-[212px]">
      <RunSummary
        run={createdRun}
        code={createdRun?.code ?? nextCode}
        project={target.project}
        application={target.application}
        environment={target.environment}
      />
    </aside>
  </div>
</Page>
