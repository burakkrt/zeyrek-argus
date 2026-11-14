<script lang="ts" module>
  /** Yüklenmiş ek: sunucudaki kimlik, ad, boyut ve (görselse) tarayıcıdaki önizleme adresi. */
  export interface AttachedFile {
    id: string
    name: string
    size: number
    preview: string | null
  }
</script>

<script lang="ts">
  import { onDestroy } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { fileKind, partitionFiles, sizeText } from '$lib/attachments'
  import { cn } from '$lib/utils'

  /**
   * Ek alanı — platformun `Attachments` bileşeninin kompakt sürükle-bırak hâli (`ng-apps-ui` › attachments,
   * `isCompact`). Boşken form girdisi gibi alçak tek satır: kesik çizgili kutu, solda mavi daire içinde yükleme ikonu,
   * "**Dosya seçin** ya da buraya sürükleyin" ve altında küçük açıklama; üzerine gelince mavi kenar + açık mavi zemin.
   * Dosyalar altta 88 px kare kutucuklar (önizleme ya da tür ikonu, altında ad ve boyut, köşede kaldır); görsele
   * tıklayınca büyük önizleme açılır (PDF / Excel açılmaz). Dosya sürüklenirken alanın tamamı açık mavi olur, düz mavi kenar ve
   * "Dosyaları bırakın" yazar — bırakılacağı açıkça anlaşılır. Seçilen dosya hemen `upload` ile yüklenir; dönen kimlik
   * `files`'a yazılır, yükleme sürerken `uploading` doğrudur. Dışarıdan dosya vermek için (ör. yapıştırma) `add`.
   */
  let {
    files = $bindable([]),
    uploading = $bindable(false),
    upload,
    accept,
    maxFiles = 10,
    maxBytes = 10 * 1024 * 1024,
    description,
    disabled = false,
    label = 'Ekler',
  }: {
    files?: AttachedFile[]
    uploading?: boolean
    upload: (file: File) => Promise<string>
    /** Kabul edilen uzantılar (noktasız, küçük harf). */
    accept: string[]
    maxFiles?: number
    maxBytes?: number
    description?: string
    disabled?: boolean
    label?: string
  } = $props()

  let input = $state<HTMLInputElement | null>(null)
  // Sürükleme sayacı: alt öğelere geçerken gelen dragleave alanı söndürmesin (işletim sisteminden gelen dosyada
  // relatedTarget boş gelir, kapsama denetimi işe yaramaz).
  let depth = $state(0)
  let pending = $state<Array<{ key: string; name: string }>>([])
  let errors = $state<string[]>([])
  let zoomed = $state<AttachedFile | null>(null)

  const dragging = $derived(depth > 0)
  const hasFiles = $derived(files.length + pending.length > 0)
  const room = $derived(maxFiles - files.length - pending.length)
  const reason = $derived({
    tur: 'bu tür eklenemez',
    boyut: `en çok ${sizeText(maxBytes)} olabilir`,
    sinir: `en çok ${maxFiles} dosya eklenebilir`,
  })

  $effect(() => {
    uploading = pending.length > 0
  })

  export async function add(list: File[]) {
    if (disabled || !list.length) return
    const { take, rejected } = partitionFiles(list, { accept, maxBytes, room })
    errors = rejected.map((r) => `${r.name}: ${reason[r.reason]}.`)
    await Promise.all(
      take.map(async (file) => {
        const key = crypto.randomUUID()
        pending = [...pending, { key, name: file.name }]
        try {
          const id = await upload(file)
          const preview = fileKind(file.name).image ? URL.createObjectURL(file) : null
          files = [...files, { id, name: file.name, size: file.size, preview }]
        } catch (e) {
          errors = [...errors, `${file.name}: ${e instanceof Error ? e.message : String(e)}`]
        } finally {
          pending = pending.filter((p) => p.key !== key)
        }
      }),
    )
  }

  function remove(id: string) {
    const file = files.find((f) => f.id === id)
    if (file?.preview) URL.revokeObjectURL(file.preview)
    files = files.filter((f) => f.id !== id)
  }

  const open = () => !disabled && room > 0 && input?.click()
  const hasFilesIn = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

  onDestroy(() => files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)))
</script>

