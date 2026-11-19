<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { fly } from 'svelte/transition'
  import Icon from '$lib/components/Icon.svelte'
  import { layoutMetro, METRO, orbCenter, STATION, type MetroNode } from '$lib/flow-layout'
  import type { MonitorStep } from '$lib/monitor'
  import { flowCards, operationIcon, plainCall, type FlowCard } from '$lib/platform-steps'
  import { cn } from '$lib/utils'

  /**
   * Platform işlerinin metro haritası (`flow-layout.ts`), koyu tuvalde (uzun izlemede göz yormasın). Sıralı vakalar tek
   * ana hatta akar; aynı anda koşan vaka kendi yuvasında renkli bir yan hattır, bitince ana hatta bağlanır, yuvası
   * sonrakine geçer. Duraklar tek zaman sırasıyla dizildiği için kamera yalnız ileri kayar. Durak: işlemi anlatan simge (`operationIcon`), başlık adımın sade işi (modelin `label`'ı,
   * yoksa araçtan türetilen cümle), altında nedeni; art arda gelen adımları toplayan durakta okunanlar listesi birikir
   * (en yenisi üstte), hızlı geçen okuma kaçmaz. Başarısızlık kırmızı halka, çalışma dönen ince yay, etkin durak atan bir
   * ışımadır.
   *
   * Kamera: izlerken koşan bütün hatlar tek karede durur; kare onları sığdıracak kadar uzaklaşır (en çok FIT_MIN'e),
   * tek hat kalınca FOCUS yakınlığına döner, hatlar arasında zıplamaz. Soldaki hat etiketine tıklayınca kamera yalnız o
   * vakayı FOCUS yakınlığında izler, diğer hatlar arkada soluk sürer. Kullanıcı sürükler, kaydırır ya da yakınlaşırsa
   * kontrol onundur, yeni durak gelse de kamera kıpırdamaz; Akışa dön, Oynat ya da akıştan bir ana atlamak geri getirir.
   *
   * Akışı tamamen kod çizer: model yalnız adımın iki kısa alanını yazar. Performans: yalnız görünür duraklar çizilir,
   * animasyon yalnız transform/opacity/stroke-dashoffset'tir, yeni durak ve hattı bir kez canlanır (ekrana geri giren
   * yeniden canlanmaz); düşük güçlü makinede ve azaltılmış harekette süs animasyonları kapanır. Kamera efekti kamerayı
   * okumaz (`untrack`): okusaydı her yazışta kendini yeniden tetikler, arayüz donardı.
   */
  let {
    lanes,
    findings,
    current,
    live,
    playing,
    focusRequest,
    alarm,
  }: {
    /** Vaka başına şu ana dek platform adımları (oynatma anına göre); `done`: vaka bitti. */
    /** `no` null: vakaya bağlı olmayan iş (planlamadan önceki okuma). */
    lanes: Array<{ key: string; no: number | null; title: string; steps: MonitorStep[]; done: boolean }>
    /** Bu sayfada şu ana dek kaydedilen bulgular. */
    findings: Array<{ key: string; at: number; title: string; severity: string }>
    /** O anki adımın sırası. */
    current: number
    /** Koşu sürüyor ve oynatma canlıda. */
    live: boolean
    /** Oynatma sürüyor (Oynat'a basılınca kamera odak yakınlığına döner). */
    playing: boolean
    /** Kullanıcının açık atlaması (akıştan, şeritten, oynatıcıdan) her seferinde artar: odak o ana gelir. */
    focusRequest: number
    /** Az önce bulunan bulgunun anahtarı: tuvalde dalga dalga yayılan halkalarla duyurulur. */
    alarm: string | null
  } = $props()

  /** Hat renkleri, koyu zemine göre: ana hat mavi, yan hatlar ayırt edilir ama aynı doygunlukta tonlar. */
  const LANE_COLORS = ['#7aa2ff', '#5fd4b0', '#f2b866', '#b69cff', '#f28fb0', '#66cfe0']
  const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length]!
  const FAIL = '#ff6b6b'
  /** Tek hat izlenirken ve odakta yakınlık; paralel hatları sığdırırken en çok bu kadar uzaklaşılır. */
  const FOCUS = 1
  const FIT_MIN = 0.6
  /**
   * Grup durağında gösterilen en çok satır ve tek nedenin en çok satırı. Paralel hatlar tek karedeyken duraklar sıkıdır
   * (üç hat kadraja sığsın); bir vakaya odaklanınca ya da tek hat varken tam liste açılır.
   */
  const FULL = { rows: 10, reason: 5 }
  const COMPACT = { rows: 3, reason: 2 }

  type Card = FlowCard<MonitorStep> & { at: number }
  type Finding = (typeof findings)[number]
  const isCard = (n: MetroNode<Card, Finding>): n is Extract<MetroNode<Card, Finding>, { kind: 'card' }> =>
    n.kind === 'card'

  /** Odaklanılan vaka (hat sırası); null: koşan bütün hatlar tek karede. */
  let focusLane = $state<number | null>(null)
  const metroLanes = $derived(
    lanes.map((lane) => ({
      key: lane.key,
      done: lane.done,
      cards: flowCards(lane.steps).map((card) => ({ ...card, at: card.steps[0]!.at })),
    })),
  )
  const full = $derived(layoutMetro<Card, Finding>(metroLanes, findings, (c) => stationHeight(c, FULL)))
  const compact = $derived(full.slots.length > 1 && focusLane === null)
  const show = $derived(compact ? COMPACT : FULL)
  const layout = $derived(
    compact ? layoutMetro<Card, Finding>(metroLanes, findings, (c) => stationHeight(c, COMPACT)) : full,
  )
  const cardsOf = (lane: number) => layout.nodes.filter(isCard).filter((n) => n.lane === lane)
  /** Koşan hatlar; hiçbiri koşmuyorsa etkin durağın hattı. */
  const runningLanes = $derived.by(() => {
    const open = lanes.flatMap((lane, i) => (!lane.done && lane.steps.length ? [i] : []))
    return open.length ? open : active?.kind === 'card' ? [active.lane] : []
  })
  /** Her yuvada son giren vaka: solda etiketi durur (biten vaka, yuvası el değiştirene dek görünür). */
  const tags = $derived(
    layout.slots.map((slot, index) => {
      const lane = layout.laneSlot.findLastIndex((s) => s === index)
      return { slot, lane, info: lanes[lane]! }
    }),
  )
  const active = $derived(
    layout.nodes.find((n) => n.kind === 'card' && n.card.steps.some((s) => s.seq === current)) ?? null,
  )

  // Düşük güç: az çekirdek ya da azaltılmış hareket ayarında süs animasyonları kapalı.
  const lite =
    typeof window !== 'undefined' &&
    ((navigator.hardwareConcurrency ?? 8) <= 4 ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  let width = $state(0)
  let height = $state(0)
  let cam = $state({ x: 0, y: 0, s: FOCUS })
  let manual = $state(false)
  let dragging = $state(false)
  // İlk yerleşimde kamera kaymadan yerine oturur; sonraki odak değişimleri yumuşak kayar.
  let glide = $state(false)
  // Kayış sürerken eski görünür alan da çizilir: yalnız hedef alan çizilseydi kayış boyunca tuval boş görünürdü.
  let trail = $state<{ x: number; s: number } | null>(null)
  let trailTimer: ReturnType<typeof setTimeout> | undefined

  function move(next: { x: number; y: number; s: number }) {
    if (glide) {
      trail = { x: cam.x, s: cam.s }
      clearTimeout(trailTimer)
      trailTimer = setTimeout(() => (trail = null), 1000)
    } else requestAnimationFrame(() => (glide = true))
    cam = next
  }

  /**
   * Kadraj. Odakta: o vakanın son durağı FOCUS yakınlığında. Değilse koşan hatların yuvaları dikeyde tek karede, en öndeki
   * sütun yatayda sağda (gelecek duraklara yer kalsın).
   */
  function frame() {
    const focused = focusLane === null ? null : (cardsOf(focusLane).at(-1) ?? null)
    if (focused) {
      const c = orbCenter(focused)
      move({ s: FOCUS, x: width * 0.66 - c.x * FOCUS, y: height * 0.42 - (c.y + STATION.orb / 2) * FOCUS })
      return
    }
    const cards = layout.nodes.filter(isCard)
    if (!cards.length) return move({ s: FOCUS, x: width * 0.4, y: height * 0.42 })
    const bands = runningLanes.flatMap((lane) => layout.slots[layout.laneSlot[lane]!] ?? [])
    const top = Math.min(...bands.map((b) => b.y)) - METRO.room
    const bottom = Math.max(...bands.map((b) => b.y + Math.max(b.h, STATION.orb)))
    const s = Math.max(FIT_MIN, Math.min(FOCUS, (height - 40) / (bottom - top)))
    const headX = Math.max(...cards.map((n) => n.x)) + STATION.w / 2
    move({ s, x: width * 0.66 - headX * s, y: height / 2 - ((top + bottom) / 2) * s })
  }

  function follow() {
    manual = false
    frame()
  }

  function toggleFocus(lane: number) {
    focusLane = focusLane === lane ? null : lane
    follow()
  }

  // Kamera etkin durağı izler; kullanıcı odağı değiştirdiyse (sürükleme, yakınlaştırma) yeni durak ya da yeni vaka gelse
  // de yerinde kalır. Odak yalnız açık eylemle geri gelir: Akışa dön, Oynat ya da akıştan/şeritten bir ana atlamak.
  $effect(() => {
    void active
    void layout
    if (!width || !height) return
    untrack(() => {
      if (!manual) frame()
    })
  })

  let lastRequest = untrack(() => focusRequest)
  $effect(() => {
    const request = focusRequest
    untrack(() => {
      if (request !== lastRequest && width) follow()
      lastRequest = request
    })
  })

  // Oynat'a basılınca kamera odak yakınlığına ve etkin durağa döner.
  let wasPlaying = false
  $effect(() => {
    const now = playing
    untrack(() => {
      if (now && !wasPlaying && width) follow()
      wasPlaying = now
    })
  })

  // Doğuş animasyonu yalnız yeni durak ve hat içindir: ilk açılışta görünenler ve ekrana geri girenler canlanmaz.
  let ready = false
  const seenNodes = new Set<string>()
  const seenEdges = new Set<string>()
  onMount(() => {
    requestAnimationFrame(() => (ready = true))
  })
  function born(el: HTMLElement, key: string) {
    if (ready && !seenNodes.has(key)) el.classList.add('grow')
    seenNodes.add(key)
  }
  // Aynı anda tek hat çizilir: art arda gelen duraklarda önceki çizim anında tamamlanır, birden çok çizgi birlikte akmaz.
  let reaching: SVGPathElement | null = null
  function drawn(el: SVGPathElement, key: string) {
    if (ready && !seenEdges.has(key)) {
      reaching?.classList.remove('reach')
      el.classList.add('reach')
      reaching = el
      if (!lite) {
        comet = { key, path: el.getAttribute('d') ?? '', color: el.getAttribute('stroke') ?? '#fff' }
        clearTimeout(cometTimer)
        cometTimer = setTimeout(() => (comet = null), 1100)
      }
    }
    seenEdges.add(key)
  }
  /** Kameranın ve hattın eğrisi: cubic-bezier(0.22, 1, 0.36, 1); ikili aramayla zamandan ilerleme. */
  const ease = (t: number) => {
    const [x1, y1, x2, y2] = [0.22, 1, 0.36, 1]
    const at = (u: number, a: number, b: number) =>
      3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u
    let lo = 0
    let hi = 1
    let u = t
    for (let i = 0; i < 18; i += 1) {
      if (at(u, x1, x2) < t) lo = u
      else hi = u
      u = (lo + hi) / 2
    }
    return at(u, y1, y2)
  }

  /**
   * Kuyruklu yıldızın hareketi: yol baştan noktalara örneklenir, hareket yalnız transform keyframe'leridir. Ekran
   * kartında, ana iş parçacığından bağımsız akar (yol boyunca ilerleme, `offset-distance`, ana iş parçacığında
   * hesaplanıyor; yeni durak gelirken arayüz güncellenince takılıyordu).
   */
  function travel(el: HTMLElement, path: string) {
    const host = el.parentElement?.querySelector('svg')
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    probe.setAttribute('d', path)
    host?.appendChild(probe)
    const length = probe.getTotalLength()
    const N = 36
    const frames = Array.from({ length: N + 1 }, (_, i) => {
      const at = ease(i / N) * length
      const p = probe.getPointAtLength(at)
      const a = probe.getPointAtLength(Math.max(0, at - 1))
      const b = probe.getPointAtLength(Math.min(length, at + 1))
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      const end = i / N
      return {
        offset: end,
        transform: `translate(${p.x}px, ${p.y}px) rotate(${angle}deg)`,
        opacity: end < 0.86 ? 1 : 1 - (end - 0.86) / 0.14,
      }
    })
    probe.remove()
    const motion = el.animate(frames, { duration: 900, easing: 'linear', fill: 'forwards' })
    return { destroy: () => motion.cancel() }
  }

  // Hattın ucunda ilerleyen kuyruklu yıldız: çizilen hatla aynı sürede ve eğride gider, varınca söner.
  let comet = $state<{ key: string; path: string; color: string } | null>(null)
  let cometTimer: ReturnType<typeof setTimeout> | undefined

  // Görünür alan (dünya koordinatı) ve ona düşen duraklar/hatlar: ekran dışı çizilmez.
  const MARGIN = 360
  const view = $derived.by(() => {
    const spans = [cam, ...(trail ? [trail] : [])].map((c) => [-c.x / c.s, (width - c.x) / c.s])
    return {
      x0: Math.min(...spans.map((v) => v[0]!)) - MARGIN,
      x1: Math.max(...spans.map((v) => v[1]!)) + MARGIN,
    }
  })
  const visibleNodes = $derived(layout.nodes.filter((n) => n.x + STATION.w > view.x0 && n.x < view.x1))
  const edgeSpan = $derived(
    layout.edges.map((e) => {
      const nums = e.path.match(/-?\d+(\.\d+)?/g)!.map(Number)
      return { edge: e, x0: Math.min(nums[0]!, nums.at(-2)!), x1: Math.max(nums[0]!, nums.at(-2)!) }
    }),
  )
  /** Hattın vardığı uç (soluklaşma hattın vardığı durağa göre). */
  const edgeEnd = (edge: (typeof layout.edges)[number]) =>
    Number(edge.path.match(/-?\d+(\.\d+)?/g)!.at(-2)) - STATION.w / 2
  const visibleEdges = $derived(edgeSpan.filter((e) => e.x1 > view.x0 && e.x0 < view.x1).map((e) => e.edge))

  let start: { x: number; y: number; cx: number; cy: number } | null = null
  function onPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest('[data-controls]')) return
    start = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: PointerEvent) {
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!dragging && Math.abs(dx) + Math.abs(dy) > 4) {
      dragging = true
      manual = true
    }
    if (dragging) cam = { ...cam, x: start.cx + dx, y: start.cy + dy }
  }
  function onPointerUp() {
    start = null
    dragging = false
  }
  function onWheel(event: WheelEvent) {
    event.preventDefault()
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - box.left, event.clientY - box.top)
  }
  /** Yakınlığı odak yakınlığına döndürür; ekranın ortası yerinde kalır. */
  function resetZoom() {
    zoomAt(FOCUS / cam.s)
  }

  function zoomAt(factor: number, px = width / 2, py = height / 2) {
    const s = Math.min(1.6, Math.max(0.2, cam.s * factor))
    cam = { s, x: px - ((px - cam.x) * s) / cam.s, y: py - ((py - cam.y) * s) / cam.s }
    manual = true
  }

  const lastStep = (card: Card) => card.steps.at(-1)!
  /** Bir adımın sade satırı: modelin yazdığı iş, yoksa nedeni, yoksa araçtan türetilen cümle. */
  const lineOf = (step: MonitorStep) => step.platform?.label?.trim() || step.reason || plainCall(step).title
  /** Başlık: tek adımda adımın işi; grupta grubun genel adı ("Tanımları okudu"), adımlar listede. */
  const titleOf = (card: Card) =>
    card.steps.length > 1 ? card.call.title : lastStep(card).platform?.label?.trim() || card.call.title
  /**
   * Geçmişin soluklaşması: akış izlenirken etkin durak tam parlaklıkta, geride kalanlar sırayla hafifçe solar (geçmiş
   * hissi). Kullanıcı akıştan çıkıp gezinirken her şey tam parlaklıktadır: gördüğü yeri okuyabilmeli.
   */
  const head = $derived(Math.max(0, ...layout.nodes.filter(isCard).map((n) => n.x)))
  const fade = (x: number, lane: number) => {
    if (focusLane !== null && lane !== focusLane) return 0.28
    if (manual || !active) return 1
    const behind = Math.round(((focusLane === null ? head : active.x) - x) / METRO.step)
    return behind <= 0 ? 1 : Math.max(0.28, 1 - behind * 0.14)
  }
  /**
   * Durağın tahmini yüksekliği (yuvanın boyu buna göre): yuvarlak, başlık, okunanlar listesi ya da neden. Satır sayısı
   * metnin uzunluğundan kabaca kestirilir; az tahmin hatları bindirir, bu yüzden pay cömerttir.
   */
  function stationHeight(card: Card, limit: { rows: number; reason: number }) {
    const lines = (text: string, per: number, max: number) => Math.min(max, Math.ceil(text.length / per) || 1)
    const title = lines(titleOf(card), 26, 2) * 17
    if (card.steps.length > 1) {
      const rows = card.steps
        .slice(-limit.rows)
        .reduce((sum, step) => sum + lines(lineOf(step), 30, 2) * 14 + 3, 0)
      return STATION.orb + 8 + title + 4 + rows + (card.steps.length > limit.rows ? 18 : 0) + 8
    }
    const reason = lastStep(card).reason
    return STATION.orb + 8 + title + (reason ? 4 + lines(reason, 28, limit.reason) * 15 : 0) + 8
  }
