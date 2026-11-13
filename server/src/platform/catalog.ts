import type { CatalogApplication, CatalogEnvironment, CatalogPage, CatalogProject } from '@argus/shared'
import { ArgusError } from '../errors.ts'
import type { McpClient } from './mcp.ts'

const LIST_KEYS = ['items', 'projects', 'applications', 'environments', 'pages', 'data', 'result', 'value']

function findList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    for (const key of LIST_KEYS) {
      const inner = findList((value as Record<string, unknown>)[key])
      if (inner.length) return inner
    }
  }
  return []
}

const str = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === 'string' ? (record[key] as string) : ''

function records(payload: unknown): Array<Record<string, unknown>> {
  return findList(payload).filter(
    (item): item is Record<string, unknown> => !!item && typeof item === 'object',
  )
}

export function parseNamed(payload: unknown): Array<{ id: string; slug: string; name: string }> {
  return records(payload).flatMap((r) => {
    const id = str(r, 'id')
    const slug = str(r, 'slug') || str(r, 'name')
    return id && slug ? [{ id, slug, name: str(r, 'name') || slug }] : []
  })
}

/** Eksik alan uydurulmaz: durumu bilinmeyen dal "hazır" sayılmaz, slug'ı yoksa adresi kurulmaz. */
export function parseEnvironments(payload: unknown): CatalogEnvironment[] {
  return records(payload).flatMap((r) => {
    const name = str(r, 'name')
    return name ? [{ name, slug: str(r, 'slug'), state: str(r, 'state') || 'bilinmiyor' }] : []
  })
}

export function parsePages(payload: unknown): CatalogPage[] {
  return records(payload).flatMap((r) => {
    const id = str(r, 'id')
    const slug = str(r, 'slug')
    return id && slug ? [{ id, slug, name: str(r, 'name') || slug }] : []
  })
}

export const isProduction = (name: string) => name.trim().toLowerCase() === 'production'

export function assertNotProduction(environment: string): void {
  if (isProduction(environment)) {
    throw new ArgusError('PRODUCTION', 'production ortamına koşulmaz; development ya da bir dal seçin.')
  }
}

/** MCP üzerinden platform kataloğu: projeler, uygulamalar, ortamlar (dallar), sayfalar. Yalnız okur. */
export class Catalog {
  private ids = new Map<string, string>()

  constructor(private readonly mcp: () => Promise<McpClient>) {}

  async projects(): Promise<CatalogProject[]> {
    const list = parseNamed(await (await this.mcp()).call('project_list', {}))
    for (const p of list) this.ids.set(`p:${p.slug}`, p.id)
    return list.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  }

  private async projectId(project: string): Promise<string> {
    const cached = this.ids.get(`p:${project}`)
    if (cached) return cached
    const list = parseNamed(await (await this.mcp()).call('project_list', { searchTerm: project }))
    const match = list.find((p) => p.slug === project || p.name === project)
    if (!match) throw new ArgusError('PROJECT_NOT_FOUND', `'${project}' projesi bulunamadı.`)
    this.ids.set(`p:${project}`, match.id)
    return match.id
  }

  async applications(project: string): Promise<CatalogApplication[]> {
    const projectId = await this.projectId(project)
    const list = parseNamed(await (await this.mcp()).call('application_list', { projectId }))
    for (const a of list) this.ids.set(`a:${project}/${a.slug}`, a.id)
    return list
  }

  private async applicationId(project: string, application: string): Promise<string> {
    const cached = this.ids.get(`a:${project}/${application}`)
    if (cached) return cached
    const match = (await this.applications(project)).find((a) => a.slug === application)
    if (!match)
      throw new ArgusError('APP_NOT_FOUND', `'${project}' projesinde '${application}' uygulaması yok.`)
    return match.id
  }

  /** production listelenmez: Argus oraya koşmaz. */
  async environments(project: string): Promise<CatalogEnvironment[]> {
    const projectId = await this.projectId(project)
    return parseEnvironments(await (await this.mcp()).call('environment_list', { projectId })).filter(
      (e) => !isProduction(e.name),
    )
  }

  async environment(project: string, name: string): Promise<CatalogEnvironment> {
    assertNotProduction(name)
    const list = await this.environments(project)
    const match = list.find((e) => e.name === name)
    if (!match)
      throw new ArgusError(
        'ENV_NOT_FOUND',
        `'${name}' ortamı yok. Var olanlar: ${list.map((e) => e.name).join(', ')}`,
      )
    if (match.state !== 'ready')
      throw new ArgusError('ENV_NOT_READY', `'${name}' hazır değil (durum: ${match.state}).`)
    if (name !== 'development' && !match.slug)
      throw new ArgusError('ENV_NO_SLUG', `'${name}' dalının adres kısaltması yok.`)
    return match
  }

  async pages(project: string, application: string, environment: string): Promise<CatalogPage[]> {
    assertNotProduction(environment)
    const applicationId = await this.applicationId(project, application)
    return parsePages(await (await this.mcp()).call('page_list', { project, environment, applicationId }))
  }
}

/** Studio'daki çalışma adresi: development `/dev/…`, dal `/branch/<slug>/…`. */
export function pageUrl(input: {
  studioBaseUrl: string
  project: string
  application: string
  page: string
  environment: CatalogEnvironment
}): string {
  assertNotProduction(input.environment.name)
  assertNotProduction(input.environment.slug)
  const base = input.studioBaseUrl.replace(/\/+$/, '')
  const tail = [input.project, input.application, input.page.replace(/^\/+|\/+$/g, '')]
    .map(encodeURIComponent)
    .join('/')
  return input.environment.name === 'development'
    ? `${base}/dev/${tail}`
    : `${base}/branch/${encodeURIComponent(input.environment.slug)}/${tail}`
}
