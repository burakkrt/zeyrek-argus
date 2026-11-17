import type { AppRef, Issue } from '@argus/shared'
import type { Tooltip } from '../browser/research.ts'
import type { RuleSelection } from '../memory/select.ts'

export function appBlock(input: { app: AppRef; rules: RuleSelection; notes: string }): string {
  const parts = [`# Uygulama: ${input.app.project}/${input.app.application}`]
  if (input.notes.trim()) parts.push(`## Uygulama notları\n${input.notes.trim()}`)
  parts.push(`## Kurallar\n${input.rules.text || '(henüz yok)'}`)
  if (input.rules.patterns.length) {
    parts.push(
      `## Deseni olan kurallar (gözler bakıyor, sen bakma)\n${input.rules.patterns.map((p) => `- [${p.id}] ${p.text}`).join('\n')}`,
    )
  }
  return parts.join('\n\n')
}

export interface PageFacts {
  page: string
  url: string
  tooltips: Tooltip[]
  problems: string[]
  openIssues: Issue[]
  known: Array<{ key: string; title: string; status: string }>
  rejected: Array<{ key: string; title: string }>
  /** Sayfa bilgisi (koşulardan damıtılmış, `pages/<sayfa>/<kimlik>.md`, en yenisi); yoksa null. */
  knowledge?: string | null
  /** Koşunun bilgisi: stratejide tanımdan bilinenler ve tanım kalemlerinin kaynaklı sonuçları. */
  notes?: string[]
}

const list = (items: string[], empty = '(yok)') =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : empty

/**
 * Sayfanın sabit bağlamı: sayfa açılınca bir kez kurulur ve sayfa boyunca değişmez; bu yüzden her çağrının
 * mesajında değil, sayfanın önbellekli talimatında durur (`PageController` iki talimat kurar: gezgin ve yargıç).
 * Gezgin ve planlayıcı modüldeki bilinen ve reddedilen sorun listesini görmez (eşleştirmeyi ve reddi yargıç yapar).
 * Sayfa içinde değişen tek parça, belirlenimci gözlerin bulduklarıdır (`eyeFindingsText`, çağrıya girer).
 */
export function pageFacts(facts: PageFacts, audience: 'gezgin' | 'yargic' = 'gezgin'): string {
  const parts = [
    `Sayfa: ${facts.page}\nAdres: ${facts.url}`,
    `"?" ipuçları (tanımlar):\n${list(facts.tooltips.map((t) => `${t.label}: ${t.text}`))}`,
    `Açılışta görülen konsol/ağ sorunları:\n${list(facts.problems.slice(0, 10))}`,
    audience === 'yargic'
      ? `Bu sayfada açık sorunlar:\n${list(facts.openIssues.map((i) => `${i.key} — ${i.title}`))}`
      : `Bu sayfada daha önce bulunan, etkileşimle yeniden bakılması gereken açık sorunlar (hâlâ var mı bak, sorun_durumu ile bildir):\n${list(facts.openIssues.map((i) => `${i.key} — ${i.title}`))}`,
  ]
  if (facts.notes?.length)
    parts.push(`Bu koşuda platform tanımlarından öğrenilenler (kaynaklı; ekranda teyit et):
${list(facts.notes)}`)
  if (facts.knowledge)
    parts.push(
      `Sayfa bilgisi (önceki koşulardan damıtılmış; yol gösterir ama ekranda doğrula, körü körüne güvenme):\n${facts.knowledge}`,
    )
  if (audience === 'yargic')
    parts.push(
      `Bu modülde bilinen sorunlar (aynı kök nedense bu anahtarı ver):\n${list(facts.known.map((k) => `${k.key} — ${k.title} (${k.status})`))}`,
      `İnsanın "bulgu değil" dediği sorunlar (aynısıysa reddet):\n${list(facts.rejected.map((r) => `${r.key} — ${r.title}`))}`,
    )
  return parts.join('\n\n')
}

/** Belirlenimci gözlerin bu sayfada bulduğu (sayfa içinde artar; çağrının mesajına girer). */
export const eyeFindingsText = (found: Array<{ key: string; title: string }>) =>
  `Gözlerin zaten bulduğu (yeniden bildirme):\n${list(found.map((e) => `${e.key} — ${e.title}`))}`
