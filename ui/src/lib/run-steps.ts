import type { RunInfo } from '@argus/shared'

/**
 * Koşunun adımları (adım çubuğu): Plan → Koşu → Değerlendirme → Kapanış. Plan adımında Argus isteği okuyup planı
 * yazar, insan düzenler ve onaylar; onaylanmadan Koşu adımı açılmaz (plan onayı istenmeyen eski ve devam koşularında Plan
 * tamamdır). Koşunun bütün sayfalarının üstünde durur;
 * kullanıcı koşuyu baştan sona görür ve açılmış adımlar arasında gezer. Görünüm Zeyrek'in sihirbaz "Bölümler"
 * şeridinden alınmıştır (performans planı); bu modül yalnız adımların durumunu ve gideceği adresi hesaplar.
 */
export type StepId = 'plan' | 'kosu' | 'degerlendirme' | 'kapanis'

/** done tamamlandı, sel geçerli adım, bekle açık ama sırası gelmedi, lock henüz açılmadı. */
export type StepState = 'done' | 'sel' | 'bekle' | 'lock'

export interface RunStep {
  id: StepId
  title: string
  sub: string
  state: StepState
  href: string | null
}

type StepRun = Pick<RunInfo, 'id' | 'status' | 'review' | 'closedAt' | 'options'> & {
  planState?: RunInfo['planState']
}

/** Plan henüz onaylanmadı (Argus yazıyor ya da insan onayı bekleniyor). */
const planPending = (run: StepRun | null) =>
  !!run?.planState && run.planState !== 'onaylandi'

const PLAN_SUB = { hazirlaniyor: 'Hazırlanıyor', duzenleniyor: 'Hazırlanıyor', taslak: 'Onay bekliyor', onaylandi: 'Onaylandı' } as const

const RUN_SUB: Record<RunInfo['status'], string> = {
  sirada: 'Sırada',
  calisiyor: 'Sürüyor',
  bitti: 'Bitti',
  durduruldu: 'Durduruldu',
  hata: 'Yarıda kaldı',
}

export function runSteps(run: StepRun | null, current: StepId): RunStep[] {
  const pending = planPending(run)
  const finished = !pending && !!run && run.status !== 'sirada' && run.status !== 'calisiyor'
  const closed = !!run?.closedAt
  // Devam koşusunun değerlendirmesi ana koşununkidir.
  const review = run ? `#/onay/${run.options.parentRunId ?? run.id}` : null
  const steps: Array<Omit<RunStep, 'state'> & { base: StepState }> = [
    {
      id: 'plan',
      title: 'Plan',
      sub: run?.planState ? PLAN_SUB[run.planState] : 'İstek ve plan',
      base: !run || pending ? 'bekle' : 'done',
      href: run?.planState ? `#/plan/${run.id}` : null,
    },
    {
      id: 'kosu',
      title: 'Koşu',
      sub: pending ? 'Plan onaylanınca' : run ? RUN_SUB[run.status] : 'Başlatılınca izlenir',
      base: !run || pending ? 'lock' : finished ? 'done' : 'bekle',
      href: run && !pending ? `#/monitor/${run.id}` : null,
    },
    {
      id: 'degerlendirme',
      title: 'Değerlendirme',
      sub: !finished
        ? 'Koşu bitince açılır'
        : closed
          ? 'Tamamlandı'
          : run!.review.pending
            ? `${run!.review.pending} karar bekliyor`
            : 'Kapatılabilir',
      base: !finished ? 'lock' : closed ? 'done' : 'bekle',
      href: finished ? review : null,
    },
    {
      id: 'kapanis',
      title: 'Kapanış',
      sub: closed ? 'Kapatıldı' : 'Kararlar bitince',
      base: closed ? 'done' : 'lock',
      href: closed ? review : null,
    },
  ]
  return steps.map(({ base, ...step }) => ({
    ...step,
    state: step.id === current && base !== 'lock' ? 'sel' : base,
  }))
}

/** Tamamlanan adım sayısı (şeridin sağındaki "n/4"). */
export const doneCount = (steps: RunStep[]): number =>
  steps.filter((s) => s.state === 'done' || (s.state === 'sel' && s.id === 'kapanis')).length

/** Koşular listesinin "Durum" etiketleri: koşunun bulunduğu adım, adım çubuğuyla aynı adlar (hazır süzgeçler de bunlar). */
export const LIFECYCLE_LABELS = ['Plan', 'Sırada', 'Koşu', 'Değerlendirme', 'Kapatıldı'] as const

/**
 * Koşunun yaşam döngüsündeki yeri (Koşular listesinin "Durum" sütunu): koşunun bulunduğu adım, tek etiket. Nasıl
 * bittiği (yarıda kaldı, durduruldu) ya da kaç karar beklediği listede yazmaz; adım çubuğunda ve değerlendirmededir.
 * Yarıda kalan ya da durdurulan koşu da değerlendirme adımındadır. Tıklanınca gidilecek yer de buradan: süren koşu
 * izlenir, biten değerlendirilir.
 */
export function lifecycle(run: StepRun): {
  label: (typeof LIFECYCLE_LABELS)[number]
  tone: 'neutral' | 'info' | 'warn' | 'success'
  href: string
} {
  const review = `#/onay/${run.options.parentRunId ?? run.id}`
  if (planPending(run) && (run.status === 'sirada' || run.status === 'calisiyor'))
    return { label: 'Plan', tone: 'info', href: `#/plan/${run.id}` }
  if (run.status === 'sirada') return { label: 'Sırada', tone: 'neutral', href: `#/monitor/${run.id}` }
  if (run.status === 'calisiyor') return { label: 'Koşu', tone: 'info', href: `#/monitor/${run.id}` }
  if (run.closedAt) return { label: 'Kapatıldı', tone: 'success', href: review }
  return { label: 'Değerlendirme', tone: 'warn', href: review }
}
