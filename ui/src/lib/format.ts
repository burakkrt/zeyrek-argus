import type { FindingKind, IssueStatus, OccurrenceOutcome, RunStatus, Usage } from '@argus/shared'

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

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

/** Koşunun maliyeti; Claude hesabıyla (abonelik) koşuda dolar yoktur, planın kullanım hakkından düşer. */
export const formatCost = (usage: Usage | null | undefined) =>
  usage?.provider === 'abonelik' ? 'Abonelik' : formatMoney(usage?.costUsd)

export const formatTokens = (usage: Usage) => {
  const input = usage.input + usage.cacheWrite + usage.cacheRead
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n))
  return `${k(input)} girdi (${input ? Math.round((usage.cacheRead / input) * 100) : 0}% önbellek) · ${k(usage.output)} çıktı`
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

export const STATUS: Record<IssueStatus, { label: string; tone: string }> = {
  acik: { label: 'Açık', tone: 'accent' },
  duzeltilecek: { label: 'Düzeltilecek', tone: 'fail' },
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

export const TOOL_LABELS: Record<string, string> = {
  tikla: 'Tıkla',
  uzerine_gel: 'Üzerine gel',
  yaz: 'Yaz',
  tus: 'Tuş',
  kaydir: 'Kaydır',
  ekrana_bak: 'Ekrana bak',
  bastan_ac: 'Baştan aç',
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
