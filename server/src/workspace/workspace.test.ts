import type { CatalogEnvironment, Workspace } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { confirmWorkspace, resolveWorkspace, type WorkspaceCatalog } from './workspace.ts'

interface World {
  projects: Array<{ slug: string; name: string; apps: string[]; envs: CatalogEnvironment[] }>
}

const env = (name: string, state = 'ready'): CatalogEnvironment => ({ name, slug: name, state })

function catalogOf(world: World | 'offline'): WorkspaceCatalog {
  const fail = () => Promise.reject(new Error('MCP kapalı'))
  if (world === 'offline') return { projects: fail, applications: fail, environments: fail }
  const project = (slug: string) => world.projects.find((p) => p.slug === slug)!
  return {
    projects: async () => world.projects.map((p) => ({ id: p.slug, slug: p.slug, name: p.name })),
    applications: async (slug) => project(slug).apps.map((a) => ({ id: a, slug: a, name: a.toUpperCase() })),
    environments: async (slug) => project(slug).envs,
  }
}

const qm: World = {
  projects: [
    { slug: 'qm', name: 'QM', apps: ['web', 'mobil'], envs: [env('development'), env('feature-x')] },
    { slug: 'crm', name: 'CRM', apps: ['web'], envs: [env('development')] },
  ],
}
const ws = (project: string, application: string, environment: string): Workspace => ({
  project,
  application,
  environment,
})

describe('çalışma alanı', () => {
  it('kayıtlı ve geçerli seçim olduğu gibi açılır, görünen adlar katalogdan gelir', async () => {
    const state = await resolveWorkspace(catalogOf(qm), ws('qm', 'web', 'feature-x'), [])
    expect(state).toEqual({
      workspace: ws('qm', 'web', 'feature-x'),
      labels: { project: 'QM', application: 'WEB' },
      notice: null,
    })
  })

  it('kayıtlı dal silinmişse aynı uygulamanın development dalına geçer ve söyler', async () => {
    const state = await resolveWorkspace(catalogOf(qm), ws('qm', 'web', 'feature-silindi'), [
      ws('crm', 'web', 'development'),
    ])
    expect(state.workspace).toEqual(ws('qm', 'web', 'development'))
    expect(state.notice).toBe('qm/web · feature-silindi bulunamadı; qm/web · development açıldı.')
  })

  it('hiç seçim yoksa soru sormadan son koşunun çalışma alanını açar, silinmiş olanı atlar', async () => {
    const state = await resolveWorkspace(catalogOf(qm), null, [
      ws('qm', 'eski', 'development'),
      ws('qm', 'mobil', 'feature-x'),
    ])
    expect(state).toEqual({
      workspace: ws('qm', 'mobil', 'feature-x'),
      labels: { project: 'QM', application: 'MOBIL' },
      notice: null,
    })
  })

  it('koşu yoksa ve tek proje tek uygulama varsa onun development dalını açar', async () => {
    const single: World = {
      projects: [{ slug: 'crm', name: 'CRM', apps: ['web'], envs: [env('feature-a'), env('development')] }],
    }
    expect((await resolveWorkspace(catalogOf(single), null, [])).workspace).toEqual(
      ws('crm', 'web', 'development'),
    )
  })

  it('çıkarılamıyorsa seçim ister; production ve hazır olmayan dal hiç geçerli sayılmaz', async () => {
    expect(await resolveWorkspace(catalogOf(qm), null, [])).toEqual({
      workspace: null,
      labels: null,
      notice: null,
    })
    const notReady: World = {
      projects: [{ slug: 'qm', name: 'QM', apps: ['web'], envs: [env('development', 'creating')] }],
    }
    expect(
      (await resolveWorkspace(catalogOf(notReady), null, [ws('qm', 'web', 'development')])).workspace,
    ).toBe(null)
    expect((await resolveWorkspace(catalogOf(qm), null, [ws('qm', 'web', 'production')])).workspace).toBe(
      null,
    )
  })

  it('platforma ulaşılamazken kayıtlı seçim bırakılmaz, seçim yoksa son koşu açılır', async () => {
    const state = await resolveWorkspace(catalogOf('offline'), ws('qm', 'web', 'feature-x'), [])
    expect(state).toEqual({
      workspace: ws('qm', 'web', 'feature-x'),
      labels: { project: 'qm', application: 'web' },
      notice: null,
    })
    expect(
      (await resolveWorkspace(catalogOf('offline'), null, [ws('qm', 'mobil', 'development')])).workspace,
    ).toEqual(ws('qm', 'mobil', 'development'))
  })

  it('kullanıcı seçimi platformda doğrulanmadan kaydedilmez', async () => {
    await expect(confirmWorkspace(catalogOf(qm), ws('qm', 'web', 'production'))).rejects.toThrow('production')
    await expect(confirmWorkspace(catalogOf(qm), ws('qm', 'yok', 'development'))).rejects.toThrow(
      'bulunamadı',
    )
    await expect(confirmWorkspace(catalogOf('offline'), ws('qm', 'web', 'development'))).rejects.toThrow(
      'ulaşılamadı',
    )
    expect((await confirmWorkspace(catalogOf(qm), ws('crm', 'web', 'development'))).labels).toEqual({
      project: 'CRM',
      application: 'WEB',
    })
  })
})
