import type { CatalogPage } from '@argus/shared'
import type { Attachment } from '../runs/attachments.ts'
import { jsonOf, type CreateMessage, type UsageMeter } from './model.ts'

/**
 * Sayfa seçilmeden, yalnız girdiyle başlatılan koşu: planlayıcı modeli uygulamanın sayfa listesinden girdinin
 * gerektirdiği sayfaları seçer; koşu o sayfalarla olağan biçimde sürer. Liste dışı ad atılır; hiçbir sayfa
 * seçilemezse boş döner ve koşu nedenini söyleyerek durur.
 */
const PICK_SCHEMA = {
  type: 'object',
  properties: {
    sayfalar: { type: 'array', items: { type: 'string' } },
    gerekce: { type: 'string' },
  },
  required: ['sayfalar', 'gerekce'],
  additionalProperties: false,
} as const

export async function pickPages(input: {
  createMessage: CreateMessage
  meter: UsageMeter
  model: string
  brief: string | null
  attachments: Attachment[]
  catalog: CatalogPage[]
}): Promise<{ pages: string[]; reason: string }> {
  const files = input.attachments
    .map((a) => (a.kind === 'text' ? `Ek: ${a.name}\n<<<EK\n${a.text.slice(0, 4000)}\nEK>>>` : `Ek: ${a.name}`))
    .join('\n')
  const message = await input.createMessage({
    model: input.model,
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content:
          'SAYFA SEÇİMİ GÖREVİ: Kullanıcı test koşusu için sayfa seçmedi, yalnız ne istediğini yazdı. Aşağıdaki sayfa ' +
          'listesinden bu isteği karşılamak için test edilmesi gereken sayfaları seç (slug olarak, en önemlisi önce). ' +
          'İstek bir modülü ya da akışı anlatıyorsa onun bütün sayfalarını al; eksik kalmasın, ilgisizini alma.\n\n' +
          `İSTEK:\n${input.brief ?? '(yalnız dosya eklendi)'}\n${files}\n\nSAYFALAR (slug — ad):\n` +
          input.catalog.map((p) => `${p.slug} — ${p.name}`).join('\n'),
      },
    ],
    output_config: { format: { type: 'json_schema', schema: PICK_SCHEMA as unknown as Record<string, unknown> } },
  })
  input.meter.add(input.model, message, 'planner')
  const answer = jsonOf<{ sayfalar: string[]; gerekce: string }>(message)
  const known = new Set(input.catalog.map((p) => p.slug))
  return {
    pages: [...new Set((answer?.sayfalar ?? []).filter((slug) => known.has(slug)))],
    reason: answer?.gerekce ?? '',
  }
}