</script>

<div
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="application"
  aria-label="Platform iş akışı"
  class={cn(
    'metro relative h-full w-full overflow-clip select-none',
    dragging ? 'cursor-grabbing' : 'cursor-grab',
    lite && 'lite',
  )}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
>
  <div
    class={cn('world absolute top-0 left-0 origin-top-left', !dragging && glide && 'glide')}
    style={`transform: translate3d(${cam.x}px, ${cam.y}px, 0) scale(${cam.s})`}
  >
    <svg class="pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1">
      {#each visibleEdges as edge (edge.key)}
        {@const color = laneColor(edge.lane)}
        {@const hot = active?.key === edge.to}
        {#if edge.kind === 'finding'}
          <path
            d={edge.path}
            class={cn(edge.to === alarm && 'alarm-line')}
            fill="none"
            stroke={FAIL}
            stroke-width={edge.to === alarm ? 2 : 1.5}
            stroke-dasharray="3 5"
            stroke-linecap="round"
            opacity={edge.to === alarm ? 1 : 0.75}
          />
        {:else}
          <path
            use:drawn={edge.key}
            d={edge.path}
            pathLength="1"
            fill="none"
            stroke={color}
            stroke-width={hot ? 3 : 2.5}
            stroke-linecap="round"
            opacity={(hot ? 1 : edge.kind === 'merge' ? 0.3 : 0.5) * fade(edgeEnd(edge), edge.lane)}
            stroke-dasharray={edge.kind === 'merge' ? '0.01 0.016' : undefined}
          />
          {#if hot && live && !lite}
            <path
              d={edge.path}
              class="flow"
              fill="none"
              stroke="#ffffff"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          {/if}
        {/if}
      {/each}
    </svg>

    {#if comet}
      {#key comet.key}
        <div
          use:travel={comet.path}
          class="comet pointer-events-none absolute top-0 left-0"
          style={`--c:${comet.color}`}
        >
          <span class="tail"></span><span class="head"></span>
        </div>
      {/key}
    {/if}

    {#each visibleNodes as node (node.key)}
      <!-- Konum dış kutuda, doğuş animasyonu içteki gövdede: ölçek konumu taşıyan kutuya uygulansaydı durak konumuyla
           birlikte ölçeklenip soldan kayarak gelirdi (uzaktaki duraklar "fırlıyordu"). -->
      <div
        class="faded absolute"
        style={`transform: translate3d(${node.x}px, ${node.y}px, 0); width:${STATION.w}px; --fade:${fade(node.x, node.lane)}`}
      >
        <div use:born={node.key} class="station">
          {#if node.kind === 'start'}
            <div class="grid justify-items-center gap-2 text-center">
              <span class="grid size-12 place-items-center rounded-full bg-[#e6eaf1] text-[#0f131a]">
                <Icon name="play" class="size-5" />
              </span>
              <span class="txt text-[12.5px] font-semibold text-[#e6eaf1]">Koşu başladı</span>
            </div>
          {:else if node.kind === 'finding'}
            <!-- Bulgu durağın üstündeki payda: elmas ve tek satır başlık (önem önde); tamamı panelde ve duyuru kartında. -->
            <div class="grid justify-items-center gap-1.5 text-center" title={node.finding.title}>
              <span
                class="relative mt-1 grid size-6 rotate-45 place-items-center rounded-[6px] bg-[#2a1416] ring-[1.5px] ring-[#ff6b6b]"
              >
                {#if node.key === alarm && !lite}
                  <span class="ripple absolute inset-0 rounded-[6px]"></span>
                  <span class="ripple late absolute inset-0 rounded-[6px]"></span>
                {/if}
                <Icon name="warning" class="size-3 -rotate-45 text-[#ff6b6b]" />
              </span>
              <span class="txt max-w-[204px] truncate text-[12px] leading-[17px] font-semibold text-[#ff8a8a]"
                ><span class="font-bold">{node.finding.severity}</span> · {node.finding.title}</span
              >
            </div>
          {:else if isCard(node)}
            {@const card = node.card}
            {@const failed = !card.call.ok}
            {@const running = live && card.steps.some((s) => s.seq === current)}
            {@const isActive = active?.key === node.key}
            {@const color = failed ? FAIL : laneColor(node.lane)}
            {@const group = card.steps.length > 1}
            <div class="grid justify-items-center gap-2 text-center">
              <span
                class={cn('orb relative grid size-12 place-items-center rounded-full', isActive && 'active')}
                style={`--c:${color}`}
              >
                {#if isActive && !lite}<span class="pulse absolute inset-0 rounded-full"></span>{/if}
                {#if running}<span class="arc absolute -inset-[5px] rounded-full"></span>{/if}
                <Icon name={failed ? 'error' : operationIcon(lastStep(card))} class="relative size-[21px]" />
                {#if group}
                  <span
                    class="absolute -top-1.5 -right-2.5 rounded-full bg-[#0f131a] px-1.5 text-[10px] leading-4 font-semibold text-[#c9d1dd] tabular-nums ring-1 ring-[#2c3442]"
                    >{card.steps.length}</span
                  >
                {/if}
              </span>
              <span class="txt grid w-full gap-1">
                <span
                  class={cn(
                    'line-clamp-2 justify-self-center text-center max-w-[196px] text-[13px] leading-[17px] font-semibold',
                    failed ? 'text-[#ff8a8a]' : 'text-[#e6eaf1]',
                  )}>{titleOf(card)}</span
                >
                {#if group}
                  <ol class="grid w-fit max-w-[204px] gap-[3px] justify-self-center">
                    {#each card.steps.slice(-show.rows).reverse() as step, i (step.seq)}
                      <li
                        class={cn(
                          'row line-clamp-2 px-1.5 text-left text-[11.5px] leading-[14px]',
                          'text-[#8f99a9]',
                        )}
                        title={lineOf(step)}
                      >
                        <span
                          class="mr-1 inline-block size-1 rounded-full align-middle"
                          style={`background:${color}`}
                        ></span>{lineOf(step)}
                      </li>
                    {/each}
                  </ol>
                  {#if card.steps.length > show.rows}
                    <span class="w-fit justify-self-center px-1.5 text-left text-[10.5px] text-[#6c7686]"
                      >+{card.steps.length - show.rows} önceki</span
                    >
                  {/if}
                {:else if lastStep(card).reason}
                  <span
                    class="w-fit max-w-[204px] justify-self-center px-1.5 text-center text-[11.5px] leading-[15px] text-[#8f99a9]"
                    style={`display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;-webkit-line-clamp:${show.reason}`}
                    >{lastStep(card).reason}</span
                  >
                {/if}
              </span>
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Hat etiketleri: her yuvanın vakası solda, kendi hattının hizasında; tıklayınca o vakaya odaklanılır. -->
  {#if tags.length}
    <div class="tags pointer-events-none absolute inset-y-0 left-0 w-[248px]" data-controls>
      {#each tags as tag (tag.lane)}
        {@const y = cam.y + (tag.slot.y + STATION.orb / 2) * cam.s}
        {@const focused = focusLane === tag.lane}
        {#if y > 12 && y < height - 12}
          <button
            type="button"
            class={cn(
              'tag pointer-events-auto absolute left-3',
              !dragging && glide && 'glide-top',
              focused && 'on',
            )}
            style={`top:${y}px; --c:${laneColor(tag.lane)}`}
            onclick={() => toggleFocus(tag.lane)}
            title={focused ? 'Odaktan çık' : 'Bu vakaya odaklan'}
          >
            <span class={cn('dot', !tag.info.done && 'live')}></span>
            <span class="text">
              {#if tag.info.no !== null}<span class="no">Vaka {tag.info.no}</span>{/if}
              <span class="name">{tag.info.title}</span>
            </span>
          </button>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="absolute right-3 bottom-3 flex items-center gap-1.5" data-controls>
    {#if focusLane !== null}
      <button
        type="button"
        transition:fly={{ y: 8, duration: 180 }}
        onclick={() => toggleFocus(focusLane!)}
        title="Odaktan çık, bütün vakaları göster"
        class="flex h-8 items-center gap-1.5 rounded-lg bg-[#1c2230] px-3 text-[12.5px] font-semibold text-[#e6eaf1] shadow-[0_4px_14px_rgb(0_0_0/0.35)] ring-1 ring-[#3a4456] transition-colors hover:bg-[#252c3b]"
      >
        <Icon name="close" class="size-4" />Tüm vakalar
      </button>
    {/if}
    {#if manual && active}
      <button
        type="button"
        transition:fly={{ y: 8, duration: 180 }}
        onclick={follow}
        title="Kamerayı yeniden akışın ucuna bağla"
        class="flex h-8 items-center gap-1.5 rounded-lg bg-[#0c66e4] px-3 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgb(12_102_228/0.45)] transition-colors hover:bg-[#0055cc]"
      >
        <Icon name="mediaZoom" class="size-4" />Akışa dön
      </button>
    {/if}
    <div
      class="flex h-8 items-center overflow-hidden rounded-lg bg-[#1c2230] text-[#aab3c2] shadow-[0_4px_14px_rgb(0_0_0/0.35)] ring-1 ring-[#3a4456]"
    >
      <button
        type="button"
        class="px-2.5 py-1.5 hover:bg-white/5"
        onclick={() => zoomAt(1 / 1.2)}
        aria-label="Uzaklaş"
      >
        <Icon name="remove" class="size-4" />
      </button>
      <span class="w-11 text-center text-[11px] tabular-nums">{Math.round(cam.s * 100)}%</span>
      {#if Math.abs(cam.s - FOCUS) > 0.01}
        <button
          type="button"
          class="border-l border-[#262d3a] px-2.5 py-1.5 text-[12px] hover:bg-white/5"
          onclick={resetZoom}
          title="Yakınlığı %100'e döndür">%100</button
        >
      {/if}
      <button
        type="button"
        class="px-2.5 py-1.5 hover:bg-white/5"
        onclick={() => zoomAt(1.2)}
        aria-label="Yakınlaş"
      >
        <Icon name="add" class="size-4" />
      </button>
    </div>
  </div>
</div>

<style>
  /* Koyu zemin: uzun izlemede göz yormaz; çok hafif nokta deseni. */
  .metro {
    background-color: #141922;
    background-image: radial-gradient(#212836 1px, transparent 1px);
    background-size: 20px 20px;
  }
  /* Hat etiketi: üstte "Vaka n", altında en çok iki satır ad (okunabilsin); renk yalnız noktada. Altındaki eski duraklar
     hafif bir perdeyle geri çekilir. */
  .tags {
    background: linear-gradient(90deg, rgba(20, 25, 34, 0.9), rgba(20, 25, 34, 0.55) 60%, transparent);
  }
  .tag {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 228px;
    padding: 6px 10px 7px 9px;
    text-align: left;
    border-radius: 7px;
    transform: translateY(-50%);
    background: rgba(22, 27, 36, 0.92);
    box-shadow: inset 0 0 0 1px #262d3a;
    color: #e6eaf1;
    font-size: 12px;
  }
  .tag:hover {
    box-shadow: inset 0 0 0 1px #3a4456;
  }
  .tag.on {
    box-shadow: inset 0 0 0 1.5px var(--c);
  }
  .tag .dot {
    width: 7px;
    height: 7px;
    margin-top: 4px;
    flex: none;
    border-radius: 50%;
    background: var(--c);
    opacity: 0.55;
  }
  .tag .dot.live {
    opacity: 1;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 25%, transparent);
  }
  .tag .text {
    display: grid;
    min-width: 0;
    gap: 1px;
  }
  .tag .no {
    font-size: 10.5px;
    line-height: 14px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #9aa4b4;
  }
  .tag .name {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font-weight: 500;
    line-height: 16px;
    overflow-wrap: anywhere;
  }
  .glide-top {
    transition: top 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  /* Soluklaşma yumuşak değişir (akıştan çıkınca duraklar yavaşça parlar). */
  .faded {
    transition: opacity 0.6s ease;
  }
  path {
    transition: opacity 0.6s ease;
  }
  /* Bulgunun anı: elmasın etrafında dalga dalga yayılan halkalar, ona giden kesik çizgi akar. */
  .ripple {
    box-shadow: 0 0 0 2px #ff6b6b;
    animation: ripple 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }
  .ripple.late {
    animation-delay: 0.8s;
  }
  @keyframes ripple {
    from {
      opacity: 0.9;
      scale: 1;
    }
    to {
      opacity: 0;
      scale: 2.6;
    }
  }
  .alarm-line {
    animation: alarm-line 0.8s linear infinite;
  }
  @keyframes alarm-line {
    to {
      stroke-dashoffset: -16;
    }
  }
  /* Kuyruklu yıldız: hattın ucunda parlak baş ve solan kuyruk; hatla aynı sürede ve eğride ilerler, varınca söner. */
  .comet {
    width: 0;
    height: 0;
    will-change: transform, opacity;
  }
  .comet .head {
    position: absolute;
    left: -5px;
    top: -5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow:
      0 0 8px 2px var(--c),
      0 0 20px 6px color-mix(in srgb, var(--c) 45%, transparent);
  }
  .comet .tail {
    position: absolute;
    left: -54px;
    top: -2px;
    width: 54px;
    height: 4px;
    border-radius: 4px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--c) 85%, #ffffff));
  }
  /* Kamera geçişi: yalnız transform (GPU). Sürüklerken kapalı. */
  .glide {
    transition: transform 0.9s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .world {
    will-change: transform;
  }
  /* Durak: koyu rozet, ince hat rengi halka; simge açık ton. */
  /* Soluklaşma: yuvarlağın zemini hep opaktır (arkadaki hat içinden görünmez); yalnız yazılar, simge ve halka solar. */
  .faded {
    --fade: 1;
  }
  .txt {
    opacity: var(--fade);
    transition: opacity 0.6s ease;
  }
  .orb > :global(*) {
    opacity: var(--fade);
    transition: opacity 0.6s ease;
  }
  .orb {
    background: #161b24;
    color: #dfe5ee;
    box-shadow:
      inset 0 0 0 1.5px color-mix(in srgb, var(--c) calc(var(--fade) * 100%), #2a3140),
      0 2px 8px -2px rgba(0, 0, 0, 0.5);
  }
  .orb.active {
    background: color-mix(in srgb, var(--c) 18%, #161b24);
    color: #ffffff;
    box-shadow:
      inset 0 0 0 2px var(--c),
      0 0 22px -2px color-mix(in srgb, var(--c) 70%, transparent);
  }
  /* Etkin durakta atan canlı ışıma (yalnız transform/opacity). */
  .pulse {
    box-shadow: 0 0 0 2px var(--c);
    animation: pulse 1.8s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  }
  @keyframes pulse {
    from {
      opacity: 0.75;
      scale: 1;
    }
    to {
      opacity: 0;
      scale: 1.75;
    }
  }
  /* Çalışan durak: dönen ince yay. */
  .arc {
    border: 1.5px solid transparent;
    border-top-color: var(--c);
    animation: spin 1.2s linear infinite;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
  /* Yeni durak olduğu yerde, geri yaylanmadan büyüyerek doğar; hat ona varırken (yaylanan eğri durağı fırlatıyordu). */
  :global(.station.grow) {
    transform-origin: 50% 24px;
    animation: grow 0.45s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both;
  }
  @keyframes grow {
    from {
      opacity: 0;
      scale: 0.6;
    }
  }
  /* Yeni hat, kameranın kayışıyla aynı anda, aynı sürede ve aynı eğriyle çizilir: kamera çizginin ucunu izler. */
  :global(path.reach) {
    stroke-dasharray: 1;
    animation: reach 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes reach {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  /* Grup durağında yeni okunan satır üstten kayarak gelir. */
  .row:first-child {
    animation: row 0.35s ease-out both;
  }
  @keyframes row {
    from {
      opacity: 0;
      translate: 0 -5px;
    }
  }
  /* Etkin hatta akış: ince beyaz kesik çizgi hedefe doğru akar. */
  .flow {
    stroke-dasharray: 2 12;
    opacity: 0.85;
    animation: flow 0.9s linear infinite;
  }
  @keyframes flow {
    to {
      stroke-dashoffset: -14;
    }
  }
  .lite .arc {
    animation-duration: 2.4s;
  }
  @media (prefers-reduced-motion: reduce) {
    .glide,
    .glide-top,
    .arc,
    .pulse,
    .row:first-child,
    :global(.station.grow),
    :global(path.reach) {
      transition: none;
      animation: none;
    }
  }
</style>
