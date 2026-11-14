import type { AppRef } from '@argus/shared'

/**
 * Süper giriş sözleşmesi: uygulamanın kendi akışı (platform özelliği değil), bu yüzden uç adları kodda değil
 * uygulamanın hafızasında (`memory/apps/<proje>/<uygulama>/kimlik.md`, ekiple Git'te paylaşılır). Dosya yoksa ya da
 * eksikse uygulamada süper giriş yok sayılır ve hiç denenmez.
 */
export interface SuperLoginSpec {
  /** Başlatma ucunun adı (`/api/<proje>/m/<uygulama>/<ad>`). */
  start: string
  stop: string
  /** Gövdede hedef kullanıcı kimliğinin alanı. */
  targetField: string
  /** Gövdenin sabit ek alanları (`super_giris_govde_<alan>`). */
  body: Record<string, string>
  /** Hedef kimliğinin okunduğu Connect Data listesi: `<sayfa>/<alan>`. */
  users: string
  /** İsteklerin gönderildiği sayfa (`x-page`): erişim denetimi süper giriş iznini bu sayfanın bağlamında arar. */
  page: string
  /** Yanıtta jetonun alanı; jeton istemci tarafından oturum çerezine yazılır (sunucu yazmaz). */
  tokenField: string
  /** Uygulamanın oturum çerezi. */
  cookie: string
}

const PREFIX = 'super_giris_'
const BODY_PREFIX = `${PREFIX}govde_`

export function parseSuperLogin(data: Record<string, string | string[]>): SuperLoginSpec | null {
  const text = (key: string) => {
    const value = data[`${PREFIX}${key}`]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const start = text('baslat')
  const stop = text('bitir')
  const targetField = text('hedef_alani')
  const users = text('kullanicilar')
  const page = text('sayfa')
  const tokenField = text('jeton_alani')
  const cookie = text('cerez')
  if (!start || !stop || !targetField || !users || !page || !tokenField || !cookie) return null
  if (!/^[\w-]+\/[\w-]+$/.test(users)) return null
  const body = Object.fromEntries(
    Object.entries(data)
      .filter(([key, value]) => key.startsWith(BODY_PREFIX) && typeof value === 'string')
      .map(([key, value]) => [key.slice(BODY_PREFIX.length), value as string]),
  )
  return { start, stop, targetField, body, users, page, tokenField, cookie }
}

export const flowPath = (app: AppRef, name: string) =>
  `/api/${encodeURIComponent(app.project)}/m/${encodeURIComponent(app.application)}/${encodeURIComponent(name)}`

export const usersPath = (app: AppRef, spec: SuperLoginSpec) =>
  `/api/${encodeURIComponent(app.project)}/connect-data/${encodeURIComponent(app.application)}/${spec.users}/options`

export interface Person {
  id: string
  label: string
}

/** Connect Data seçenek satırları: `id` + ilk metin alanı görünen ad olur. */
export function peopleOf(rows: unknown): Person[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const record = row as Record<string, unknown>
    const id = typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id) : null
    const label = Object.entries(record).find(([key, v]) => key !== 'id' && typeof v === 'string')?.[1]
    return id && typeof label === 'string' ? [{ id, label }] : []
  })
}

const fold = (text: string) => text.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

/**
 * İstenen kişiyi listede bulur: kimlikle ya da adla (Türkçe harf duyarsız, tam eşleşme). Ad birden çok kişide varsa
 * tahmin edilmez; seçenekleri söyleyen hata döner.
 */
export function findPerson(people: Person[], wanted: string): { person: Person } | { error: string } {
  const key = fold(wanted)
  const byId = people.find((p) => p.id === wanted.trim())
  if (byId) return { person: byId }
  const matches = people.filter((p) => fold(p.label) === key)
  if (matches.length === 1) return { person: matches[0]! }
  if (matches.length > 1)
    return {
      error: `"${wanted}" adında ${matches.length} kişi var; kimliğiyle seçin (${matches.map((m) => m.id).join(', ')}).`,
    }
  return { error: `"${wanted}" süper giriş listesinde yok.` }
}
