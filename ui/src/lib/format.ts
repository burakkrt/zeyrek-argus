import type { FindingKind, IssueStatus, OccurrenceOutcome, RunStatus, Severity, Usage } from '@argus/shared'

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

/** Saniye → "45 sn" / "3 dk 19 sn"; bilinmiyorsa "—". */
export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  const s = Math.max(0, Math.round(seconds))
  return s < 60 ? `${s} sn` : `${Math.floor(s / 60)} dk ${s % 60} sn`
}

export function formatDuration(from: string | null, to: string | null): string {
  if (!from) return '—'
  return formatSeconds(((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 1000)
}

/** Dolar tutarı, Türkçe ondalık virgülle ("$1,48"); bilinmiyorsa "—". */
export const formatMoney = (usd: number | null | undefined) =>
  usd === null || usd === undefined ? '—' : `$${usd.toFixed(2).replace('.', ',')}`

/** Bayt, okunur birimle ve Türkçe ondalıkla: 950 B, 1,2 MB, 12 GB (10 ve üstü tam sayı). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[unit]}`
}

/**
 * Koşunun maliyeti. API anahtarında dolar. Claude hesabıyla (abonelik) dolar ödenmez: koşunun haftalık limitten
 * tükettiği yüzde gösterilir ("Haftalık limitten %3"); veri yoksa (eski koşu) "Abonelik". Toplam doluluk açıklamadadır.
 */
export const formatCost = (usage: Usage | null | undefined) => {
  if (usage?.provider !== 'abonelik') return formatMoney(usage?.costUsd)
  const week = usage.plan?.week
  const start = usage.plan?.weekAtStart
  if (!week || start === null || start === undefined) return 'Abonelik'
  return `Haftalık limitten %${Math.max(0, Math.round(week.percent - start))}`
}

const whenOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** Maliyetin açıklaması (üzerine gelince). */
export const costHint = (usage: Usage | null | undefined) => {
  if (usage?.provider !== 'abonelik') return 'API anahtarıyla koşunun maliyeti (liste fiyatı).'
  const plan = usage.plan
  if (!plan?.week) return 'Claude aboneliğiyle koşuldu; limit verisi henüz gelmedi.'
  return [
    "Claude aboneliğinin kullanım limitleri (Claude'un kendi verisi, profildeki değerle aynı).",
    `Haftalık: %${Math.round(plan.week.percent)}, sıfırlanma ${whenOf(plan.week.resetsAt)}.`,
    plan.fiveHour ? `5 saatlik: %${Math.round(plan.fiveHour.percent)}, sıfırlanma ${whenOf(plan.fiveHour.resetsAt)}.` : '',
    'Koşunun tükettiği, koşu başından beri haftalık artıştır; aynı hesabın o sıradaki bütün kullanımını içerir.',
  ]
    .filter(Boolean)
    .join('\n')
}

export const RUN_STATUS: Record<RunStatus, { label: string; tone: string }> = {
  sirada: { label: 'Sırada', tone: 'info' },
  calisiyor: { label: 'Çalışıyor', tone: 'accent' },
  bitti: { label: 'Bitti', tone: 'ok' },
  hata: { label: 'Hata', tone: 'fail' },
  durduruldu: { label: 'Durduruldu', tone: 'warn' },
}

export const KIND: Record<FindingKind, { label: string; tone: string }> = {
  kesin: { label: 'Kesin', tone: 'fail' },
  tutarsizlik: { label: 'Tutarsızlık', tone: 'warn' },
  not: { label: 'Not', tone: 'info' },
}

/** Bulgunun önemi (teknik etki): liste önce S1'i gösterir. */
export const SEVERITY: Record<Severity, { label: string; tone: string; hint: string }> = {
  S1: {
    label: 'Kritik',
    tone: 'fail',
    hint: 'Veri kaybı, yetki sızıntısı, yanlış hesap ya da kilitlenen akış.',
  },
  S2: { label: 'Yüksek', tone: 'warn', hint: 'Kural ya da zorunlu alan atlatılıyor, geçersiz durum geçişi.' },
  S3: { label: 'Orta', tone: 'info', hint: 'Kötü hata yönetimi ya da yanıltıcı ileti; geçici çözüm var.' },
  S4: { label: 'Düşük', tone: '', hint: 'Görünüm, metin ya da biçim.' },
}

export const STATUS: Record<IssueStatus, { label: string; tone: string }> = {
  acik: { label: 'Açık', tone: 'accent' },
  duzeltilecek: { label: 'Düzeltilecek', tone: 'fail' },
  'kabul-edildi': { label: 'Bilerek böyle', tone: '' },
  'bulgu-degil': { label: 'Bulgu değil', tone: '' },
  duzeldi: { label: 'Düzeldi', tone: 'ok' },
}

export const OUTCOME: Record<OccurrenceOutcome, { label: string; tone: string }> = {
  yeni: { label: 'Yeni', tone: 'fail' },
  tekrar: { label: 'Biliniyordu', tone: 'warn' },
  bastirildi: { label: 'Bastırıldı', tone: '' },
  dogrulanamadi: { label: 'Doğrulanamadı', tone: 'info' },
  'yeniden-acildi': { label: 'Yeniden açıldı', tone: 'fail' },
}

export const SCOPE_LABEL = (scope: string) =>
  scope === 'platform'
    ? 'Platform'
    : scope === 'uygulama'
      ? 'Uygulama'
      : scope.startsWith('modul:')
        ? `Modül ${scope.slice(6)}`
        : `Sayfa ${scope.slice(6)}`

export const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  sorun: { label: 'Sorun ara', tone: 'fail' },
  'sorun-degil': { label: 'Sorun sayma', tone: 'ok' },
  bilgi: { label: 'Bilgi', tone: 'info' },
}
