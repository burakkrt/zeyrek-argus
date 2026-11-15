import type { PageGroup, RunInfo } from '@argus/shared'
import { describe, expect, it } from 'vitest'
import { estimateRun, pagesFromLinks, scopeRows, startProblem } from './start'

const groups: PageGroup[] = [
  {
    key: 'egt',
    pages: [
      { id: '1', slug: 'egt-liste', name: 'Eğitim listesi' },
      { id: '2', slug: 'egt-form', name: 'Eğitim formu' },
    ],
  },
  { key: 'iş', pages: [{ id: '3', slug: 'iş-takvim', name: 'İş takvimi' }] },
]

const run = (over: Partial<RunInfo>): RunInfo =>
  ({
    status: 'bitti',
    pages: ['a'],
    options: { maxTasks: 1, maxSteps: 10 },
    usage: { costUsd: 0.2 },
    startedAt: '2026-11-01T10:00:00Z',
    finishedAt: '2026-11-01T10:01:00Z',
    ...over,
  }) as RunInfo

describe('yeni koşu', () => {
  it('bağlantılardan katalogdaki sayfalar sırayla ve tekrarsız çözülür; dal öneki ve yabancı bağlantı yok sayılır', () => {
    const text = `Şurada kayıyor http://localhost:15000/branch/feature-x/qm/web/egt-form?id=4 ve
      https://ornek.com/baska bir de http://localhost:15000/dev/qm/web/egt-liste, yine http://localhost:15000/qm/web/egt-form
      ve http://localhost:15000/qm/web/i%C5%9F-takvim`
    expect(pagesFromLinks(text, groups)).toEqual(['egt-form', 'egt-liste', 'iş-takvim'])
    expect(pagesFromLinks('bağlantı yok', groups)).toEqual([])
  })

  it('tahmin model çalıştırmış bitmiş koşuların sayfa başına birim medyanından; geçmiş yoksa varsayım', () => {
    const history = [
      run({
        pages: ['a', 'b'],
        options: { maxTasks: 2, maxSteps: 10 },
        usage: { costUsd: 0.8 } as RunInfo['usage'],
      }),
      run({ finishedAt: '2026-11-01T10:03:00Z', usage: { costUsd: 0.3 } as RunInfo['usage'] }),
      run({ usage: { costUsd: 0.1 } as RunInfo['usage'] }),
      run({ status: 'hata', usage: { costUsd: 9 } as RunInfo['usage'] }),
      run({ finishedAt: '2026-11-01T10:00:09Z', usage: { costUsd: 0 } as RunInfo['usage'] }),
    ]
    // Birimler (sayfa başına): (0.5 dk, 0.4$), (3 dk, 0.3$), (1 dk, 0.1$) → medyan 1 dk, 0.3$.
    expect(estimateRun(history, 3)).toEqual({ minutes: 3, cost: expect.closeTo(0.9, 5), basis: 'gecmis' })
    expect(estimateRun([], 2)).toEqual({ minutes: 4, cost: expect.closeTo(1.6, 5), basis: 'varsayim' })
    expect(estimateRun(history, 0)).toBeNull()
  })

  it('kapsam satırı: son koşu en yeni koşudan, açık bulgu yalnız açık/düzeltilecek durumdan; modülsüz boş', () => {
    const runs = [
      { pages: ['egt-form'], createdAt: '2026-11-12T09:00:00Z', startedAt: '2026-11-12T09:01:00Z' },
      { pages: ['egt-form', 'egt-liste'], createdAt: '2026-11-10T09:00:00Z', startedAt: null },
    ]
    const issues = [
      { pages: ['egt-liste', 'egt-liste'], status: 'acik' as const },
      { pages: ['egt-liste'], status: 'duzeltilecek' as const },
      { pages: ['egt-liste', 'egt-form'], status: 'duzeldi' as const },
    ]
    const withLoose = [...groups, { key: '—', pages: [{ id: '9', slug: 'giris', name: 'Giriş' }] }]
    expect(scopeRows(withLoose, runs, issues)).toEqual([
      {
        id: '1',
        slug: 'egt-liste',
        name: 'Eğitim listesi',
        module: 'egt',
        lastRun: '2026-11-10T09:00:00Z',
        openIssues: 2,
      },
      {
        id: '2',
        slug: 'egt-form',
        name: 'Eğitim formu',
        module: 'egt',
        lastRun: '2026-11-12T09:01:00Z',
        openIssues: 0,
      },
      { id: '3', slug: 'iş-takvim', name: 'İş takvimi', module: 'iş', lastRun: null, openIssues: 0 },
      { id: '9', slug: 'giris', name: 'Giriş', module: '', lastRun: null, openIssues: 0 },
    ])
  })

  it('başlatma engeli: sayfa da girdi de yoksa; sonra süren yükleme', () => {
    expect(startProblem({ pages: 0, brief: '  ', files: 0, uploading: true })?.title).toBe('Ne test edilsin?')
    expect(startProblem({ pages: 2, brief: '', files: 0, uploading: true })?.title).toBe(
      'Dosyalar yükleniyor',
    )
    expect(startProblem({ pages: 2, brief: '', files: 0, uploading: false })).toBeNull()
    // Sayfa seçmeden yalnız girdi ya da ek yeter: sayfalar girdiden seçilir.
    expect(
      startProblem({ pages: 0, brief: 'Performans modülünü test et', files: 0, uploading: false }),
    ).toBeNull()
    expect(startProblem({ pages: 0, brief: '', files: 1, uploading: false })).toBeNull()
  })
})
