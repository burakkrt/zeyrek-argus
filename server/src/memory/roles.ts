import { ArgusError } from '../errors.ts'
import { parseDocument } from './frontmatter.ts'

/**
 * Rol talimatları: Argus'un her rolünün (gezgin, göz, yargıç, planlayıcı…) ne yaptığını ve neye dikkat ettiğini anlatan
 * metinler `memory/brain/roles/<kimlik>.md` dosyalarındadır, kodda değil: insan okur, Git'te geliştirir. Kod yalnız dosyayı
 * okur, o anın bilgisini yer tutuculara (`{{ad}}`) koyar ve verinin kendisini (sayfa ağacı, aday bulgu, istek) ekler.
 * Dosyalar her koşunun başında okunur: düzenleme sonraki koşuda geçerlidir.
 *
 * Dosya: ön bilgi (`kimlik`, `rol`, `aciklama`) ve gövde. Gövdenin `## Parça: <ad>` başlığından önceki kısmı ana metindir;
 * parçalar koşula göre eklenen metinlerdir (ör. gözetmenin son turu).
 */
export const ROLE_IDS = [
  'temel',
  'goz',
  'terim-gozu',
  'yargic',
  'planlayici',
  'sayfa-plani',
  'arastirmaci',
  'gozetmen',
  'damitici',
] as const
export type RoleId = (typeof ROLE_IDS)[number]

export interface RoleDoc {
  id: string
  title: string
  description: string
  main: string
  parts: Record<string, string>
}

const PART = /^## Parça: ([a-z0-9-]+)\s*$/

export function parseRole(text: string): RoleDoc | null {
  const { data, body } = parseDocument(text)
  const id = typeof data.kimlik === 'string' ? data.kimlik.trim() : ''
  if (!id) return null
  const sections: Array<{ name: string | null; lines: string[] }> = [{ name: null, lines: [] }]
  for (const line of body.split('\n')) {
    const match = PART.exec(line)
    if (match) sections.push({ name: match[1]!, lines: [] })
    else sections.at(-1)!.lines.push(line)
  }
  const [main, ...rest] = sections
  return {
    id,
    title: typeof data.rol === 'string' ? data.rol.trim() : id,
    description: typeof data.aciklama === 'string' ? data.aciklama.trim() : '',
    main: main!.lines.join('\n').trim(),
    parts: Object.fromEntries(rest.map((s) => [s.name!, s.lines.join('\n').trim()])),
  }
}

/**
 * Yer tutucuları doldurur. Dosyada olup değeri verilmeyen ya da verilip dosyada olmayan ad hatadır: insan dosyada bir
 * yer tutucuyu silerse ya da yanlış yazarsa sessizce eksik talimat gitmez, koşu nedenini söyleyerek durur.
 */
export function fill(text: string, values: Record<string, string | number> = {}): string {
  const used = new Set<string>()
  const out = text.replace(/\{\{([a-z0-9_]+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new ArgusError('ROL_TALIMATI', `Rol talimatında değeri verilmeyen yer tutucu: {{${name}}}`)
    used.add(name)
    return String(values[name])
  })
  const unused = Object.keys(values).filter((name) => !used.has(name))
  if (unused.length)
    throw new ArgusError('ROL_TALIMATI', `Rol talimatında beklenen yer tutucu yok: ${unused.map((n) => `{{${n}}}`).join(', ')}`)
  return out
}

export class RoleBook {
  constructor(private readonly docs: Map<string, RoleDoc>) {}

  private doc(id: RoleId): RoleDoc {
    const doc = this.docs.get(id)
    if (!doc) throw new ArgusError('ROL_TALIMATI', `Rol talimatı yok: memory/brain/roles/${id}.md`)
    return doc
  }

  text(id: RoleId, values?: Record<string, string | number>): string {
    return fill(this.doc(id).main, values)
  }

  part(id: RoleId, name: string, values?: Record<string, string | number>): string {
    const part = this.doc(id).parts[name]
    if (part === undefined) throw new ArgusError('ROL_TALIMATI', `Rol talimatında parça yok: memory/brain/roles/${id}.md → ${name}`)
    return fill(part, values)
  }
}

/** Dosyalardan rol kitabı; eksik rol koşu başlamadan söylenir. */
export function roleBook(docs: RoleDoc[]): RoleBook {
  const byId = new Map(docs.map((d) => [d.id, d]))
  const missing = ROLE_IDS.filter((id) => !byId.has(id))
  if (missing.length)
    throw new ArgusError('ROL_TALIMATI', `Rol talimatı eksik: ${missing.map((id) => `memory/brain/roles/${id}.md`).join(', ')}`)
  return new RoleBook(byId)
}
