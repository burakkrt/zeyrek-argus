<script lang="ts">
  import type { Settings } from '@argus/shared'
  import { MODEL_ROLE_LABELS, MODEL_ROLES } from '@argus/shared'
  import { onMount } from 'svelte'
  import Combobox from '$lib/components/form/Combobox.svelte'
  import Field from '$lib/components/form/Field.svelte'
  import Grid from '$lib/components/layout/Grid.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import Panel from '$lib/components/layout/Panel.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Switch } from '$lib/components/ui/switch/index.js'
  import { api, post, put } from '$lib/api'
  import { notify } from '$lib/notify.svelte'
  import { cn } from '$lib/utils'

  /** Ayarlar → Yapay zekâ ve öğrenme: rol modelleri ve öğrenme politikası (koşunun derinliği seçilmez; bkz. RUN_CEILINGS). */
  const EFFORTS = [
    { value: 'low', label: 'Düşük' },
    { value: 'medium', label: 'Orta' },
    { value: 'high', label: 'Yüksek' },
  ]

  let settings = $state<Settings | null>(null)
  let models = $state<string[]>([])
  let saving = $state(false)
  let check = $state<{ ok: boolean; detail: string } | null>(null)
  let checking = $state(false)

  const PROVIDERS = [
    {
      value: 'abonelik' as const,
      title: 'Claude hesabı (abonelik)',
      hint: 'Bu bilgisayarda Claude Code’a kendi hesabınla giriş yaptıysan koşular planının kullanım hakkından düşer; Argus oturum bilgine dokunmaz.',
    },
    {
      value: 'api' as const,
      title: 'API anahtarı',
      hint: '.env dosyasındaki ANTHROPIC_API_KEY ile; maliyet dolar olarak yazılır.',
    },
  ]

  async function checkProvider() {
    checking = true
    check = null
    try {
      if (settings) settings = (await put<{ settings: Settings }>('/ayarlar', settings)).settings
      check = await post<{ ok: boolean; detail: string }>('/saglayici/denetle')
    } catch (e) {
      check = { ok: false, detail: e instanceof Error ? e.message : String(e) }
    } finally {
      checking = false
    }
  }

  async function save() {
    if (!settings) return
    saving = true
    try {
      settings = (await put<{ settings: Settings }>('/ayarlar', settings)).settings
      notify.success('Ayarlar kaydedildi.')
    } catch (e) {
      notify.error('Kaydedilemedi', e instanceof Error ? e.message : String(e))
    } finally {
      saving = false
    }
  }

  onMount(async () => {
    const [all, status] = await Promise.all([
      api<{ settings: Settings }>('/ayarlar').catch(() => null),
      api<{ models: string[] }>('/durum').catch(() => null),
    ])
    settings = all?.settings ?? null
    models = status?.models ?? []
  })
</script>

