import type { AppRef, Rule, RuleType } from '@argus/shared'

/**
 * Platform köprüsünün içeriği: insan onaylı kurallar, Zeyrek projesinin `ai-notlari/` klasörüne konacak tek dosya
 * olarak. Platformdaki yapay zekâlar o klasörü zorunlu-okuma ile okur; uygulamayı geliştiren yapay zekâ Argus'un
 * öğrendiği hatayı yapmasın. Aktarmanın kendisi (ne zaman, kim onaylar, nasıl yüklenir) henüz kararlaştırılmadı:
 * burada yalnız içerik üretilir, hiçbir yere yazılmaz.
 */
export const PLATFORM_NOTES_FILE = 'argus-dersleri.md'

const SECTIONS: Array<{ type: RuleType; title: string }> = [
  { type: 'sorun', title: 'Kaçınılacak hatalar' },
  { type: 'sorun-degil', title: 'Hata sayılmayan davranışlar' },
  { type: 'bilgi', title: 'Uygulama bilgisi' },
]

const scopeText = (scope: string) =>
  scope === 'platform' || scope === 'uygulama' ? '' : ` (${scope.replace(':', ': ')})`

/** Yalnız onaylı kurallar girer; sıra belirlenimcidir, aynı kurallar aynı dosyayı verir. */
export function platformNotes(app: AppRef, rules: Rule[]): { file: string; content: string; count: number } {
  const approved = rules
    .filter((r) => r.state === 'onayli')
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.id.localeCompare(b.id))
  const sections = SECTIONS.map(({ type, title }) => {
    const items = approved.filter((r) => r.type === type)
    return items.length
      ? [`## ${title}`, ...items.map((r) => `- ${r.text.replace(/\s+/g, ' ').trim()}${scopeText(r.scope)}`)].join('\n')
      : ''
  }).filter(Boolean)
  const content = [
    `# Argus dersleri — ${app.project}/${app.application}`,
    'Bu dosyayı Argus üretir: test sırasında bulunup insanın onayladığı kurallar. Uygulamayı geliştirirken bu hataları ' +
      'yapma; "hata sayılmayan" davranışları düzeltmeye çalışma. Elle düzenleme, Argus hafızasında düzelt.',
    ...(sections.length ? sections : ['Henüz onaylı ders yok.']),
  ].join('\n\n')
  return { file: PLATFORM_NOTES_FILE, content: `${content}\n`, count: approved.length }
}
