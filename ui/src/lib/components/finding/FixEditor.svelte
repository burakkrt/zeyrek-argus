<script lang="ts">
  import { tick } from 'svelte'
  import { Button } from '$lib/components/ui/button/index.js'

  /**
   * Değerlendirmede düzeltme: bulgu doğru ama önerilen çözüm yanlış ya da eksikse insan çözümü değiştirir. Kaydedilen
   * metin kartın çözümü olur ve kapanıştaki düzeltme istemine "ekibin belirlediği" diye girer; boş metin önerilene döner.
   * Çekmece ve triyaj kipi kullanır (triyajda E tuşu `editing`'i açar).
   */
  let {
    fix,
    edited,
    readonly = false,
    editing = $bindable(false),
    onsave,
  }: {
    fix: string | null
    edited: boolean
    readonly?: boolean
    editing?: boolean
    onsave: (text: string) => Promise<void>
  } = $props()

  let text = $state('')
  let saving = $state(false)

  $effect(() => {
    if (!editing) return
    text = fix ?? ''
    void tick().then(() => document.getElementById('cozum-duzenle')?.focus())
  })

  async function save() {
    saving = true
    try {
      await onsave(text)
      editing = false
    } finally {
      saving = false
    }
  }
</script>

<section class="grid gap-2 rounded-lg border px-3.5 py-3">
  <div class="flex items-center gap-2">
    <h3 class="text-sm font-semibold text-[#101828]">Düzeltme</h3>
    {#if edited}<span class="rounded bg-[#e9f2ff] px-1.5 text-[11px] leading-[18px] font-semibold text-[#0055cc]"
        >Ekip düzenledi</span
      >{/if}
    {#if !readonly && !editing}
      <Button size="sm" variant="ghost" class="ml-auto h-7" onclick={() => (editing = true)}>Değiştir</Button>
    {/if}
  </div>
  {#if editing}
    <textarea
      id="cozum-duzenle"
      bind:value={text}
      rows="4"
      placeholder="Ör. Toplamı süzülmüş satırlardan hesapla; süzgeç değişince toplam da güncellensin."
      class="placeholder:text-placeholder w-full rounded-lg border px-3 py-2 text-[13.5px] leading-5 outline-none focus:border-[#0c66e4]"
      onkeydown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          editing = false
        }
      }}
    ></textarea>
    <p class="text-muted-foreground text-[12px]">Boş bırakırsan Argus'un önerdiği çözüme döner.</p>
    <div class="flex justify-end gap-2">
      <Button size="sm" variant="outline" onclick={() => (editing = false)}>Vazgeç</Button>
      <Button size="sm" disabled={saving} onclick={save}>Kaydet</Button>
    </div>
  {:else}
    <p class="text-[13.5px] leading-[1.6] text-[#475467]">{fix || 'Önerilen çözüm yok.'}</p>
  {/if}
</section>
