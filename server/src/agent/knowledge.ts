/**
 * Sayfa bilgisi. Ajanın bir sayfa için koşudan koşuya damıttığı bilgi: amaç, ekranlar,
 * beklentiler (güven derecesiyle), kapsanan / kapsanmayan alanlar ve bilinen tuhaflıklar. Sabit bütçelidir: her
 * liste üst sınırla kesilir, madde uzunluğu sınırlıdır; böylece isteme giren bağlam koşu sayısıyla büyümez. Dosya her
 * koşu sonunda baştan yazılır (birikmez, damıtılır).
 */

export type Confidence = 'yuksek' | 'orta' | 'dusuk'

export interface PageKnowledge {
  amac: string
  ekranlar: string[]
  beklentiler: Array<{ metin: string; guven: Confidence }>
  kapsanan: string[]
  kapsanmayan: string[]
  tuhafliklar: string[]
}

/** Liste başına üst sınır ve madde uzunluğu: toplam ~1.500 token'ı geçmez. */
export const KNOWLEDGE_LIMITS = {
  ekranlar: 10,
  beklentiler: 15,
  kapsanan: 12,
  kapsanmayan: 8,
  tuhafliklar: 8,
  madde: 220,
  amac: 400,
} as const

const strings = { type: 'array', items: { type: 'string' } } as const

export const KNOWLEDGE_SCHEMA = {
  type: 'object',
  properties: {
    amac: { type: 'string', description: 'Sayfanın ne işe yaradığı, 1-2 cümle.' },
    ekranlar: {
      ...strings,
      description: 'Sayfanın ekran durumları ve nasıl açıldıkları (sekme, pencere, form).',
    },
    beklentiler: {
      type: 'array',
      description: 'Bu sayfada doğru davranışın ne olduğu; iş kuralları, tutarlılık ilişkileri.',
      items: {
        type: 'object',
        properties: {
          metin: { type: 'string' },
          guven: { type: 'string', enum: ['yuksek', 'orta', 'dusuk'] },
        },
        required: ['metin', 'guven'],
        additionalProperties: false,
      },
    },
    kapsanan: { ...strings, description: 'Denenmiş ve davranışı bilinen alanlar.' },
    kapsanmayan: {
      ...strings,
      description: 'Henüz denenmemiş ya da yarım kalmış alanlar (sonraki koşu buraya gitsin).',
    },
    tuhafliklar: {
      ...strings,
      description: 'Bulgu sayılmayan ama bilinmesi gereken davranışlar ve nedenleri.',
    },
  },
  required: ['amac', 'ekranlar', 'beklentiler', 'kapsanan', 'kapsanmayan', 'tuhafliklar'],
  additionalProperties: false,
} as const

const clip = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''

const list = (value: unknown, limit: number): string[] =>
  (Array.isArray(value) ? value : [])
    .map((item) => clip(item, KNOWLEDGE_LIMITS.madde))
    .filter(Boolean)
    .slice(0, limit)

const CONFIDENCE = new Set<Confidence>(['yuksek', 'orta', 'dusuk'])

/** Modelin cevabını sınırlara oturtur: fazla madde ve uzun metin kesilir, bilinmeyen güven "dusuk" olur. */
export function clampKnowledge(raw: unknown): PageKnowledge {
  const value = (raw ?? {}) as Record<string, unknown>
  return {
    amac: clip(value.amac, KNOWLEDGE_LIMITS.amac),
    ekranlar: list(value.ekranlar, KNOWLEDGE_LIMITS.ekranlar),
    beklentiler: (Array.isArray(value.beklentiler) ? value.beklentiler : [])
      .map((item) => {
        const entry = (item ?? {}) as Record<string, unknown>
        const guven = CONFIDENCE.has(entry.guven as Confidence) ? (entry.guven as Confidence) : 'dusuk'
        return { metin: clip(entry.metin, KNOWLEDGE_LIMITS.madde), guven }
      })
      .filter((item) => item.metin)
      .slice(0, KNOWLEDGE_LIMITS.beklentiler),
    kapsanan: list(value.kapsanan, KNOWLEDGE_LIMITS.kapsanan),
    kapsanmayan: list(value.kapsanmayan, KNOWLEDGE_LIMITS.kapsanmayan),
    tuhafliklar: list(value.tuhafliklar, KNOWLEDGE_LIMITS.tuhafliklar),
  }
}

const GUVEN_LABEL: Record<Confidence, string> = { yuksek: 'yüksek', orta: 'orta', dusuk: 'düşük' }

/**
 * Hafıza dosyası: ön bilgi (sayfa, yazar, güncelleme anı, koşu, bilginin yazıldığı andaki sayfa izi) + bölümler.
 * İsteme gövde girer; iz, sonraki koşunun "ne değişti?" sorusunun takım genelindeki dayanağıdır.
 */
export function renderKnowledge(
  k: PageKnowledge,
  meta: {
    page: string
    author: string
    run: string
    at: string
    print: { ui: string; api: string; studio: string | null }
  },
): string {
  const section = (title: string, items: string[]) =>
    `## ${title}\n${items.length ? items.map((i) => `- ${i}`).join('\n') : '- (yok)'}`
  return (
    [
      `---\nsayfa: ${meta.page}\nyazar: ${meta.author}\nguncelleme: ${meta.at}\nkosu: ${meta.run}\n` +
        `iz_arayuz: ${meta.print.ui}\niz_veri: ${meta.print.api}\niz_studio: ${meta.print.studio ?? ''}\n---`,
      `## Amaç\n${k.amac || '(bilinmiyor)'}`,
      section('Ekranlar', k.ekranlar),
      section(
        'Beklentiler',
        k.beklentiler.map((b) => `${b.metin} (güven: ${GUVEN_LABEL[b.guven]})`),
      ),
      section('Kapsanan', k.kapsanan),
      section('Kapsanmayan', k.kapsanmayan),
      section('Tuhaflıklar', k.tuhafliklar),
    ].join('\n\n') + '\n'
  )
}
