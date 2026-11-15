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
  import { api, put } from '$lib/api'
  import { notify } from '$lib/notify.svelte'

  /** Ayarlar → Yapay zekâ ve öğrenme: rol modelleri ve öğrenme politikası (koşunun derinliği seçilmez; bkz. RUN_CEILINGS). */
  const EFFORTS = [
    { value: 'low', label: 'Düşük' },
    { value: 'medium', label: 'Orta' },
    { value: 'high', label: 'Yüksek' },
  ]

  let settings = $state<Settings | null>(null)
  let models = $state<string[]>([])
  let saving = $state(false)

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
    <Grid cols="2">
      <Panel title="Modeller" description="Ucuz model son kararı vermez">
        <p class="text-muted-foreground mb-4 text-[13px]">
          Planlayıcı görevleri çıkarır, gezgin ekranı gezer, göz gezginin ulaştığı her yeni ekranı inceler, yargıç
          gezginin bildirdiği adayı kayda girmeden denetler, öğretmen kararlardan ders çıkarır.
        </p>
        <div class="grid grid-cols-2 items-start gap-3">
          {#each MODEL_ROLES as role (role)}
            <Field label={MODEL_ROLE_LABELS[role]} for={`model-${role}`}>
              <Combobox
                id={`model-${role}`}
                options={(models.length ? models : [settings.models[role]]).map((m) => ({ value: m, label: m }))}
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
            <Input id="kural" type="number" min={200} max={8000} step={100} bind:value={settings.ruleBudget} />
          </Field>
          <Field label="Kendiliğinden ders çıkarma" for="ders" description="Bu kadar yeni karardan sonra; 0 kapalı">
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
