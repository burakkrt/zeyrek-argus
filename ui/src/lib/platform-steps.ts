/**
 * Platform adımlarının sade dili ve akış kartları. Ön planda teknik ad yok: "workflow_get" değil "İş akışını okudu";
 * araç, girdi ve sonuç karta tıklayınca açılan ayrıntıdadır. Art arda gelen aynı tür adımlar (ör. saniyeler içinde beş
 * tanım okuması) tek kartta toplanır: izleyen kişi akışı takip edebilsin, ayrıntı kaybolmasın.
 */

import type { IconName } from './icons'

export type CallKind = 'oku' | 'yaz' | 'calistir'

export interface PlainCall {
  kind: CallKind
  ok: boolean
  /** "İş akışını okudu", "Test kaydı oluşturamadı". */
  title: string
  /** Teknik araç adı (ayrıntıda gösterilir). */
  tool: string
}

/** Okunan şeyin sade adı (belirtme hâli), araç adının önekinden. */
const SUBJECTS: Array<[RegExp, string]> = [
  [/^workflow/, 'iş akışını'],
  [/^flow/, 'sayfa akışını'],
  [/^process/, 'süreci'],
  [/^case/, 'vaka tanımını'],
  [/^microservice|^microfunction|^function/, 'servisi'],
  [/^(entity|dto|view)/, 'veri yapısını'],
  [/^row/, 'kayıtları'],
  [/^page/, 'sayfa tanımını'],
  [/^layout|^component|^theme/, 'arayüz tanımını'],
  [/^query/, 'sorguyu'],
  [/^decision/, 'karar tablosunu'],
  [/^automation/, 'otomasyonu'],
  [/^environment_diff/, 'ortam farkını'],
  [/^revision/, 'değişiklik geçmişini'],
  [/^access|^role/, 'yetki tanımını'],
  [/^variable/, 'değişkenleri'],
  [/^translation/, 'çevirileri'],
]

const capital = (text: string) => text.charAt(0).toLocaleUpperCase('tr') + text.slice(1)

const WRITES: Record<string, { done: string; failed: string; kind: CallKind }> = {
  row_create: { done: 'Test kaydı oluşturdu', failed: 'Test kaydı oluşturamadı', kind: 'yaz' },
  row_update: { done: 'Test kaydını güncelledi', failed: 'Test kaydını güncelleyemedi', kind: 'yaz' },
  row_delete: { done: 'Test kaydını sildi', failed: 'Test kaydını silemedi', kind: 'yaz' },
  process_task_update: { done: 'Görevi ilerletti', failed: 'Görevi ilerletemedi', kind: 'calistir' },
}

/**
 * Sunucunun adım sonucundan ("Platformdan okundu: workflow_get", "Platforma yazılamadı: row_create") sade dil. Okuma
 * araçlarında fiil `_list`/`_get` sonekinden, yazma ve çalıştırmada araçtan gelir.
 */
export function plainCall(step: { tool: string; outcome: string }): PlainCall {
  const tool = /: ([\w-]+)/.exec(step.outcome)?.[1] ?? ''
  const ok = !/okunamadı|yazılamadı/.test(step.outcome)
  if (step.tool === 'platform_yaz') {
    const known = WRITES[tool]
    if (known) return { kind: known.kind, ok, title: ok ? known.done : known.failed, tool }
    const preview = tool.endsWith('_preview')
    const subject = SUBJECTS.find(([re]) => re.test(tool))?.[1] ?? 'işlemi'
    return {
      kind: 'calistir',
      ok,
      title: capital(
        preview
          ? `${subject} önizlemeyle ${ok ? 'çalıştırdı' : 'çalıştıramadı'}`
          : `${subject} ${ok ? 'çalıştırdı' : 'çalıştıramadı'}`,
      ),
      tool,
    }
  }
  const subject = SUBJECTS.find(([re]) => re.test(tool))?.[1] ?? 'tanımı'
  const listed = /_list$|_histories$|_export$/.test(tool)
  const verb = ok ? (listed ? 'listeledi' : 'okudu') : listed ? 'listeleyemedi' : 'okuyamadı'
  return { kind: 'oku', ok, title: capital(`${subject} ${verb}`), tool }
}

