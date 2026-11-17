import { SEVERITIES, type Severity } from '@argus/shared'

/**
 * Önem alanının açıklaması (bulgu bildiren şemalar). Tablonun kendisi (S1–S4 neyi kapsar) koddan değil, bütün rollerin
 * ortak talimatından gelir: `memory/brain/roles/temel.md` → Önem.
 */
export const SEVERITY_GUIDE = 'Önem: S1 en ağır, S4 en hafif; ölçüt talimattaki Önem tablosundadır.'

/** Modelin verdiği önem (S1-S4); tanınmayan ya da boş değer orta önemdir (S3). */
export const severityOf = (value: unknown): Severity =>
  SEVERITIES.includes(value as Severity) ? (value as Severity) : 'S3'
