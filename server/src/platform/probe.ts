import type { AppRef, ProbeLine } from '@argus/shared'
import { BrowserSession } from '../browser/session.ts'
import { errorMessage } from '../errors.ts'
import { pageUrl } from './catalog.ts'
import { describeAccess } from './credentials.ts'
import type { Platform } from './platform.ts'
import { fetchAccessToken } from './token.ts'

/** Bağlantı denetimi: ilk kırılan adımda durur, nedenini söyler. Yalnız okur. */
export async function probe(
  platform: Platform,
  input: AppRef & {
    environment: string
    appUser: { identifier: string; password: string } | null
    headless?: boolean
  },
): Promise<ProbeLine[]> {
  const lines: ProbeLine[] = []
  let access
  try {
    access = platform.access()
    const d = describeAccess(access)
    lines.push({ status: 'ok', label: 'zeyrek-mcp ayarı okundu', detail: `${d.host} · ${d.organization}` })
  } catch (error) {
    return [{ status: 'fail', label: 'zeyrek-mcp ayarı', detail: errorMessage(error) }]
  }
  let environment
  try {
    await (await platform.mcp()).call('platform_whoami', {})
    lines.push({ status: 'ok', label: 'MCP bağlantısı', detail: 'platform_whoami yanıt verdi' })
    environment = await platform.catalog.environment(input.project, input.environment)
    lines.push({ status: 'ok', label: `Ortam hazır: ${input.environment}` })
  } catch (error) {
    lines.push({ status: 'fail', label: 'MCP / ortam', detail: errorMessage(error) })
    return lines
  }
  let token
  try {
    token = await fetchAccessToken(access.credentials)
    lines.push({ status: 'ok', label: 'Platform girişi', detail: 'jeton alındı' })
  } catch (error) {
    lines.push({ status: 'fail', label: 'Platform girişi', detail: errorMessage(error) })
    return lines
  }
  let session: BrowserSession | null = null
  try {
    session = await BrowserSession.open({
      origin: new URL(access.credentials.studioBaseUrl).origin,
      accessToken: token,
      headless: input.headless ?? true,
    })
    const url = pageUrl({
      studioBaseUrl: access.credentials.studioBaseUrl,
      project: input.project,
      application: input.application,
      page: '',
      environment,
    })
    const outcome = await session.signIn(url, input.appUser)
    lines.push({
      status: 'ok',
      label: outcome === 'girildi' ? 'Uygulamaya girildi' : 'Uygulama giriş istemiyor',
      ...(outcome === 'girildi' && input.appUser ? { detail: input.appUser.identifier } : {}),
    })
  } catch (error) {
    lines.push({ status: 'fail', label: 'Uygulama girişi', detail: errorMessage(error) })
  } finally {
    await session?.close()
  }
  return lines
}
