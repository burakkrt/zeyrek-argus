import { describe, expect, it } from 'vitest'
import type { MonitorModel } from './monitor'
import { planRows } from './run-plan'

const finding = (
  page: string,
  at: number,
  kind: 'kesin' | 'tutarsizlik' | 'not',
  severity: 'S1' | 'S2' | 'S3' | 'S4',
) =>
  ({
    at,
    judge: null,
    event: { page, kind, severity, title: `${severity} ${kind}` },
  }) as unknown as MonitorModel['findings'][number]
const step = (page: string, at: number, task: number) =>
  ({ page, at, task }) as unknown as MonitorModel['steps'][number]

const model = {
  strategy: {
    items: [
      { title: 'Yetki', goal: 'Başkasının cevabını yazmayı dene\nBeklenen: 403 dönmeli — workflow kuralı' },
    ],
  } as unknown as MonitorModel['strategy'],
  pages: [
    {
      page: '@tanimlar',
      status: 'suruyor' as const,
      tasks: [
        { index: 0, title: 'Ana akış', status: 'bitti' as const, at: 10 },
        { index: 1, title: 'Yetki', status: 'suruyor' as const, at: 12 },
        { index: 2, title: 'Temizlik', status: 'bekliyor' as const, at: null },
      ],
    },
  ],
  steps: [step('@tanimlar', 11, 0), step('@tanimlar', 13, 1), step('@tanimlar', 14, 0)],
  findings: [
    finding('@tanimlar', 13.5, 'kesin', 'S1'),
    finding('@tanimlar', 15, 'not', 'S3'),
    finding('@tanimlar', 16, 'tutarsizlik', 'S2'),
  ],
}

describe('planRows', () => {
  it('vakalar sırasıyla, beklenen sonuç stratejiden; bulgu kendinden önceki son adımın vakasına düşer', () => {
    const rows = planRows(model)
    expect(rows.map((r) => [r.title, r.status, r.findings])).toEqual([
      ['Ana akış', 'bitti', [1, 2]],
      ['Yetki', 'suruyor', [0]],
      ['Temizlik', 'bekliyor', []],
    ])
    expect(rows[1]!.expected).toBe('403 dönmeli — workflow kuralı')
    expect(rows[0]!.expected).toBe('')
  })

  it('beklenen sonuç dayanağı içermez: dayanak satırı vakanın hedefinde kalır, panelde gösterilmez', () => {
    const rows = planRows({
      ...model,
      strategy: {
        items: [
          {
            title: 'Yetki',
            goal: 'Başkasının cevabını yazmayı dene\nBeklenen: 403 dönmeli\nDayanak: workflow_get anket, checkOwner adımı',
          },
        ],
      } as unknown as MonitorModel['strategy'],
    })
    expect(rows[1]!.expected).toBe('403 dönmeli')
  })
})
