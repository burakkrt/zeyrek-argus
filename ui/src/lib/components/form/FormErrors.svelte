<script lang="ts">
  import { onDestroy } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import { groupErrors, type FieldError } from '$lib/validation'

  /**
   * Form hata listesi (Zeyrek'in "Form validation errors" bileşeni): formun üstünde tek kırmızı blok; hatalar alan
   * başına toplanır. Alana bağlı satır düğmedir: tıklanınca alan odaklanır, ortaya kaydırılır ve kabı 2 sn vurgulanır.
   * Liste boşken hiçbir şey çizilmez. `role="alert"`: belirince ekran okuyucu okur. İletiler düz metindir.
   *
   * Form gönderilince hata varsa `focusFirst()` çağrılır (ilk hatalı alan). Alanın altındaki metin ve kırmızı kenar
   * `Field`'dadır (`error`).
   */
  let {
    errors,
    title = 'Formu gözden geçirip aşağıdaki hataları düzeltin.',
  }: { errors: FieldError[]; title?: string } = $props()

  const groups = $derived(groupErrors(errors))
  let timer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(timer))

  /** Alanı odaklar, ortalar ve kabını kısa süre vurgular. */
  export function focusField(id: string) {
    const element =
      document.getElementById(id) ?? document.querySelector<HTMLElement>(`[data-field="${id}"]`) ?? null
    if (!element) return
    element.focus({ preventScroll: true })
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const wrapper = element.closest<HTMLElement>('[data-field]') ?? element.parentElement
    if (!wrapper) return
    clearTimeout(timer)
    wrapper.classList.remove('form-error-highlight')
    void wrapper.offsetWidth
    wrapper.classList.add('form-error-highlight')
    timer = setTimeout(() => wrapper.classList.remove('form-error-highlight'), 2000)
  }

  export function focusFirst() {
    const first = errors.find((e) => e.id)
    if (first) focusField(first.id)
  }
</script>

{#if groups.length}
  <div role="alert" class="rounded-lg border border-[#fecdca] bg-[#fef3f2] px-3.5 py-2.5 text-[13px] leading-5">
    <p class="mb-1 font-medium text-[#b42318]">{title}</p>
    <ul class="grid gap-0.5">
      {#each groups as group, i (i)}
        <li>
          {#if group.id}
            <button
              type="button"
              class="group inline-flex items-start gap-1.5 text-left text-[#b42318] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b42318]"
              onclick={() => focusField(group.id)}
            >
              <Icon name="warning" class="mt-0.5 size-4 shrink-0" />
              <span class="group-hover:underline group-focus-visible:underline">
                {#if group.label}<strong class="font-semibold">{group.label}:</strong>{/if}
                {group.message}
              </span>
            </button>
          {:else}
            <span class="inline-flex items-start gap-1.5 text-[#b42318]">
              <Icon name="warning" class="mt-0.5 size-4 shrink-0" />
              <span>{group.message}</span>
            </span>
          {/if}
          {#if group.more.length}
            <ul class="mt-0.5 ml-[22px] grid gap-0.5">
              {#each group.more as more, j (j)}
                <li class="flex items-center gap-1.5 text-[#b42318] before:size-1.5 before:shrink-0 before:rounded-full before:bg-current">
                  {more.message}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  :global(.form-error-highlight) {
    animation: form-error-highlight 1.5s ease-out;
    border-radius: 8px;
  }

  @keyframes form-error-highlight {
    0%,
    100% {
      background-color: transparent;
    }
    30%,
    50% {
      background-color: rgb(217 45 32 / 0.08);
    }
  }
</style>
