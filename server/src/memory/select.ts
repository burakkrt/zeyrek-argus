import { moduleOf, type AppRef, type Rule } from '@argus/shared'
import type { PatternRule } from '../browser/eyes.ts'

/** Kaba token tahmini (Türkçe metinde ~3,5 karakter/token). Bütçe göstergesi ve kesme için yeterli. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5)

const SPECIFICITY: Record<string, number> = { sayfa: 4, modul: 3, uygulama: 2, platform: 1 }

const specificity = (rule: Rule) => SPECIFICITY[rule.scope.split(':')[0]!] ?? 0

/** Kural bu sayfada geçerli mi: platform her yerde; uygulama kuralı o uygulamada; modül/sayfa kuralı eşleşince. */
export function ruleApplies(rule: Rule, app: AppRef, page: string | null): boolean {
  if (rule.state !== 'onayli') return false
  if (rule.scope === 'platform') return true
  if (!rule.app || rule.app.project !== app.project || rule.app.application !== app.application) return false
  if (rule.scope === 'uygulama') return true
  if (!page) return false
  if (rule.scope.startsWith('modul:')) return rule.scope.slice(6) === moduleOf(page)
  return rule.scope.slice(6) === page
}

export interface RuleSelection {
  /** İsteme girecek metin (madde listesi). */
  text: string
  used: Rule[]
  dropped: Rule[]
  tokens: number
  /** Deseni olan kurallar: isteme girmez, belirlenimci göz olarak koşar (token harcamaz). */
  patterns: PatternRule[]
}

const line = (rule: Rule) => `- [${rule.id}] (${rule.type === 'sorun-degil' ? 'SORUN SAYMA' : rule.type === 'bilgi' ? 'bilgi' : 'sorun'}) ${rule.text.replace(/\s+/g, ' ').trim()}`

/**
 * Sayfaya özgü kuralları bütçe içinde seçer: en özgül kapsam önce, sonra en çok işe yarayan, sonra kimliğe göre.
 * Bütçeyi aşanlar düşer; düşen varsa koşu akışında görünür (bakım zamanı geldiğini söyler).
 */
export function selectRules(
  rules: Rule[],
  app: AppRef,
  page: string | null,
  budget: number,
  uses: (id: string) => number = () => 0,
): RuleSelection {
  const eligible = rules.filter((r) => ruleApplies(r, app, page))
  const patterns = eligible.filter((r) => r.pattern).map((r) => ({ id: r.id, pattern: r.pattern!, text: r.text }))
  const ordered = eligible
    .filter((r) => !r.pattern)
    .sort((a, b) => specificity(b) - specificity(a) || uses(b.id) - uses(a.id) || a.id.localeCompare(b.id))
  const used: Rule[] = []
  const dropped: Rule[] = []
  let tokens = 0
  for (const rule of ordered) {
    const cost = estimateTokens(line(rule))
    if (tokens + cost > budget) dropped.push(rule)
    else {
      used.push(rule)
      tokens += cost
    }
  }
  return { text: used.map(line).join('\n'), used, dropped, tokens, patterns }
}
