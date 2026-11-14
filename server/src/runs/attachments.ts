import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { ArgusError } from '../errors.ts'
import { xlsxRows } from '../memory/xlsx.ts'

/**
 * Koşu ekleri: kullanıcının Yeni koşu'da talimatına eklediği dosyalar — ekran görüntüsü, müşterinin bulgu Excel'i,
 * gereksinim PDF'i, Word dokümanı, CSV/metin. Dosya `data/ekler/<kimlik>` olarak saklanır (Git'e girmez); koşu
 * kimlikleri taşır, yalnız planlayıcı model görür. Model her türü kendi biçiminde alır: görsel → görsel bloğu, PDF →
 * belge bloğu, Excel / Word / metin → metne çevrilip isteme yazılır. Ek yoksa koşunun maliyeti değişmez.
 */

type Kind = 'image' | 'pdf' | 'xlsx' | 'docx' | 'text'

/** Uzantı → tür ve (görselde) model ortam türü. Tür uzantıdan çıkarılır: Windows CSV'ye bile Excel MIME'ı verir. */
const EXTENSIONS: Record<string, { kind: Kind; mediaType?: ImageMediaType }> = {
  png: { kind: 'image', mediaType: 'image/png' },
  jpg: { kind: 'image', mediaType: 'image/jpeg' },
  jpeg: { kind: 'image', mediaType: 'image/jpeg' },
  webp: { kind: 'image', mediaType: 'image/webp' },
  gif: { kind: 'image', mediaType: 'image/gif' },
  pdf: { kind: 'pdf' },
  xlsx: { kind: 'xlsx' },
  docx: { kind: 'docx' },
  csv: { kind: 'text' },
  txt: { kind: 'text' },
  md: { kind: 'text' },
  json: { kind: 'text' },
  log: { kind: 'text' },
}
const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
export const ACCEPTED_EXTENSIONS = Object.keys(EXTENSIONS)
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENTS = 6
/** Metne çevrilen ekin isteme giren üst sınırı (karakter): büyük Excel istemi şişirmesin. */
export const TEXT_LIMIT = 20_000
const ID = /^[0-9a-f-]{36}_[\p{L}\p{N}._-]{1,80}$/u

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

const dirOf = (dataDir: string) => join(dataDir, 'ekler')
const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
/** Dosya adı kimliğe güvenli biçimde girer: model eki adıyla anar, kullanıcı ne eklediğini görür. */
const safeName = (name: string) =>
  name
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-80) || 'ek'

/** Ekin adı (kimlikten): `<uuid>_<ad>`. */
export const attachmentName = (id: string) => id.slice(37)

export function saveAttachment(dataDir: string, bytes: Uint8Array, name: string, type = ''): string {
  const ext = extOf(name) || MIME_EXT[type] || ''
  if (!EXTENSIONS[ext])
    throw new ArgusError(
      'ATTACHMENT_TYPE',
      'Bu dosya türü eklenemez. Görsel, PDF, Excel (.xlsx), Word (.docx), CSV ya da metin dosyası ekleyin.',
    )
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES)
    throw new ArgusError('ATTACHMENT_SIZE', 'Dosya en çok 10 MB olabilir.')
  const base = safeName(extOf(name) ? name : `${name || 'ek'}.${ext}`)
  const id = `${crypto.randomUUID()}_${base}`
  mkdirSync(dirOf(dataDir), { recursive: true })
  writeFileSync(join(dirOf(dataDir), id), bytes)
  return id
}

/** Koşuya yazılacak kimlikler: biçimi doğru ve dosyası olanlar, en çok `MAX_ATTACHMENTS`; gerisi sessizce atılır. */
export function validAttachments(dataDir: string, ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids)]
    .filter(
      (id): id is string =>
        typeof id === 'string' &&
        ID.test(id) &&
        !!EXTENSIONS[extOf(id)] &&
        existsSync(join(dirOf(dataDir), id)),
    )
    .slice(0, MAX_ATTACHMENTS)
}

/** Planlayıcıya giden ek: görsel ve PDF base64, gerisi düz metin. */
export type Attachment =
  | { name: string; kind: 'image'; mediaType: ImageMediaType; data: string }
  | { name: string; kind: 'pdf'; data: string }
  | { name: string; kind: 'text'; text: string; truncated: boolean }

const docxText = (bytes: Uint8Array) => {
  const xml = unzipSync(bytes)['word/document.xml']
  if (!xml) return ''
  return [...strFromU8(xml).matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((p) => [...p[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(''))
    .filter(Boolean)
    .join('\n')
}

const asText = (name: string, text: string): Attachment => ({
  name,
  kind: 'text',
  text: text.slice(0, TEXT_LIMIT),
  truncated: text.length > TEXT_LIMIT,
})

/** Planlayıcıya gidecek ekler; okunamayan (bozuk Excel/Word) yerine ne olduğunu söyleyen kısa metin gider. */
export function loadAttachments(dataDir: string, ids: string[]): Attachment[] {
  return validAttachments(dataDir, ids).map((id): Attachment => {
    const name = attachmentName(id)
    const bytes = readFileSync(join(dirOf(dataDir), id))
    const type = EXTENSIONS[extOf(id)]!
    try {
      switch (type.kind) {
        case 'image':
          return { name, kind: 'image', mediaType: type.mediaType!, data: bytes.toString('base64') }
        case 'pdf':
          return { name, kind: 'pdf', data: bytes.toString('base64') }
        case 'xlsx':
          return asText(
            name,
            xlsxRows(new Uint8Array(bytes))
              .map((cells) => [...cells].map((c) => (c ?? '').replace(/\s+/g, ' ')).join(' | '))
              .filter((line) => line.replace(/[\s|]/g, ''))
              .join('\n'),
          )
        case 'docx':
          return asText(name, docxText(new Uint8Array(bytes)))
        default:
          return asText(name, bytes.toString('utf8'))
      }
    } catch {
      return asText(name, '(dosya okunamadı)')
    }
  })
}
