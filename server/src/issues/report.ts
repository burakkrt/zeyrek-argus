import type { FindingReport } from '@argus/shared'

/**
 * Bulgu bildiren araçların ortak belge alanları (gezgin, göz, araştırmacı, gözetmen). İsteğe bağlıdır; nasıl
 * doldurulacağı `memory/brain/roles/temel.md` → Bulgu raporu'ndadır.
 */
export const REPORT_PROPERTIES = {
  aciklama: { type: 'string', description: 'Ne oldu: modülü bilmeyenin anlayacağı bir iki cümle.' },
  sonuc: { type: 'string', description: 'Sonucu: kimi nasıl etkiler.' },
  nerede: { type: 'string', description: 'Kullanıcının gördüğü yer ve hatanın bulunduğu parça.' },
  kok_neden: { type: 'string', description: 'Biliniyorsa kök neden (hangi tanım, hangi adım); bilinmiyorsa boş.' },
  duzeltme: { type: 'string', description: 'Önerilen düzeltme; bilinmiyorsa boş.' },
  kabul: { type: 'array', items: { type: 'string' }, description: 'Düzeltmenin kabul ölçütleri (2-4 madde).' },
} as const

/**
 * Bulguyu bildiren aracın girdisinden belge alanları (aciklama, sonuc, nerede, kok_neden, duzeltme, kabul) ve kanıtın
 * türü (bildiren yer bilir: çalıştırıldı, ekranda görüldü…). Alanlar isteğe bağlıdır; hiçbiri yoksa rapor da yoktur,
 * çekmece eski bulgular gibi yalnız senaryo, beklenen ve gözleneni gösterir.
 */
export function findingReport(input: unknown, proof: string): FindingReport | null {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const text = (key: string) => (typeof value[key] === 'string' ? (value[key] as string).trim() : '')
  const acceptance = Array.isArray(value.kabul)
    ? value.kabul.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim())
    : []
  const report: FindingReport = {
    summary: text('aciklama'),
    impact: text('sonuc'),
    location: text('nerede'),
    proof: proof.trim(),
    rootCause: text('kok_neden'),
    fix: text('duzeltme'),
    acceptance,
  }
  return Object.values(report).some((v) => (Array.isArray(v) ? v.length : v)) ? report : null
}