<!-- Tür ikonu: köşesi kıvrık sayfa + tür etiketi (platform `FileTypeIcon`). -->
{#snippet typeIcon(name: string)}
  {@const kind = fileKind(name)}
  <svg
    viewBox="0 0 40 48"
    aria-hidden="true"
    class="h-full w-full overflow-visible"
    style="--c: {kind.color}"
  >
    <path
      d="M6 1.5h20L38.5 14v30.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-41a2 2 0 0 1 2-2Z"
      style="fill: color-mix(in srgb, var(--c) 8%, white); stroke: color-mix(in srgb, var(--c) 45%, transparent)"
      stroke-width="1.5"
    />
    <path
      d="M26 1.5V12a2 2 0 0 0 2 2h10.5"
      style="fill: color-mix(in srgb, var(--c) 18%, white); stroke: color-mix(in srgb, var(--c) 45%, transparent)"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
    {#if kind.label}
      <rect x="0" y="26" width="30" height="13" rx="2.5" style="fill: var(--c)" />
      <text
        x="15"
        y="35.6"
        text-anchor="middle"
        font-size={kind.label.length > 4 ? 7.5 : 9}
        font-weight="700"
        letter-spacing="0.04em"
        fill="white">{kind.label}</text
      >
    {/if}
  </svg>
{/snippet}

<div class="text-sm" aria-label={label} role="group">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class={cn(
      'group/zone bg-card relative flex flex-col gap-2 rounded-lg border-[1.5px] border-dashed p-1 transition-[border-color,background-color] duration-150',
      !disabled && 'hover:border-brand hover:bg-brand-soft/60',
      dragging && 'border-brand bg-brand-soft border-solid',
      disabled && 'opacity-60',
    )}
    ondragenter={(e) => {
      if (disabled || !hasFilesIn(e)) return
      e.preventDefault()
      depth += 1
    }}
    ondragover={(e) => {
      if (disabled || !hasFilesIn(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }}
    ondragleave={() => (depth = Math.max(0, depth - 1))}
    ondrop={(e) => {
      e.preventDefault()
      depth = 0
      void add([...(e.dataTransfer?.files ?? [])])
    }}
  >
    <div
      role="button"
      tabindex={disabled ? -1 : 0}
      aria-disabled={disabled}
      class="focus-visible:ring-brand/30 flex min-h-[30px] cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2"
      onclick={open}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <span class="bg-brand-soft text-brand grid size-7 shrink-0 place-items-center rounded-full">
        <Icon name="upload" class="size-4" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col gap-px">
        <span class="truncate text-[13px] leading-[1.3] font-medium">
          <strong class="text-brand font-semibold">Dosya seçin</strong> ya da buraya sürükleyin
        </span>
        {#if description}
          <span class="text-muted-foreground truncate text-[11px] leading-[1.3]">{description}</span>
        {/if}
      </span>
      {#if hasFiles}
        <span
          class="text-muted-foreground bg-muted shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
        >
          {files.length} / {maxFiles}
        </span>
      {/if}
    </div>

    {#if hasFiles}
      <!-- Kare kutucuklar (88 px): önizleme ya da tür ikonu, altında ad ve boyut; köşede kaldır. -->
      <ul class="m-0 flex list-none flex-wrap gap-2 px-1 pb-1" aria-label="Eklenen dosyalar">
        {#each files as file (file.id)}
          <li class="group/tile relative flex w-[88px] min-w-0 flex-col gap-1">
            {#if file.preview}
              <button
                type="button"
                class="group/thumb bg-muted relative block size-[88px] overflow-hidden rounded-md border"
                aria-label="{file.name} büyüt"
                title="Büyüt"
                onclick={() => (zoomed = file)}
              >
                <img src={file.preview} alt="" class="size-full object-cover" />
                <span
                  class="absolute inset-0 grid place-items-center bg-zinc-900/35 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100"
                >
                  <Icon name="zoomIn" class="size-5" />
                </span>
              </button>
            {:else}
              <span class="bg-muted/50 grid size-[88px] place-items-center rounded-md border">
                <span class="block h-11 w-9">{@render typeIcon(file.name)}</span>
              </span>
            {/if}
            <span class="flex min-w-0 flex-col leading-tight">
              <span class="truncate text-[11px] font-medium" title={file.name}>{file.name}</span>
              <small class="text-muted-foreground text-[10.5px]">{sizeText(file.size)}</small>
            </span>
            <button
              type="button"
              class="bg-card/95 text-muted-foreground hover:text-destructive absolute top-1 right-1 grid size-5 place-items-center rounded border shadow-sm"
              aria-label="{file.name} kaldır"
              title="Kaldır"
              onclick={() => remove(file.id)}
            >
              <Icon name="close" class="size-3.5" />
            </button>
          </li>
        {/each}
        {#each pending as item (item.key)}
          <li class="flex w-[88px] flex-col gap-1">
            <span class="bg-muted/60 size-[88px] animate-pulse rounded-md border"></span>
            <span class="text-muted-foreground truncate text-[11px]">{item.name}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if dragging}
      <div
        class="bg-brand-soft text-brand pointer-events-none absolute inset-0 z-[2] flex items-center justify-center gap-2.5 rounded-[inherit]"
      >
        <span class="bg-card grid size-7 place-items-center rounded-full shadow-sm">
          <Icon name="download" class="size-4" />
        </span>
        <span class="text-[13px] font-semibold">Dosyaları bırakın</span>
      </div>
    {/if}
  </div>

  <input
    bind:this={input}
    type="file"
    multiple
    class="hidden"
    accept={accept.map((ext) => `.${ext}`).join(',')}
    {disabled}
    onchange={(e) => {
      const target = e.currentTarget
      void add([...(target.files ?? [])]).then(() => (target.value = ''))
    }}
  />

  {#each errors as message (message)}
    <p class="text-destructive mt-1.5 flex items-center gap-1.5 text-xs">
      <Icon name="error" class="size-4" />{message}
    </p>
  {/each}
</div>

<!-- Görsel önizleme: tıklanan görsel büyük açılır. -->
<Dialog.Root open={!!zoomed} onOpenChange={(next) => !next && (zoomed = null)}>
  <Dialog.Content class="w-auto max-w-[min(92vw,1200px)] gap-2 p-2 pt-10 sm:max-w-[min(92vw,1200px)]">
    {#if zoomed?.preview}
      <Dialog.Title class="absolute top-3 left-4 max-w-[80%] truncate text-sm font-medium"
        >{zoomed.name}</Dialog.Title
      >
      <img src={zoomed.preview} alt={zoomed.name} class="max-h-[80vh] w-auto rounded-md object-contain" />
    {/if}
  </Dialog.Content>
</Dialog.Root>
