/**
 * Bildirimlerin saf mantığı (`notify.svelte.ts` deposu ve `layout/Notifications.svelte` kullanır): ton başına süre,
 * kuyruğa ekleme (aynı bildirim tekrar gelirse yeni kart açılmaz; sayacı artar, süresi baştan başlar, en üste çıkar)
 * ve üst sınır (en eskisi düşer). Tasarım: platformun "outlined" toast'ı — beyaz kart, tonda ikon, altta geri sayım
 * çizgisi; üzerine gelince sayaç durur.
 */

export type NoticeTone = 'success' | 'info' | 'warning' | 'error'

export interface NoticeInput {
  tone: NoticeTone
  title: string
  message?: string
  /** Kendiliğinden kapanma süresi (ms); 0 kapanmaz. Verilmezse tonun süresi. */
  duration?: number
}

export interface Notice extends Required<Omit<NoticeInput, 'message'>> {
  id: string
  message: string
  /** Aynı bildirim kaç kez geldi (2+ ise kartta "×n"). */
  count: number
  /** Her tekrar yeni anahtar alır: kart yeniden çizilir, sayaç baştan başlar. */
  key: string
}

/** Okuma süresi: hata ve uyarı daha uzun kalır. */
export const NOTICE_DURATION: Record<NoticeTone, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
}

export const MAX_NOTICES = 3

/** Bildirimi kuyruğa ekler (en yeni en üstte). `id` yeni bildirim içindir; tekrar gelen eskisinin kimliğini korur. */
export function pushNotice(list: Notice[], input: NoticeInput, id: string): Notice[] {
  const message = input.message ?? ''
  const duration = input.duration ?? NOTICE_DURATION[input.tone]
  const same = list.find((n) => n.tone === input.tone && n.title === input.title && n.message === message)
  const next: Notice = same
    ? { ...same, duration, count: same.count + 1, key: `${same.id}:${same.count + 1}` }
    : { id, tone: input.tone, title: input.title, message, duration, count: 1, key: `${id}:1` }
  return [next, ...list.filter((n) => n.id !== next.id)].slice(0, MAX_NOTICES)
}
