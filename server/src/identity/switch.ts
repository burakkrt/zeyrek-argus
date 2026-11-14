import { existsSync, readFileSync } from 'node:fs'
import type { AppRef } from '@argus/shared'
import { endpointKey } from '../browser/guard.ts'
import type { BrowserSession } from '../browser/session.ts'
import { ArgusError } from '../errors.ts'
import { runtimeHeaders } from '../platform/catalog.ts'
import { findPerson, flowPath, peopleOf, usersPath, type Person, type SuperLoginSpec } from './super-login.ts'

/** Connect Data seçenek yanıtında satır dizisi: `{ data: { data: [...] } }` ya da daha sığ biçimler. */
function rowsOf(payload: unknown): unknown {
  let node = payload
  for (let i = 0; i < 3 && node && typeof node === 'object' && !Array.isArray(node); i += 1)
    node = (node as { data?: unknown }).data
  return node
}

/** Gezinti sırasında süper giriş uçlarına istek geçmez; yalnız kimlik katmanı çağırır. */
export function reserveSuperLogin(
  session: BrowserSession,
  origin: string,
  app: AppRef,
  spec: SuperLoginSpec,
) {
  for (const name of [spec.start, spec.stop])
    session.guard.reserved.add(endpointKey('POST', `${origin}${flowPath(app, name)}`))
}

/**
 * Oturumdaki hesaptan istenen kişiye süper girişle geçer. Kişi uygulamanın süper giriş listesinden bulunur; yetki,
 * dal ya da kişi sorunu modelden önce, ne yapılacağını söyleyen hatayla durur.
 */
export async function switchUser(
  session: BrowserSession,
  app: AppRef,
  spec: SuperLoginSpec,
  target: string,
  environment: string,
): Promise<Person> {
  const headers = runtimeHeaders(environment, spec.page)
  const list = await session.identityRequest(
    usersPath(app, spec),
    { op: 'list', page: { limit: 1000, offset: 0 } },
    headers,
  )
  if (list.status !== 200)
    throw new ArgusError(
      'SUPER_LOGIN',
      `Süper giriş kişi listesi okunamadı (HTTP ${list.status}); bu dalda süper giriş olmayabilir.`,
    )
  const found = findPerson(peopleOf(rowsOf(list.data)), target)
  if ('error' in found) throw new ArgusError('SUPER_LOGIN', found.error)
  const started = await session.identityRequest(
    flowPath(app, spec.start),
    { ...spec.body, [spec.targetField]: found.person.id },
    headers,
  )
  if (started.status !== 200)
    throw new ArgusError(
      'SUPER_LOGIN',
      started.status === 403
        ? 'Oturumdaki hesabın süper giriş yetkisi yok; yetkili bir hesabı varsayılan yapın.'
        : started.status === 404
          ? 'Bu dalda süper giriş ucu yok.'
          : `Süper giriş başlatılamadı (HTTP ${started.status}).`,
    )
  // Jetonu oturum çerezine istemci yazar (sunucu yazmaz); yazılmazsa kimlik değişmez.
  const token = tokenOf(started.data, spec.tokenField)
  if (!token || !(await session.setCookieValue(spec.cookie, token)))
    throw new ArgusError('SUPER_LOGIN', 'Süper giriş jetonu alınamadı; kimlik değiştirilemedi.')
  return found.person
}

function tokenOf(payload: unknown, field: string): string | null {
  const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[field] : null
  return typeof value === 'string' && value ? value : null
}

/**
 * Süper girişi kapatır (koşu sonunda, hata olsa da) ve asıl kullanıcının jetonunu çereze geri yazar; kapanmazsa
 * koşuyu düşürmez, `false` döner.
 */
export async function endSuperLogin(
  session: BrowserSession,
  app: AppRef,
  spec: SuperLoginSpec,
  environment: string,
): Promise<boolean> {
  const stopped = await session
    .identityRequest(flowPath(app, spec.stop), spec.body, runtimeHeaders(environment, spec.page))
    .catch(() => null)
  if (stopped?.status !== 200) return false
  const token = tokenOf(stopped.data, spec.tokenField)
  if (token) await session.setCookieValue(spec.cookie, token)
  return true
}

/**
 * Süper giriş kişi listesi, tarayıcı açmadan: asıl hesabın saklanan oturum çerezleriyle sunucudan okunur (Yeni koşu'da
 * "Test kullanıcısı" seçimi için). Saklanan oturum yoksa ya da liste okunamazsa boş döner; koşu yine hesapla açılır.
 */
export async function peopleFromStoredSession(
  origin: string,
  app: AppRef,
  spec: SuperLoginSpec,
  stateFile: string,
  environment: string,
): Promise<Person[]> {
  if (!existsSync(stateFile)) return []
  try {
    const state = JSON.parse(readFileSync(stateFile, 'utf8')) as {
      cookies?: Array<{ name: string; value: string }>
    }
    const cookie = (state.cookies ?? []).map((c) => `${c.name}=${c.value}`).join('; ')
    const response = await fetch(`${origin}${usersPath(app, spec)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, ...runtimeHeaders(environment, spec.page) },
      body: JSON.stringify({ op: 'list', page: { limit: 1000, offset: 0 } }),
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok ? peopleOf(rowsOf(await response.json())) : []
  } catch {
    return []
  }
}
