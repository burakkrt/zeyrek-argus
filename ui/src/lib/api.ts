import { pageLoad } from './page-load'

/**
 * Sunucu uçlarına küçük yardımcılar. Hata yanıtında sunucunun Türkçe mesajı fırlatılır. Okuma istekleri sayfa açılış
 * yüklemesine sayılır (`page-load.ts`).
 */
export function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const request = send<T>(path, init)
  return !init.method || init.method === 'GET' ? pageLoad.track(request) : request
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body && !(init.body instanceof FormData)) headers['content-type'] = 'application/json'
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string>) },
  })
  const data = (await response.json().catch(() => ({}))) as T & { hata?: string }
  if (!response.ok) throw new Error(data.hata ?? `İstek başarısız (HTTP ${response.status})`)
  return data
}

export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const put = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}` : ''
}

export const fileUrl = (runId: string, rel: string | null | undefined) =>
  rel ? `/api/kosular/${runId}/dosya/${rel}` : null
