import type { Occurrence } from '@argus/shared'
import { scenarioSteps } from './monitor'

/**
 * Bulgu belgesi: çekmecenin (akış, değerlendirme, Bulgular) gösterdiği alanlar, sadeden teknik olana. Raporlu bulguda
 * alanlar modelin raporundan gelir (`FindingReport`); rapordan önce kaydedilen bulguda yer sayfa adıdır ve gözlenenin
 * sonuna eklenmiş kanıt notu ("(Çalıştırılarak doğrulandı; kaynak: …)") ayrılıp Kanıt satırına geçer. Boş alan gösterilmez.
 */
export interface FindingDocument {
  summary: string
  impact: string
  location: string
  steps: string[]
  expected: string
  observed: string
  proof: string
  quote: string | null
  rootCause: string
  fix: string
  acceptance: string[]
}

const LEGACY_PROOF = /\s*\(((?:Çalıştırılarak doğrulandı|Tanımdan çıkarım[^;]*));\s*kaynak:\s*([\s\S]*)\)\s*$/

export function findingDocument(occurrence: Occurrence, place: string): FindingDocument {
  const report = occurrence.report
  const legacy = report ? null : LEGACY_PROOF.exec(occurrence.observed)
  return {
    summary: report?.summary ?? '',
    impact: report?.impact ?? '',
    location: report?.location || place,
    steps: scenarioSteps(occurrence.scenario),
    expected: occurrence.expected,
    observed: legacy ? occurrence.observed.slice(0, legacy.index).trim() : occurrence.observed,
    proof: report?.proof ?? (legacy ? `${legacy[1]}. Kaynak: ${legacy[2]}` : ''),
    quote: occurrence.quote,
    rootCause: report?.rootCause ?? '',
    fix: report?.fix ?? '',
    acceptance: report?.acceptance ?? [],
  }
}
