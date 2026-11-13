import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { ArgusError } from '../errors.ts'
import type { PlatformCredentials } from './credentials.ts'

/** Studio'nun API istemcisi jetonu bu çerezden okur. */
export const ACCESS_TOKEN_COOKIE = 'NG_AccessToken'

function post(url: URL, headers: Record<string, string>, body: string, timeoutMs: number) {
  const send = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = send(url, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
      )
    })
    req.on('timeout', () => req.destroy(new Error(`zaman aşımı (${timeoutMs} ms)`)))
    req.on('error', reject)
    req.end(body)
  })
}

/** Tarayıcının platform kullanıcısıyla bakması için jeton: TOKEN varsa o, yoksa `/connect/token`. Yalnız okur. */
export async function fetchAccessToken(
  credentials: PlatformCredentials,
  timeoutMs = 30_000,
): Promise<string> {
  if (credentials.token) return credentials.token
  const url = new URL(`${credentials.orgApiBaseUrl}/connect/token`)
  const body = new URLSearchParams({
    Username: credentials.username ?? '',
    Password: credentials.password ?? '',
  }).toString()
  let response
  try {
    response = await post(
      url,
      {
        host: `${credentials.organization}.${credentials.hostSuffix}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
      timeoutMs,
    )
  } catch (error) {
    throw new ArgusError(
      'SIGN_IN',
      `Giriş ucuna ulaşılamadı (${url.origin}): ${error instanceof Error ? error.message : error}`,
    )
  }
  if (response.status >= 400)
    throw new ArgusError('SIGN_IN', `Platform girişi reddedildi (HTTP ${response.status}).`)
  let token: unknown
  try {
    token = (JSON.parse(response.text) as { access_token?: unknown }).access_token
  } catch {
    token = undefined
  }
  if (typeof token !== 'string' || !token)
    throw new ArgusError('SIGN_IN', 'Giriş yanıtında access_token yok.')
  return token
}
