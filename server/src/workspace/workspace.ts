import type {
  CatalogApplication,
  CatalogEnvironment,
  CatalogProject,
  Workspace,
  WorkspaceState,
} from '@argus/shared'
import { ArgusError } from '../errors.ts'
import { isProduction } from '../platform/catalog.ts'

/** Çalışma alanını doğrulamak için gereken katalog okumaları (`Catalog` bunu sağlar; testte sahtesi). */
export interface WorkspaceCatalog {
  projects(): Promise<CatalogProject[]>
  applications(project: string): Promise<CatalogApplication[]>
  environments(project: string): Promise<CatalogEnvironment[]>
}

type Check =
  | { status: 'ok'; labels: { project: string; application: string } }
  | { status: 'missing' }
  | { status: 'unknown' }

const DEFAULT_ENVIRONMENT = 'development'
const describe = (w: Workspace) => `${w.project}/${w.application} · ${w.environment}`
const same = (a: Workspace, b: Workspace) =>
  a.project === b.project && a.application === b.application && a.environment === b.environment

/**
 * Seçim platformda hâlâ var mı: proje, projede uygulama, projede hazır dal. Platforma ulaşılamazsa `unknown` —
 * çevrimdışıyken kayıtlı seçim bırakılmaz, yalnız var olmadığı görülünce bırakılır. production hiç geçerli değildir.
 */
async function check(catalog: WorkspaceCatalog, w: Workspace): Promise<Check> {
  if (isProduction(w.environment)) return { status: 'missing' }
  try {
    const project = (await catalog.projects()).find((p) => p.slug === w.project)
    if (!project) return { status: 'missing' }
    const [applications, environments] = await Promise.all([
      catalog.applications(w.project),
      catalog.environments(w.project),
    ])
    const application = applications.find((a) => a.slug === w.application)
    const environment = environments.find((e) => e.name === w.environment && e.state === 'ready')
    if (!application || !environment) return { status: 'missing' }
    return { status: 'ok', labels: { project: project.name, application: application.name } }
  } catch {
    return { status: 'unknown' }
  }
}

const labelsOf = (c: Check, w: Workspace) =>
  c.status === 'ok' ? c.labels : { project: w.project, application: w.application }

/**
 * Açılışta odaklanılacak çalışma alanı; kullanıcıya soru sorulmadan bulunur. Sıra:
 * 1. kayıtlı seçim,
 * 2. kayıtlı seçim dalı silinmişse aynı uygulamanın development'ı,
 * 3. son koşuların proje · uygulama · dalı (yeniden eskiye),
 * 4. platformda tek proje ve tek uygulama varsa o (dal development, yoksa ilk hazır dal).
 * Hiçbiri tutmazsa `workspace: null` döner ve kullanıcı bir kez seçer. Kayıtlı seçim bırakıldıysa `notice` söyler.
 */
export async function resolveWorkspace(
  catalog: WorkspaceCatalog,
  saved: Workspace | null,
  recent: Workspace[],
): Promise<WorkspaceState> {
  const candidates: Workspace[] = []
  if (saved) {
    const savedCheck = await check(catalog, saved)
    if (savedCheck.status !== 'missing')
      return { workspace: saved, labels: labelsOf(savedCheck, saved), notice: null }
    if (saved.environment !== DEFAULT_ENVIRONMENT)
      candidates.push({ ...saved, environment: DEFAULT_ENVIRONMENT })
  }
  for (const run of recent) if (!candidates.some((c) => same(c, run))) candidates.push(run)

  const notice = (w: Workspace | null) =>
    saved
      ? `${describe(saved)} bulunamadı; ${w ? `${describe(w)} açıldı` : 'yeni bir çalışma alanı seçin'}.`
      : null

  for (const candidate of candidates) {
    if (saved && same(candidate, saved)) continue
    const result = await check(catalog, candidate)
    if (result.status !== 'missing')
      return { workspace: candidate, labels: labelsOf(result, candidate), notice: notice(candidate) }
  }

  try {
    const projects = await catalog.projects()
    if (projects.length === 1) {
      const project = projects[0]!
      const [applications, environments] = await Promise.all([
        catalog.applications(project.slug),
        catalog.environments(project.slug),
      ])
      const ready = environments.filter((e) => e.state === 'ready' && !isProduction(e.name))
      const environment = ready.find((e) => e.name === DEFAULT_ENVIRONMENT) ?? ready[0]
      if (applications.length === 1 && environment) {
        const workspace = {
          project: project.slug,
          application: applications[0]!.slug,
          environment: environment.name,
        }
        return {
          workspace,
          labels: { project: project.name, application: applications[0]!.name },
          notice: notice(workspace),
        }
      }
    }
  } catch {
    /* platforma ulaşılamıyor: kullanıcı seçecek */
  }
  return { workspace: null, labels: null, notice: notice(null) }
}

/** Kullanıcının seçtiği çalışma alanı kaydedilmeden önce platformda doğrulanır; doğrulanamayan seçim kaydedilmez. */
export async function confirmWorkspace(catalog: WorkspaceCatalog, w: Workspace): Promise<WorkspaceState> {
  if (isProduction(w.environment))
    throw new ArgusError('PRODUCTION', 'production ortamına koşulmaz; development ya da bir dal seçin.')
  const result = await check(catalog, w)
  if (result.status === 'missing')
    throw new ArgusError('WORKSPACE_NOT_FOUND', `${describe(w)} platformda bulunamadı ya da dal hazır değil.`)
  if (result.status === 'unknown')
    throw new ArgusError('PLATFORM_UNREACHABLE', 'Platforma ulaşılamadı; seçim doğrulanamadı.')
  return { workspace: w, labels: result.labels, notice: null }
}
