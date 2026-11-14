<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { cn } from '$lib/utils'

  /**
   * Pencere (modal) kalıbı; uygulamadaki her pencere bununla açılır.
   *
   * - Genişlik: `sm` 400, `md` 520 (varsayılan), `lg` 720 px; ekrandan taşmaz (yanlarda en az 16 px).
   * - Başlık bölümü 20 px üst, 16 px alt, 24 px yan dolgu: başlık 18/600/26, altında 2 px arayla açıklama 14/20
   *   ikincil renk. Sağ üstte 32 px kapat düğmesi (Esc ve örtüye tıklama da kapatır).
   * - Gövde 24 px yan, 20 px alt dolgu; yükseklik ekranın 64 px eksiğini aşarsa yalnız gövde kayar, başlık ve alt
   *   çubuk sabit.
   * - Alt çubuk (`footer`): üst çizgi, 12 px dikey / 24 px yan dolgu, düğmeler sağa yaslı 38 px, aralarında 8 px;
   *   ikincil (outline) solda, birincil sağda.
   */
  let {
    open = $bindable(false),
    title,
    description,
    size = 'md',
    children,
    footer,
  }: {
    open?: boolean
    title: string
    description?: string
    size?: 'sm' | 'md' | 'lg'
    children: Snippet
    footer?: Snippet
  } = $props()

  const WIDTHS = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]' } as const
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    showCloseButton={false}
    class={cn('flex max-h-[calc(100svh-4rem)] flex-col gap-0 overflow-hidden rounded-xl p-0', WIDTHS[size])}
  >
    <div class="flex items-start gap-4 px-6 pt-5 pb-4">
      <div class="min-w-0 flex-1">
        <Dialog.Title class="text-lg leading-[26px] font-semibold">{title}</Dialog.Title>
        {#if description}
          <Dialog.Description class="mt-0.5 text-sm leading-5">{description}</Dialog.Description>
        {/if}
      </div>
      <Dialog.Close
        class="text-muted-foreground hover:bg-secondary hover:text-foreground -mt-1 -mr-2 grid size-8 shrink-0 place-items-center rounded-lg"
        aria-label="Kapat"
      >
        <Icon name="close" class="size-5" />
      </Dialog.Close>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
      {@render children()}
    </div>
    {#if footer}
      <div class="flex shrink-0 justify-end gap-2 border-t px-6 py-3">
        {@render footer()}
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
