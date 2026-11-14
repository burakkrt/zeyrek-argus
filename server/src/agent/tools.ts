import { FINDING_KINDS } from '@argus/shared'
import type { Tool } from './model.ts'

const reason = { type: 'string', description: 'Bunu neden yaptığın, tek kısa cümle.' } as const

const tool = (name: string, description: string, properties: Record<string, unknown>): Tool => ({
  name,
  description,
  strict: true,
  input_schema: {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  },
})

/** Görev döngüsünün araçları. Adlar Türkçe: model ve insan aynı dili konuşsun (akışta bu adlar görünür). */
export const TASK_TOOLS: Tool[] = [
  tool(
    'tikla',
    'Sayfa ağacındaki öğeye ref ile tıklar, yeni ekranın ağacını döner. Yazma işi yapan düğmeler engellenir.',
    {
      ref: { type: 'string', description: 'Ağaçtaki ref, ör. e12' },
      neden: reason,
    },
  ),
  tool('uzerine_gel', 'Öğenin üstüne gelir (ipucu, menü); açılan ipucu metnini ve yeni ağacı döner.', {
    ref: { type: 'string' },
    neden: reason,
  }),
  tool('yaz', 'Bir alana metin yazar (önce temizler). Enter tuşuna basmaz.', {
    ref: { type: 'string' },
    metin: { type: 'string' },
    neden: reason,
  }),
  tool('tus', 'Bir tuşa basar: Escape, Enter, Tab, ArrowDown, ArrowUp, PageDown, PageUp.', {
    tus: { type: 'string', enum: ['Escape', 'Enter', 'Tab', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'] },
    neden: reason,
  }),
  tool('kaydir', 'Sayfayı aşağı ya da yukarı kaydırır.', {
    yon: { type: 'string', enum: ['asagi', 'yukari'] },
    neden: reason,
  }),
  tool(
    'ekrana_bak',
    'Ekran görüntüsü alır (goruntu=true): hiza, taşma, renk, kesilme gibi görsel sorunlar için. Ağaç zaten her adımdan sonra gelir; yalnız ağaç için çağırma.',
    {
      goruntu: { type: 'boolean' },
      neden: reason,
    },
  ),
  tool('bastan_ac', 'Sayfayı baştan açar (pencereler, filtreler sıfırlanır).', { neden: reason }),
  tool('bulgu_bildir', 'Ekranda şu an görünen bir sorunu bildirir; ekran görüntüsü kanıt olarak alınır.', {
    tur: { type: 'string', enum: [...FINDING_KINDS] },
    anahtar: { type: 'string', description: 'Kök neden kimliği, küçük harf ve tire.' },
    baslik: { type: 'string', description: 'Kısa başlık.' },
    senaryo: { type: 'string', description: 'Tekrar etmek için adımlar.' },
    beklenen: { type: 'string' },
    gozlenen: { type: 'string', description: 'Tutarsızlıkta neyle çeliştiği de yazılır.' },
    alinti: { type: 'string', description: 'Ekranda birebir görünen kısa metin; yoksa boş.' },
    ref: { type: 'string', description: 'Sorunlu öğenin ref’i; yoksa boş.' },
    kurallar: { type: 'array', items: { type: 'string' }, description: 'Dayanılan kural kimlikleri.' },
    bastiran_kural: {
      type: 'string',
      description: 'SORUN SAYMA kuralı gereğiyse kuralın kimliği; değilse boş.',
    },
  }),
  tool('bulgu_geri_al', 'Bu sayfada daha önce bildirdiğin bir bulguyu geri alır (yanlış bildirdiysen).', {
    anahtar: { type: 'string' },
    neden: reason,
  }),
  tool('sorun_durumu', 'Daha önce bulunmuş açık bir sorunun bu ekranda hâlâ var olup olmadığını bildirir.', {
    anahtar: { type: 'string' },
    durum: { type: 'string', enum: ['var', 'yok'] },
    aciklama: { type: 'string' },
  }),
  tool('gorevi_bitir', 'Görevi bitirir.', {
    ozet: { type: 'string', description: '1-2 cümle: ne denendi, ne bulundu.' },
    eksik: {
      type: 'string',
      description: 'Görevde olup ulaşamadığın ya da deneyemediğin maddeler; hepsini yaptıysan boş.',
    },
  }),
]

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    ozet: { type: 'string', description: 'Sayfanın ne olduğu, 1-2 cümle.' },
    gorevler: {
      type: 'array',
      items: {
        type: 'object',
        properties: { baslik: { type: 'string' }, amac: { type: 'string' } },
        required: ['baslik', 'amac'],
        additionalProperties: false,
      },
    },
  },
  required: ['ozet', 'gorevler'],
  additionalProperties: false,
} as const

/** Yargıcın kararı: aday bulgu kabul, nota indirme ya da ret. */
export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    karar: { type: 'string', enum: ['kabul', 'not', 'ret'] },
    tur: { type: 'string', enum: ['kesin', 'tutarsizlik', 'not'] },
    anahtar: { type: 'string' },
    baslik: { type: 'string' },
    gerekce: { type: 'string' },
  },
  required: ['karar', 'tur', 'anahtar', 'baslik', 'gerekce'],
  additionalProperties: false,
} as const

const FINDINGS = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      tur: { type: 'string', enum: ['kesin', 'tutarsizlik', 'not'] },
      anahtar: { type: 'string' },
      baslik: { type: 'string' },
      senaryo: { type: 'string' },
      beklenen: { type: 'string' },
      gozlenen: { type: 'string' },
      alinti: { type: 'string' },
    },
    required: ['tur', 'anahtar', 'baslik', 'senaryo', 'beklenen', 'gozlenen', 'alinti'],
    additionalProperties: false,
  },
} as const

/**
 * Gözün çıktısı: bu ekran durumunda görülen bulgular (yoksa boş) ve başka ekranlarla karşılaştırılacak kısa notlar
 * (etiket ve durum adları, sayaçlar, toplamlar, dönem etiketleri). Notlar sonraki incelemelere gider: ekranlar arası tutarsızlık tek ekrana bakarak görülmüyordu (ölçüldü).
 */
export const INSPECT_SCHEMA = {
  type: 'object',
  properties: {
    bulgular: FINDINGS,
    notlar: { type: 'array', items: { type: 'string' } },
  },
  required: ['bulgular', 'notlar'],
  additionalProperties: false,
} as const
