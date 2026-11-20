<script lang="ts">
  import { errorOf, validateFields } from '$lib/validation'
  import type { IssueDetail, Occurrence, RunEvent, RunInfo, StepTarget } from '@argus/shared'
  import { onDestroy, onMount } from 'svelte'
  import Icon from '$lib/components/Icon.svelte'
  import Page from '$lib/components/layout/Page.svelte'
  import RunSteps from '$lib/components/run/RunSteps.svelte'
  import { notify } from '$lib/notify.svelte'
  import { go } from '$lib/router.svelte'
  import FindingDetail from '$lib/components/monitor/FindingDetail.svelte'
  import FindingToast from '$lib/components/monitor/FindingToast.svelte'
  import StoryPanel from '$lib/components/monitor/StoryPanel.svelte'
  import { planRows, statusAt } from '$lib/run-plan'
  import PlayerBar from '$lib/components/monitor/PlayerBar.svelte'
  import FlowCanvas from '$lib/components/monitor/FlowCanvas.svelte'
  import { cn } from '$lib/utils'
  import Stage from '$lib/components/monitor/Stage.svelte'
  import Tracks from '$lib/components/monitor/Tracks.svelte'
  import RunStatusBadge from '$lib/components/status/RunStatusBadge.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Card from '$lib/components/ui/card/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { api, fileUrl, post } from '$lib/api'
  import { costHint, formatCost, formatDuration, KIND } from '$lib/format'
  import {
    ACTION_ICON,
    actionOf,
    buildClock,
    buildLanes,
    buildMonitor,
    findingIndexAt,
    formatClock,
    frameIndexAt,
    haltAt,
    pointerAt,
    stepIndexAt,
    TRAVEL_MS,
    zoomAt,
    type PointerMove,
  } from '$lib/monitor'
  import { live, subscribe } from '$lib/stream.svelte'
  import { pageName } from '$lib/page-name.svelte'

  /**
   * Koşu monitörü (Stüdyo düzeni): solda video gibi izlenen kayıt — kenardan kenara sahne, hemen altında oynatma
   * çubuğu (eylem kartı, bulgu gezgini) ve görev · adım · bulgu şeritleri, oynatma çizgisi hepsini birlikte keser.
   * Sağda okunur akış ya da seçili bulgunun ayrıntısı. Canlı koşuda canlının ~0,7 sn gerisinden izlenir (imleç hedefe
   * tıklamadan önce varsın diye); ekran durgunken ne olduğu söylenir. Kayıtta model düşünürken geçen bekleme kısaltılır.
   * Model çağrısı yoktur: kareler ve hedefler sunucunun modelsiz ölçümüdür.
   */
  let { runId }: { runId: string } = $props()

  const LIVE_DELAY_MS = 700
  const LIVE_CACHE = 120
  const THINK_AFTER_MS = 2_500
  // Kayıt alanı sabit: kontrolcünün tarayıcı görünümü (`browser/session.ts`).
  const VIEWPORT = { width: 1280, height: 800 }

  let run = $state<RunInfo | null>(null)
  let events = $state<RunEvent[]>([])
  let frames = $state<number[]>([])
  let dropped = $state(false)
  let liveMoves = $state<PointerMove[]>([])
  let error = $state<string | null>(null)
  let message = $state('')
  let ready = $state(false)

  // Oynatma durumu: `wall` ekrandaki anın duvar saati; `following` canlının ucunda mı.
  let wall = $state(0)
  let playing = $state(true)
  let following = $state(false)
  let speed = $state(1)
  let autoZoom = $state(false)
  let pauseAt: number | null = null
  let selected = $state<number | null>(null)
  let detail = $state<IssueDetail | null>(null)
  let detailFailed = $state(false)
  let now = $state(Date.now())
  let copied = $state(false)
  let fullscreen = $state(false)
  let player = $state<HTMLDivElement | null>(null)

  // Canlı kareler bellekte (son 120); eskileri diskten okunur. Reaktif değil: kare listesi zaten tetikler.
  const liveData = new Map<number, string>()

  const current = $derived(live.runs[runId] ?? run)
  const running = $derived(current?.status === 'calisiyor' || current?.status === 'sirada')
  const model = $derived(buildMonitor(events))
  // Eski koşularda (kayıt yokken) adım kareleri kayıt yerine geçer.
  const fallback = $derived(
    frames.length || dropped ? null : new Map(model.steps.filter((s) => s.shot).map((s) => [s.at, s.shot!])),
  )
  const timeline = $derived(fallback ? [...fallback.keys()].sort((a, b) => a - b) : frames)
  const clock = $derived(
    buildClock([
      ...timeline,
      ...model.steps.map((s) => s.at),
      ...model.flow.map((r) => r.at),
      ...(running ? [now - LIVE_DELAY_MS] : []),
    ]),
  )
  const position = $derived(clock.toPlay(wall))
  const atLive = $derived(following && running)

  // Canlı imleç: henüz adımı gelmemiş işlemler (adım olayı işlem bittikten sonra gelir).
  const pending = $derived(liveMoves.filter((m) => !model.steps.some((s) => s.at === m.at)))
  const moves = $derived<PointerMove[]>(
    [
      ...model.steps.flatMap((s) =>
        s.target && s.tool !== 'kaydir' ? [{ at: s.at, tool: s.tool, target: s.target }] : [],
      ),
      ...pending,
    ].sort((a, b) => a.at - b.at),
  )
  // Animasyonların saati: kayıtta oynatma saati (kısaltılan beklemede imleç ve yakınlık ani sıçramasın), canlıda
  // gerçek saat (canlının ucunda kısaltma yoktur ve uç her an ilerler).
  const motionAt = $derived(following ? wall : position)
  const toMotion = (at: number) => (following ? at : clock.toPlay(at))
  const motionMoves = $derived(moves.map((m) => ({ ...m, at: toMotion(m.at) })))
  const stepIndex = $derived(
    stepIndexAt(
      model.steps.map((s) => ({ at: toMotion(s.at) })),
      motionAt,
    ),
  )
  const step = $derived(model.steps[stepIndex] ?? null)
  // O anki adım bir platform işiyse tuvalde tarayıcı yerine sayfanın platform iş akışı çizilir: vaka başına bir kulvar,
  // şu ana dek olan adımlar (oynatma anına göre).
  const platformFlow = $derived.by(() => {
    if (!step?.platform) return null
    const at = step
    const tasks = model.pages.find((p) => p.page === at.page)?.tasks ?? []
    const lanes = new Map<
      number,
      { key: string; no: number | null; title: string; steps: typeof model.steps; done: boolean }
    >()
    const lastSeq = new Map<number, number>()
    for (const s of model.steps) {
      if (!s.platform || s.page !== at.page) continue
      const index = s.task ?? -1
      lastSeq.set(index, s.seq)
      if (s.seq > at.seq) continue
      const lane = lanes.get(index) ?? {
        key: String(index),
        no: index < 0 ? null : (caseNumbers.get(`${at.page}#${index}`) ?? index + 1),
        title: index < 0 ? 'Hazırlık: tanımları tanıma' : (tasks[index]?.title ?? 'Platform işleri'),
        steps: [],
        done: false,
      }
      lane.steps.push(s)
      lanes.set(index, lane)
    }
    // Vaka, son platform adımı oynatma anında geçmişse ve görev bittiyse bitmiştir (ana hatta bağlanır, yuvası boşalır).
    // Plandan önceki hazırlık okumasının görevi yoktur: son adımı geçince biter.
    for (const [index, lane] of lanes)
      lane.done = (index < 0 || tasks[index]?.status === 'bitti') && (lastSeq.get(index) ?? 0) <= at.seq
    const findings = model.findings
      .filter((f) => f.event.page === at.page && f.at <= at.at)
      .map((f) => ({ key: f.event.occurrenceId, at: f.at, title: f.event.title, severity: f.event.severity }))
    return { lanes: [...lanes.values()], findings, current: at.seq }
  })

  const pendingNow = $derived(
    pending.find((m) => motionAt >= toMotion(m.at) - TRAVEL_MS && (!step || m.at > step.at)) ?? null,
  )
  const pointer = $derived(pointerAt(motionMoves, motionAt))
  const zoom = $derived(autoZoom ? zoomAt(motionMoves, motionAt, pointer) : { scale: 1, x: 0.5, y: 0.5 })
  const frameIndex = $derived(frameIndexAt(timeline, wall))
  const srcOf = (at: number) =>
    liveData.get(at) ?? fileUrl(runId, fallback ? fallback.get(at)! : `kare/${at}.jpg`)
  const src = $derived(frameIndex >= 0 ? srcOf(timeline[frameIndex]!) : null)
  const prefetch = $derived(
    playing && !following
      ? timeline
          .slice(frameIndex + 1, frameIndex + 13)
          .map(srcOf)
          .filter((url): url is string => url !== null)
      : [],
  )
  const dialog = $derived.by(() => {
    if (!step?.dialog) return null
    const since = motionAt - toMotion(step.at)
    return since >= 0 && since < 3_500 ? step.dialog : null
  })

  const lanes = $derived(buildLanes(model, clock, atLive ? now - LIVE_DELAY_MS : clock.end))
  const planned = $derived(model.pages.some((p) => p.tasks.length > 0))
  // Canlıda ekran durgunsa ne olduğu: plan bekleniyor ya da model sonraki adımı seçiyor.
  const waiting = $derived.by(() => {
    if (!atLive || pendingNow) return null
    if (!model.flow.some((r) => r.kind === 'sayfa')) return 'Tarayıcı açılıyor, oturum kuruluyor'
    if (!planned) return 'Sayfa açıldı · açılış araştırması ve plan hazırlanıyor'
    const last = Math.max(
      Date.parse(events.at(-1)?.at ?? '') || 0,
      model.steps.at(-1)?.at ?? 0,
      liveMoves.at(-1)?.at ?? 0,
    )
    const idle = now - last
    return idle > THINK_AFTER_MS ? `Yapay zekâ sonraki adımı seçiyor · ${Math.round(idle / 1000)} sn` : null
  })
  const ending = $derived.by(() => {
    if (running || !current || (current.status !== 'hata' && current.status !== 'durduruldu')) return null
    if (position < clock.duration - 300) return null
    const reason = current.error ?? model.flow.findLast((r) => r.kind === 'not' && r.tone === 'hata')
    return {
      title: current.status === 'hata' ? 'Koşu yarıda kaldı' : 'Koşu durduruldu',
      message:
        typeof reason === 'string'
          ? reason
          : reason?.kind === 'not'
            ? reason.text
            : 'Koşu tamamlanmadan bitti; kalan görevler çalışmadı.',
    }
  })

  const occurrence = $derived.by<Occurrence | null>(() => {
    const id = selected === null ? null : model.findings[selected]?.event.occurrenceId
    if (!id || !detail) return null
    return detail.occurrences.find((o) => o.id === id) ?? detail.occurrences[0] ?? null
  })
  // Seçili bulgu ancak anında durulduğunda sahnede çerçevelenir (oynarken ekran değişir, çerçeve yanlış yeri gösterir).
  const findingOverlay = $derived.by(() => {
    if (selected === null || playing || pauseAt !== null) return null
    const finding = model.findings[selected]
    if (!finding || Math.abs(wall - finding.at) > 1_500) return null
    const box: StepTarget | null = occurrence?.box
      ? {
          x: occurrence.box.x / VIEWPORT.width,
          y: occurrence.box.y / VIEWPORT.height,
          width: occurrence.box.width / VIEWPORT.width,
          height: occurrence.box.height / VIEWPORT.height,
        }
      : null
    return { box, kind: finding.event.kind, title: finding.event.title }
  })

  const findingNav = $derived({
    index: selected ?? findingIndexAt(model.findings, wall),
    total: model.findings.length,
    selected: selected !== null,
  })

  const barAction = $derived.by(() => {
    if (ending)
      return { icon: 'error' as const, title: ending.title, detail: ending.message, tone: 'hata' as const }
    if (findingOverlay) {
      const before = step ? actionOf(step) : null
      return {
        icon: 'bug' as const,
        title: `${KIND[findingOverlay.kind].label} bulgu · ${findingOverlay.title}`,
        detail: before ? `Önceki adım: ${before.verb}${before.object ? ` · ${before.object}` : ''}` : '',
        tone: 'bulgu' as const,
      }
    }
    if (pendingNow) {
      const action = actionOf({ tool: pendingNow.tool, outcome: '' })
      return {
        icon: ACTION_ICON[action.kind],
        title: `${action.verb}…`,
        detail: 'Sonucu bekleniyor',
        tone: 'eylem' as const,
      }
    }
    if (waiting)
      return {
        icon: 'psychology' as const,
        title: planned ? 'Düşünüyor…' : 'Plan hazırlanıyor',
        detail: step ? `Son adım: ${actionOf(step).verb}` : 'Açılış araştırması',
        tone: 'bekliyor' as const,
      }
    if (step) {
      const action = actionOf(step)
      return {
        icon: ACTION_ICON[action.kind],
        title: `${action.verb}${action.object ? ` · ${action.object}` : ''}`,
        detail: [step.reason ? `Neden: ${step.reason}` : '', step.dialog ? 'tarayıcı penceresi açıldı' : '']
          .filter(Boolean)
          .join(' · '),
        tone: 'eylem' as const,
      }
    }
    return {
      icon: 'visibility' as const,
      title: running ? 'Sayfa açılıyor' : 'Sayfa açıldı ve incelendi',
      detail: 'Açılış araştırması: ipuçları, gözler ve ağ istekleri',
      tone: 'eylem' as const,
    }
  })

  // Oynatılan anın sayfası (üst şeritte tarayıcı adresi olarak): o ana kadar açılan son sayfa.
  const pageUrl = $derived.by(() => {
    const opened = events.filter((e) => e.type === 'sayfa-basladi')
    const row = opened.findLast((e) => Date.parse(e.at) <= wall) ?? opened[0]
    return row?.type === 'sayfa-basladi' ? row.url.replace(/^https?:\/\//, '') : ''
  })

  const elapsed = $derived.by(() => {
    void now
    return current ? formatDuration(current.startedAt, current.finishedAt) : '—'
  })

  /** Adımın ipucu: ne yapıldı ("Tuşa bastı · Enter", "Yazdı · “PLN-2027”"). */
  function describe(index: number) {
    const action = actionOf(model.steps[index]!)
    return `${action.verb}${action.object ? ` · ${action.object}` : ''}`
  }

  // Sağ panel: koşunun anlatısı (plan özeti + hep açık vakalar). Vaka numarası koşu genelindedir; tuvaldeki etiketle aynı.
  // Sağ paneldeki vakaların durumu oynatılan andadır: geri sarınca akış o anki hâliyle görünür, durmuş koşunun sonunda
  // bitmeyen vaka "sürüyor" değil "yarıda" yazar.
  const playedAt = $derived(clock.toWall(position))
  const halt = $derived(haltAt(model, playedAt, current?.status ?? null))
  const plan = $derived(planRows(model).map((row) => ({ ...row, status: statusAt(row, playedAt, halt) })))
  const caseNumbers = $derived(new Map(plan.map((row, i) => [row.key, i + 1])))
  /**
   * Bulgunun anı: oynatma bir bulgunun anına gelince (canlıda ya da kayıtta) TOAST_MS boyunca duyuru kartı çıkar, sağ
   * panelde satırı parlar. Yaş, izleyicinin gördüğü oynatma süresiyle ölçülür (oynatma uzun beklemeleri sıkıştırır; duvar
   * saatiyle ölçülünce kart hiç görünmeyebiliyordu). Bulgular zaman sırasındadır; sondan geriye bakılır.
   */
  const TOAST_MS = 7000
  const recentFinding = $derived.by(() => {
    for (let i = model.findings.length - 1; i >= 0; i -= 1) {
      const age = position - clock.toPlay(model.findings[i]!.at)
      if (age < 0) continue
      return age < TOAST_MS ? i : null
    }
    return null
  })
  const caseOfFinding = (index: number) => {
    const row = plan.find((r) => r.findings.includes(index))
    return row ? `Vaka ${caseNumbers.get(row.key)}` : null
  }
  const selectedCase = $derived.by(() => {
    const row = selected === null ? undefined : plan.find((r) => r.findings.includes(selected!))
    return row ? `Vaka ${caseNumbers.get(row.key)}` : null
  })
  const activeCase = $derived(step && step.task !== null ? `${step.page}#${step.task}` : null)
  // Koşan vakalar: platform akışında bitmemiş bütün hatlar (paralel vakalar birlikte), yoksa o anki adımın vakası.
  const activeCases = $derived.by(() => {
    if (halt) return []
    const open = platformFlow?.lanes.filter((l) => !l.done).map((l) => `${step!.page}#${l.key}`) ?? []
    return open.length ? open : activeCase ? [activeCase] : []
  })
  // Tarayıcı adımında videonun altındaki alt yazı: ne yapıldı ve neden (platform adımları tuvalde görünür).
  const caption = $derived.by(() => {
    if (!step || step.platform) return null
    const action = actionOf(step)
    return { title: `${action.verb}${action.object ? ` · ${action.object}` : ''}`, reason: step.reason }
  })

  // Kullanıcının açık atlaması (akıştan, şeritten, oynatıcıdan): akış tuvali kendi odağını bırakıp o ana gider.
  let focusRequest = $state(0)

  function seekPlay(value: number, play = playing) {
    focusRequest += 1
    following = false
    pauseAt = null
    wall = clock.toWall(value)
    playing = play
  }

  function goLive() {
    focusRequest += 1
    selected = null
    pauseAt = null
    following = true
    playing = true
  }

  // Akışta adıma tıklanınca imleç hedefe gitmeden biraz öncesinden oynatılır; göreve tıklanınca görevin başına gidilir.
  function onFlowStep(at: number) {
    selected = null
    seekPlay(clock.toPlay(at) - TRAVEL_MS - 400, true)
  }

  function onFlowTask(at: number) {
    selected = null
    seekPlay(clock.toPlay(at))
  }

  // Bulgu çekmecede açılır; akış sürer. `seek` yalnız şeritten ve klavyeyle gezinirken: bulgudan biraz önce (önceki
  // adımın imleç yolculuğu dahil) oynatılır, tuval o ana odaklanır ve bulgudan hemen sonra durulur (bulgunun ardından ne
  // olduğu da görünsün).
  /** Bulguya gidilince oynatma bulgudan bu kadar önce başlar ve bu kadar sonra durur (ms). */
  const FINDING_LEAD_MS = 3_000
  const FINDING_TAIL_MS = 1_500

  function openFinding(index: number, seek = false) {
    const finding = model.findings[index]
    if (!finding) return
    if (selected !== index) {
      detail = null
      detailFailed = false
      const id = finding.event.issueId
      api<IssueDetail>(`/sorunlar/${id}`)
        .then((d) => model.findings[selected ?? -1]?.event.issueId === id && (detail = d))
        .catch(() => (detailFailed = true))
    }
    selected = index
    if (!seek) return
    const before = model.steps.filter((s) => s.at <= finding.at).at(-1)
    const start = Math.min(clock.toPlay(before?.at ?? finding.at) - TRAVEL_MS - 400, clock.toPlay(finding.at) - FINDING_LEAD_MS)
    seekPlay(Math.max(0, start), true)
    pauseAt = Math.min(clock.end, finding.at + FINDING_TAIL_MS)
  }

  function moveFinding(delta: number) {
    const total = model.findings.length
    if (!total) return
    const base = findingNav.index
    openFinding(Math.min(Math.max(base < 0 && delta > 0 ? 0 : base + delta, 0), total - 1), true)
  }

  /**
   * Sıradaki adım: biten ya da durdurulan koşunun değerlendirmesi (devam koşusunda ana koşununki); koşu sürerken nedeni
   * söylenir. Bulgu yoksa değerlendirilecek bir şey yoktur: sıradaki adım kapanıştır.
   */
  const nextLabel = $derived(model.findings.length || running ? 'Sıradaki: Değerlendirme' : 'Sıradaki: Kapanış')
  function nextStep() {
    if (!current || current.status === 'sirada' || current.status === 'calisiyor')
      return notify.error('Değerlendirme henüz açılmadı', 'Koşu bitince ya da durdurulunca bulgular değerlendirilir.')
    go(`/onay/${current.options.parentRunId ?? runId}`)
  }

  function togglePlay() {
    if (following) {
      following = false
      playing = false
      return
    }
    if (!playing && position >= clock.duration - 50) wall = clock.start
    playing = !playing
    pauseAt = null
  }

  function seekBy(delta: number) {
    seekPlay(Math.min(Math.max(position + delta, 0), clock.duration))
  }

  function stepBy(delta: number) {
    const count = model.steps.length
    const target = model.steps[Math.min(Math.max(stepIndex + delta, 0), count - 1)]
    if (target) seekPlay(clock.toPlay(target.at), false)
  }

  async function copyLink() {
    const url = `${location.origin}${location.pathname}#/monitor/${runId}?t=${Math.floor(position / 1000)}`
    await navigator.clipboard.writeText(url).catch(() => undefined)
    copied = true
    setTimeout(() => (copied = false), 2_000)
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await player?.requestFullscreen()
  }

  function onKeydown(event: KeyboardEvent) {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('input, textarea, button, [contenteditable="true"]'))
      return
    // YouTube kısayolları: boşluk/K oynat, ←/→ 5 sn, J/L 10 sn; Shift+←/→ önceki/sonraki adım.
    const key = event.key.toLocaleLowerCase('tr')
    if (key === ' ' || key === 'k') {
      event.preventDefault()
      togglePlay()
    }
    if (event.key === 'ArrowLeft') event.shiftKey ? stepBy(-1) : seekBy(-5_000)
    if (event.key === 'ArrowRight') event.shiftKey ? stepBy(1) : seekBy(5_000)
    if (key === 'j') seekBy(-10_000)
    if (key === 'l') seekBy(10_000)
    if (event.key === 'b' || event.key === 'B') moveFinding(event.shiftKey ? -1 : 1)
    if (event.key === 'f' || event.key === 'F') void toggleFullscreen()
  }

  // Yönlendirme metni zorunludur; boş gönderimde hata alanın altında görünür (bildirim değil).
  let steerSubmitted = $state(false)
  const steerErrors = $derived(
    steerSubmitted
      ? validateFields([{ id: 'yonlendir', label: 'Yönlendirme', value: message, required: 'Kontrolcüye ne yapacağını yaz.' }])
      : [],
  )
  async function steer() {
    steerSubmitted = true
    if (steerErrors.length) return document.getElementById('yonlendir')?.focus()
    try {
      await post(`/kosular/${runId}/yonlendir`, { mesaj: message })
      message = ''
      steerSubmitted = false
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  // Devam et: durdurulan ya da yarıda kalan koşu aynı koşu olarak kaldığı yerden sürer (biten vakalar yeniden yürümez).
  const canResume = $derived(
    !!current && !running && (current.status === 'hata' || current.status === 'durduruldu') && !current.closedAt,
  )
  let resuming = $state(false)
  /** Üst şeritteki Durdur / Devam et: yanındaki durum etiketiyle aynı ölçekte (24 px, 12 px yazı). */
  const STRIP_BUTTON = 'h-6 gap-1 rounded-md px-2.5 text-[12px]'
  async function resume() {
    resuming = true
    try {
      await post<RunInfo>(`/kosular/${runId}/devam`)
      goLive()
    } catch (e) {
      notify.error('Koşu devam ettirilemedi', e instanceof Error ? e.message : String(e))
    } finally {
      resuming = false
    }
  }

  // Durdurma süren model çağrısını beklemez; yanıt gelene dek düğme basıldığını gösterir.
  let stopping = $state(false)
  async function stop() {
    stopping = true
    await post(`/kosular/${runId}/durdur`).catch((e: unknown) => {
      error = String(e)
      stopping = false
    })
  }

  let unsubscribe: (() => void) | null = null
  let raf = 0
  let last = 0

  function tick(t: number) {
    const dt = last ? Math.min(t - last, 100) : 0
    last = t
    now = Date.now()
    if (following && running) wall = now - LIVE_DELAY_MS
    else if (following) {
      following = false
      playing = false
      wall = clock.end
    } else if (playing) {
      const next = position + dt * speed
      wall = clock.toWall(next)
      if (pauseAt !== null && wall >= pauseAt) {
        wall = pauseAt
        pauseAt = null
        playing = false
      } else if (next >= clock.duration) {
        // Kaydın sonuna gelindi: koşu sürüyorsa canlıya bağlanır, bittiyse durur.
        if (running) following = true
        else playing = false
      }
    }
    raf = requestAnimationFrame(tick)
  }

  onMount(async () => {
    try {
      const [info, list, times] = await Promise.all([
        api<RunInfo>(`/kosular/${runId}`),
        api<RunEvent[]>(`/kosular/${runId}/olaylar`),
        api<{ frames: number[]; dropped: boolean }>(`/kosular/${runId}/kareler`),
      ])
      // Planı onaylanmamış koşu henüz koşmuyor: izleme yerine Plan adımı açılır.
      if (info.planState && info.planState !== 'onaylandi') return go(`/plan/${runId}`)
      run = info
      // Canlı akıştaki kopya eskiyse (kopukken kaçan güncelleme) sunucudan gelen güncel hâl geçerlidir.
      live.runs[runId] = info
      pageName.current = info.code
      events = list
      frames = times.frames
      dropped = times.dropped
      // Paylaşılan an (`?t=<sn>`) varsa orada durulur; yoksa süren koşu canlıdan, biten koşu baştan oynatılır.
      const shared = Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('t'))
      following = (info.status === 'calisiyor' || info.status === 'sirada') && !shared
      wall = shared ? clock.toWall(shared * 1000) : clock.start
      if (shared) playing = false
      ready = true
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    unsubscribe = subscribe((m) => {
      if (m.type === 'kare') {
        if (m.runId !== runId) return
        liveData.set(m.at, `data:image/jpeg;base64,${m.data}`)
        if (liveData.size > LIVE_CACHE) liveData.delete(liveData.keys().next().value!)
        if (!frames.length || m.at > frames[frames.length - 1]!) frames.push(m.at)
        return
      }
      if (m.type === 'imlec') {
        if (m.runId === runId)
          liveMoves = [...liveMoves.slice(-20), { at: m.at, tool: m.tool, target: m.target }]
        return
      }
      if (m.type === 'kosu-guncellendi' || m.type === 'calisma-alani') {
        if (m.type === 'kosu-guncellendi' && m.run.id === runId) run = m.run
        return
      }
      if (m.runId !== runId || events.some((e) => e.seq === m.seq)) return
      events.push(m)
    })
    raf = requestAnimationFrame(tick)
  })

  // Canlı akış yeniden bağlandı: kopukken kaçan olaylar sunucudan okunup eklenir (sıra numarasıyla, tekrarsız).
  let seenEpoch = live.epoch
  $effect(() => {
    const epoch = live.epoch
    if (epoch === seenEpoch || !ready) return
    seenEpoch = epoch
    void api<RunEvent[]>(`/kosular/${runId}/olaylar`)
      .then((list) => {
        const known = new Set(events.map((e) => e.seq))
        const missed = list.filter((e) => !known.has(e.seq))
        if (missed.length) events = [...events, ...missed].sort((a, b) => a.seq - b.seq)
      })
      .catch(() => undefined)
  })

  onDestroy(() => {
    unsubscribe?.()
    cancelAnimationFrame(raf)
  })
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:document onfullscreenchange={() => (fullscreen = document.fullscreenElement === player)} />

<!--
  Çalışma alanı ekranı doldurur, sayfa kaymaz (Sentry Replay, PostHog, Cypress Test Replay düzeni): solda oynatıcı —
  üst şerit (başlık, tarayıcı adresi, durum), gri tuvalde pencere gibi duran kayıt, çubuk ve şeritler altta sabit —,
  sağda her zaman açık panel (akış ya da bulgunun ayrıntısı). Kayıt tuvale iki yönde de sığar; zaman çizelgesi laptop
  boyutunda da kaydırmadan görünür.
-->
<!-- Başlık şeridi yok: tuval yer kazansın. Koşunun kodu üstteki izde ve sekme başlığında, "Sıradaki" düğmesi adım
     çubuğunun sağında. -->
<Page class="h-[calc(100svh-56px-69px)] gap-3 py-3">
  {#snippet subheader()}
    <RunSteps run={current} current="kosu">
      {#snippet actions()}<Button onclick={nextStep}>{nextLabel}</Button>{/snippet}
    </RunSteps>
  {/snippet}

  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(300px,24vw,380px)] gap-3">
    <div
      bind:this={player}
      class="bg-card flex min-h-0 flex-col overflow-hidden rounded-xl border [&:fullscreen]:rounded-none"
    >
      <!-- Üst şerit: sayfa başlığının yerini alır; adres "aşağısı bir tarayıcı ekranı" der. -->
      <div class="flex h-11 shrink-0 items-center gap-2.5 border-b pr-2.5 pl-3.5">
        <h1 class="shrink-0 text-sm font-semibold">
          {run?.code ?? 'Koşu'}<span class="text-muted-foreground ml-1.5 font-normal"
            >{running ? 'canlı' : 'kayıt'}</span
          >
        </h1>
        <div
          class="bg-surface-alt text-muted-foreground flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 font-mono text-xs"
          title={pageUrl}
        >
          <Icon name="webAsset" class="size-3.5 shrink-0" /><span class="truncate">{pageUrl || '—'}</span>
        </div>
        {#if error}<span class="text-destructive max-w-[30%] truncate text-xs" title={error}>{error}</span
          >{/if}
        <span class="text-muted-foreground/80 hidden shrink-0 font-mono text-[11px] xl:inline">1280×800</span>
        {#if current}
          <span
            class="text-muted-foreground tabular hidden shrink-0 text-[12.5px] lg:inline"
            title={costHint(current.usage)}>{elapsed} · {formatCost(current.usage)}</span
          >
          <RunStatusBadge status={current.status} />
        {/if}
        <!-- Durdur belirgin (kırmızı çerçeve); durunca yerinde "Devam et" (kaldığı yerden). -->
        {#if running}<Button
            size="xs"
            variant="outline"
            disabled={stopping}
            onclick={stop}
            class={cn(STRIP_BUTTON, 'border-[#fda29b] text-[#b42318] hover:bg-[#fef3f2] hover:text-[#912018]')}
            ><Icon name="mediaPause" class="size-3.5" />{stopping ? 'Durduruluyor…' : 'Durdur'}</Button
          >{/if}
        {#if canResume}<Button size="xs" disabled={resuming} onclick={resume} class={STRIP_BUTTON}
            ><Icon name="mediaPlay" class="size-3.5" />{resuming ? 'Başlatılıyor…' : 'Devam et'}</Button
          >{/if}
      </div>

      <!-- Gri tuval: kayıt bir pencere gibi ortada, iki yönde de sığar. -->
      <div
        class={cn(
          'relative grid min-h-0 flex-1 place-items-center [container-type:size]',
          // Akış tuvali ve tarayıcı kaydı aynı koyu zeminde: ikisi arasında geçerken ekran parlamaz.
          platformFlow
            ? 'bg-[#141922]'
            : 'bg-[#141922] bg-[radial-gradient(#212836_1px,transparent_1px)] [background-size:16px_16px] p-3',
        )}
      >
        {#if recentFinding !== null && recentFinding !== selected}
          {#key recentFinding}
            <FindingToast
              finding={model.findings[recentFinding]!}
              caseLabel={caseOfFinding(recentFinding)}
              age={position - clock.toPlay(model.findings[recentFinding]!.at)}
              duration={TOAST_MS}
              onopen={() => openFinding(recentFinding!)}
            />
          {/key}
        {/if}
        {#if platformFlow}
          <div class="h-full w-full self-stretch justify-self-stretch">
            <FlowCanvas
              lanes={platformFlow.lanes}
              findings={platformFlow.findings}
              current={platformFlow.current}
              {playing}
              {focusRequest}
              alarm={recentFinding !== null ? model.findings[recentFinding]!.event.occurrenceId : null}
              live={running && following}
            />
          </div>
        {:else}
          <Stage
            {src}
            {prefetch}
            {pointer}
            {zoom}
            {dialog}
            status={waiting}
            {caption}
            chip={fallback && ready ? 'Adım görüntüleri · sürekli kayıt yok' : null}
            ontoggle={togglePlay}
            onseekby={seekBy}
            finding={findingOverlay}
            paused={ready && !playing && !following && model.steps.length > 0}
            {ending}
            placeholder={!ready
              ? 'Yükleniyor'
              : running
                ? 'Görüntü bekleniyor'
                : dropped
                  ? 'Kayıt yerel temizlikte silindi; akış ve bulgular duruyor'
                  : 'Bu koşunun kaydı yok'}
            onrestart={() => seekPlay(0, true)}
          />
        {/if}
      </div>

      <div class="shrink-0">
        <PlayerBar
          {playing}
          {position}
          duration={clock.duration}
          action={barAction}
          {running}
          live={atLive}
          {speed}
          zoomed={autoZoom}
          {fullscreen}
          {copied}
          onplay={togglePlay}
          onseekby={seekBy}
          onlive={goLive}
          onspeed={(value) => (speed = value)}
          onzoom={() => (autoZoom = !autoZoom)}
          oncopy={copyLink}
          onfullscreen={toggleFullscreen}
        />
      </div>
      <div class="shrink-0 border-t">
        <Tracks
          {lanes}
          duration={clock.duration}
          {position}
          live={atLive}
          selectedFinding={selected}
          loading={running && !planned}
          onseek={(value) => seekPlay(value)}
          onfinding={(index) => openFinding(index, true)}
        />
      </div>
    </div>

    <Card.Root class="flex min-h-0 flex-col gap-0 overflow-hidden py-0">
      <StoryPanel
        rows={plan}
        numbers={caseNumbers}
        findings={model.findings}
        steps={model.steps}
        {running}
        {halt}
        active={activeCases}
        currentStep={step?.seq ?? null}
        offset={(at) => clock.toPlay(at)}
        onjump={onFlowTask}
        onstep={onFlowStep}
        onfinding={openFinding}
        recent={recentFinding}
      />
      {#if running}
        <form
          class="flex shrink-0 items-start gap-2 border-t p-3"
          onsubmit={(e) => {
            e.preventDefault()
            void steer()
          }}
        >
          <div class="grid min-w-0 flex-1 gap-1" data-field="yonlendir">
            <Input
              id="yonlendir"
              placeholder="Kontrolcüyü yönlendir: tarih filtresini de dene"
              aria-invalid={steerErrors.length ? true : undefined}
              aria-describedby={steerErrors.length ? 'yonlendir-hata' : undefined}
              bind:value={message}
            />
            {#if steerErrors.length}<p id="yonlendir-hata" class="text-destructive text-xs">
                {errorOf(steerErrors, 'yonlendir')}
              </p>{/if}
          </div>
          <Button type="submit" variant="outline">Gönder</Button>
        </form>
      {/if}
    </Card.Root>
  </div>
</Page>

<FindingDetail
  finding={selected === null ? null : (model.findings[selected] ?? null)}
  {occurrence}
  failed={detailFailed}
  caseLabel={selectedCase}
  onclose={() => (selected = null)}
/>
