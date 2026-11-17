import type { PlatformCall, RunStrategy, StrategyItem } from '@argus/shared'

/**
 * Kayıtlı vakalar ve yayın kapısı. Çalıştırılarak kanıtlanmış her bulgu, kanıtlayan platform çağrılarıyla saklanır
 * (kayıtlı vaka). Yeniden doğrulama keşif yapmaz: vakayı kayıtlı adımlarla tekrar kurar, bulgu hâlâ varsa aynı sorunun
 * yeni görünümü olur, yoksa sorun "düzeldi" olur. Kimlikler koşudan koşuya değiştiği için adımlar modelsiz oynatılmaz,
 * araştırmacıya yol olarak verilir (kendi kendini onaran tekrar); keşfe göre birkaç kat kısa sürer.
 */

/** Yeniden doğrulamada araştırmacının özetinin başı: bulgu artık yok. */
export const FIXED_MARK = 'DÜZELDİ'
/** Kayıtlı vakada saklanan en çok adım ve adım girdisinin en çok uzunluğu. */
export const CASE_LIMITS = { steps: 25, input: 800 }
/** Yayın kapısının isteğine giren ortam farkının en çok uzunluğu. */
const GATE_DIFF_LIMIT = 12_000

export interface RecordedCase {
  key: string
  title: string
  scenario: string
  expected: string
  observed: string
  steps: PlatformCall[]
}

/** Vakanın kanıt adımları: yazmalar ve sonuçlarını okuyan çağrılar, sırasıyla, kısaltılmış. */
export function caseSteps(calls: PlatformCall[]): PlatformCall[] {
  return calls.slice(-CASE_LIMITS.steps).map((c) => ({ ...c, input: c.input.slice(0, CASE_LIMITS.input) }))
}

export function replayItems(cases: RecordedCase[]): StrategyItem[] {
  return cases.map((c) => ({
    title: `Yeniden doğrula: ${c.title}`,
    goal: [
      `Kayıtlı vaka (${c.key}). Senaryo: ${c.scenario}`,
      `Beklenen: ${c.expected}`,
      `Önceki gözlem: ${c.observed}`,
      `Kanıtlayan adımlar (kimlikler eskidir; aynı vakayı yeniden kur, gerekirse yeni kimliklerle):`,
      ...c.steps.map((s, i) => `${i + 1}. ${s.write ? 'platform_yaz' : 'platform_oku'} ${s.tool} ${s.input}`),
      `Önce vakanın ön koşullarını birebir kur: aynı roller ve ilişkiler (ör. aynı kayıtta iki katılımcı), aynı durum, ` +
        `aynı uç. Hâlâ varsa tanim_bulgusu ile anahtar="${c.key}" kaydet (dogrulama=calistirildi). Yalnız koşullar ` +
        `birebir kurulup aynı adımlar çalıştırıldığında sonuç değiştiyse bulgu yazma, kalemi_bitir özetine ` +
        `"${FIXED_MARK}:" ile başla ve neyin değiştiğini yaz. Koşullardan biri farklıysa ya da vakayı kuramadıysan ` +
        `ikisini de yapma, "eksik"e yaz.`,
    ].join('\n'),
    source: 'tanim',
    page: null,
    fullScan: false,
    independent: true,
    caseKey: c.key,
  }))
}

/** Yeniden doğrulama koşusu: her kayıtlı vaka bir bağımsız tanım kalemi; planlama yok. */
export function replayStrategy(cases: RecordedCase[]): RunStrategy {
  return {
    kind: 'kural',
    scope: 'soru',
    understood: `Kayıtlı vakaların yeniden doğrulanması (${cases.length} vaka).`,
    scenarios: [],
    doneWhen: 'Her vaka yeniden kurulur: bulgu hâlâ varsa yeni görünüm, yoksa düzeldi.',
    known: [],
    infeasible: [],
    items: replayItems(cases),
    guides: ['genel'],
  }
}

/**
 * Yeniden doğrulamada görülmeyen sorun kendiliğinden kapanır mı: S1/S2 kapanmaz, insan onayı bekler. Bir şeyi görmemeyi
 * öğrenmek tehlikelidir; tekrar koşusu vakayı birebir kuramayıp kritik bir yetki sızıntısını "düzeldi" sayabiliyordu
 * (KOS-2026-0045: aynı ankette iki katılımcı koşulu iki ayrı anketle denendi).
 */
export const closesItself = (severity: string): boolean => severity !== 'S1' && severity !== 'S2'

/** Yayın kapısının isteği: ortam farkı + değişenlere odak + kullanıcının ek isteği. */
export function gateBrief(environment: string, diff: string, extra: string | null): string {
  return [
    `Yayın kapısı: ${environment} → production. Aşağıdaki fark yayına çıkacak tanımlardır. Yalnız değişen ` +
      'tanımların etkilediği akışları ve kuralları test et (değişen sayfa, akış, servis, tablo ve onları kullananlar); ' +
      'değişmeyen alanı tarama. Yayını engelleyecek (S1/S2) sorunları önce ara.',
    extra ? `Kullanıcının ek isteği: ${extra}` : '',
    `Ortam farkı:\n${diff.slice(0, GATE_DIFF_LIMIT)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Kapının kararı: koşuda kanıtlı S1/S2 bulgu varsa kapalı. */
export function gateVerdict(findings: Array<{ severity: string; kind: string; title: string }>): {
  open: boolean
  message: string
} {
  const blocking = findings.filter((f) => f.kind !== 'not' && (f.severity === 'S1' || f.severity === 'S2'))
  return blocking.length
    ? {
        open: false,
        message: `Yayın kapısı KAPALI: ${blocking.length} kritik/yüksek bulgu (${blocking.map((f) => f.title).join('; ')}).`,
      }
    : {
        open: true,
        message: 'Yayın kapısı AÇIK: değişen alanda kritik ya da yüksek önemde kanıtlı bulgu yok.',
      }
}