export interface FlowCard<T> {
  /** Kartın kimliği: ilk adımının sırası (kart büyürken değişmez, animasyon yeniden başlamaz). */
  key: number
  call: PlainCall
  steps: T[]
}

/** Art arda gelen adımlar bu süreden kısa aralıkla ve aynı tür, aynı sonuçla geldiyse tek karttır. */
export const BURST_MS = 8_000

/**
 * Adımları kartlara toplar: aynı tür (okuma, yazma, çalıştırma), aynı sonuç (başarılı / başarısız) ve BURST_MS'den
 * kısa aralık. Başarısız adım başarılılarla birleşmez (hata gözden kaçmasın); okuma kartı başlığı genelleşir
 * ("Tanımları okudu") çünkü içinde farklı şeyler okunmuş olabilir.
 */
export function flowCards<T extends { seq: number; at: number; tool: string; outcome: string }>(
  steps: T[],
): FlowCard<T>[] {
  const cards: FlowCard<T>[] = []
  for (const step of steps) {
    const call = plainCall(step)
    const last = cards.at(-1)
    const prev = last?.steps.at(-1)
    if (
      last &&
      prev &&
      last.call.kind === call.kind &&
      last.call.ok === call.ok &&
      step.at - prev.at < BURST_MS
    ) {
      last.steps.push(step)
      if (last.call.title !== call.title) last.call = { ...last.call, title: groupTitle(call), tool: '' }
      continue
    }
    cards.push({ key: step.seq, call, steps: [step] })
  }
  return cards
}

function groupTitle(call: PlainCall): string {
  if (call.kind === 'oku') return call.ok ? 'Tanımları okudu' : 'Tanımları okuyamadı'
  if (call.kind === 'yaz') return call.ok ? 'Test verisi yazdı' : 'Test verisi yazamadı'
  return call.ok ? 'İşlemleri çalıştırdı' : 'İşlemleri çalıştıramadı'
}

/** Modelin yazdığı sade işten simge: işin anlamı aracın adından iyi bilgidir ("Anketi gönderme" bir servis çağrısıdır). */
const LABEL_ICONS: Array<[RegExp, IconName]> = [
  [/gönder/, 'opSend'],
  [/temizl|silme|sil\b/, 'opDelete'],
  [/oluştur|kurma|ekleme/, 'opCreate'],
  [/güncelle|değiştir|ilerlet|tamamla|cevapla/, 'opEdit'],
  [/yetki|izin|erişim/, 'opLock'],
  [/kural|koşul|doğrula/, 'opRule'],
]

const TOOL_ICONS: Array<[RegExp, IconName]> = [
  [/^row_create$/, 'opCreate'],
  [/^row_update$|^process_task_update$/, 'opEdit'],
  [/^row_delete$/, 'opDelete'],
  [/^process_(execute|trigger|scenario_execute)$|^case_execute$/, 'opSend'],
  [/^microservice|^microfunction|_preview$/, 'opService'],
  [/^environment_diff|^revision/, 'opDiff'],
  [/^(access|role)/, 'opLock'],
  [/^decision/, 'opRule'],
  [/^(workflow|flow|process|case)/, 'opFlow'],
  [/^(entity|dto|view|row)/, 'opTable'],
  [/^(page|layout|component|theme)/, 'opPage'],
  [/_list$/, 'opList'],
]

/** Durağın simgesi: önce modelin yazdığı işin anlamı, sonra araç; ikisi de bilinmiyorsa tanım. */
export function operationIcon(step: {
  tool: string
  outcome: string
  platform?: { label?: string } | null
}): IconName {
  const label = (step.platform?.label ?? '').toLocaleLowerCase('tr')
  const byLabel = label ? LABEL_ICONS.find(([re]) => re.test(label))?.[1] : undefined
  if (byLabel) return byLabel
  const tool = plainCall(step).tool
  return TOOL_ICONS.find(([re]) => re.test(tool))?.[1] ?? 'database'
}
