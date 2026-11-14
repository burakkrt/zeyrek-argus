import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.ts'
import { createRun, getRun, nextRunCode } from './runs.ts'

const input = {
  project: 'qm',
  application: 'web',
  environment: 'development',
  pages: ['egt-liste'],
  options: { maxTasks: 1, maxSteps: 3 },
}

describe('koşu kodu', () => {
  it('koşu oluşturulurken yıl içinde sıralı kod alır; önizleme kodu ayırmaz', () => {
    const db = openDatabase(':memory:')
    const year = new Date().toISOString().slice(0, 4)
    // Önizleme kaç kez okunursa okunsun (sayfa yenileme) sıra ilerlemez.
    expect(nextRunCode(db)).toBe(`KOS-${year}-0001`)
    expect(nextRunCode(db)).toBe(`KOS-${year}-0001`)
    const first = createRun(db, input)
    const second = createRun(db, input)
    expect([first.code, second.code]).toEqual([`KOS-${year}-0001`, `KOS-${year}-0002`])
    expect(getRun(db, second.id)?.code).toBe(`KOS-${year}-0002`)
    expect(nextRunCode(db)).toBe(`KOS-${year}-0003`)
  })

  it('yeni yılda sıra 1’den başlar; dört haneyi aşan sıra da doğru artar', () => {
    const db = openDatabase(':memory:')
    db.prepare(
      `insert into runs (id, code, project, application, environment, pages, options, status, usage, created_at)
       values ('a', 'KOS-2026-9999', 'qm', 'web', 'development', '[]', '{}', 'bitti', '{}', '2026-12-31T23:00:00Z')`,
    ).run()
    expect(nextRunCode(db, '2026-12-31T23:30:00Z')).toBe('KOS-2026-10000')
    expect(nextRunCode(db, '2027-01-01T00:00:00Z')).toBe('KOS-2027-0001')
  })
})