{#snippet toggle(id: string, label: string, hint: string, checked: boolean, set: (v: boolean) => void)}
  <label for={id} class="flex cursor-pointer items-start justify-between gap-4 py-3 not-last:border-b">
    <span class="grid gap-0.5">
      <span class="text-[13px] font-medium">{label}</span>
      <span class="text-muted-foreground text-xs">{hint}</span>
    </span>
    <Switch {id} {checked} onCheckedChange={set} class="mt-0.5" />
  </label>
{/snippet}

<Page title="Yapay zekâ ve öğrenme" description="Rollerin modelleri ve kontrolcünün öğrenme politikası">
  {#snippet actions()}
    <Button disabled={!settings || saving} onclick={save}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Button>
  {/snippet}
  {#if settings}
    <Panel title="Model sağlayıcısı" description="Yapay zekâ çağrılarının hangi hesapla yapılacağı">
      <div role="radiogroup" aria-label="Model sağlayıcısı" class="grid grid-cols-2 gap-3">
        {#each PROVIDERS as option (option.value)}
          <button
            type="button"
            role="radio"
            aria-checked={settings.provider === option.value}
            onclick={() => {
              settings!.provider = option.value
              check = null
            }}
            class={cn(
              'grid gap-1 rounded-lg border px-4 py-3 text-left transition-colors',
              settings.provider === option.value ? 'border-brand bg-brand-soft' : 'hover:bg-muted',
            )}
          >
            <span class="text-[13px] font-semibold">{option.title}</span>
            <span class="text-muted-foreground text-xs">{option.hint}</span>
          </button>
        {/each}
      </div>
      {#if settings.provider === 'abonelik'}
        <p class="text-muted-foreground mt-3 text-xs">
          Giriş yapmadıysan ya da oturumun süresi dolduysa bir terminalde <code>claude</code> çalıştırıp
          <code>/login</code>
          ile kendi hesabınla gir. Kullanım sınırı dolarsa koşu nedenini söyleyerek durur.
        </p>
      {/if}
      <div class="mt-4 flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={checking} onclick={checkProvider}
          >{checking
            ? 'Denetleniyor…'
            : settings.provider === 'abonelik'
              ? 'Hesabı denetle'
              : 'Anahtarı denetle'}</Button
        >
        {#if check}
          <span class={cn('text-xs', check.ok ? 'text-success' : 'text-destructive')}>{check.detail}</span>
        {/if}
      </div>
    </Panel>
    <Grid cols="2">
      <Panel title="Modeller" description="Ucuz model son kararı vermez">
        <p class="text-muted-foreground mb-4 text-[13px]">
          Planlayıcı görevleri çıkarır, gezgin ekranı gezer, göz gezginin ulaştığı her yeni ekranı inceler,
          yargıç gezginin bildirdiği adayı kayda girmeden denetler, öğretmen kararlardan ders çıkarır.
        </p>
        <div class="grid grid-cols-2 items-start gap-3">
          {#each MODEL_ROLES as role (role)}
            <Field label={MODEL_ROLE_LABELS[role]} for={`model-${role}`}>
              <Combobox
                id={`model-${role}`}
                options={(models.length ? models : [settings.models[role]]).map((m) => ({
                  value: m,
                  label: m,
                }))}
                value={settings.models[role]}
                onchange={(v) => (settings!.models[role] = v)}
              />
            </Field>
          {/each}
          <Field label="Efor" for="efor">
            <Combobox
              id="efor"
              options={EFFORTS}
              value={settings.effort}
              onchange={(v) => (settings!.effort = v as Settings['effort'])}
            />
          </Field>
        </div>
        <div class="mt-4 border-t pt-1">
          {@render toggle(
            'goz',
            'Göz açık',
            'Gezginin ulaştığı her yeni ekranı göz modeli ayrıca incelesin.',
            settings.inspector,
            (v) => (settings!.inspector = v),
          )}
          {@render toggle(
            'yukselt',
            'Takılınca üst modele geç',
            'Gezgin takılınca ya da görevi eksik bırakınca bir üst modele geçsin (Haiku → Sonnet → Opus).',
            settings.escalate,
            (v) => (settings!.escalate = v),
          )}
        </div>
      </Panel>

      <Panel title="Öğrenme" description="Kurallar ve kararlardan ders çıkarma">
        <div class="grid grid-cols-2 items-start gap-3">
          <Field label="Kural bütçesi (token)" for="kural" description="İsteme giren kuralların üst sınırı">
            <Input
              id="kural"
              type="number"
              min={200}
              max={8000}
              step={100}
              bind:value={settings.ruleBudget}
            />
          </Field>
          <Field
            label="Kendiliğinden ders çıkarma"
            for="ders"
            description="Bu kadar yeni karardan sonra; 0 kapalı"
          >
            <Input id="ders" type="number" min={0} max={100} bind:value={settings.learnAfterDecisions} />
          </Field>
        </div>
        <div class="mt-4 border-t pt-1">
          {@render toggle(
            'onaysiz',
            '"Sorun ara" kuralları onaysız devreye girsin',
            '"Sorun sayma" kuralları her zaman onay bekler.',
            settings.autoApproveFindingRules,
            (v) => (settings!.autoApproveFindingRules = v),
          )}
        </div>
      </Panel>
    </Grid>
  {/if}
</Page>
