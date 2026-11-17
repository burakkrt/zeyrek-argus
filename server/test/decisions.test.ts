import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { OccurrenceInput } from '../src/issues/issues.ts'
import { bumpMisled, ruleStats } from '../src/memory/stats.ts'
import { startHarness, type Harness } from './support/harness.ts'

const app = { project: 'qm', application: 'web' }

let h: Harness
let runId: string

const sighting = (over: Partial<OccurrenceInput>): OccurrenceInput => ({
  app,
  runId,
  page: 'egt-liste',
  phase: 'gorev',
  key: 'yz:x',
  title: 'X',
  kind: 'kesin',
  source: 'yz',
  scenario: 's',
  expected: 'e',
  observed: 'o',
  quote: null,
  shot: null,
  box: null,
  rules: [],
  verified: true,
  suppressedByRule: null,
  ...over,
})

beforeAll(async () => {
  h = await startHarness({
    plan: () => ({ ozet: 'Sayfa', gorevler: [{ baslik: 'Bakış', amac: 'Bak' }] }),
    task: () => ({ name: 'gorevi_bitir', input: { ozet: 'Bakıldı.' } }),
  })
  runId = h.ctx.runs.create({
    ...app,
    environment: 'development',
    pages: ['egt-liste'],
    options: { maxTasks: 1, maxSteps: 3 },
  }).id
  await h.waitFor(runId)
})

afterAll(async () => {
  await h.close()
})

describe('karar hafızası', () => {
  it('"bulgu değil" kararı tanım izine bağlanır; tanım değişince karar gözden geçirilmek üzere sorun yeniden açılır', () => {
    const { issues, db, memory } = h.ctx
    const first = issues.record(sighting({ key: 'yz:iz', rules: ['kural-iz'], studioPrint: 'v1' }))
    db.prepare(
      `insert into page_prints (project, application, environment, page, run_id, ui, api, studio, at)
       values ('qm', 'web', 'development', 'egt-liste', ?, 'u', 'a', 'v1', '2999-01-01T00:00:00.000Z')`,
    ).run(runId)
    issues.decide(first.issue.id, 'bulgu-degil', 'Ayşe', 'Tasarım gereği')

    expect(memory.decision(app, 'yz:iz')?.decisionPrint).toBe('egt-liste:v1')
    expect(ruleStats(db).get('kural-iz')?.misled).toBe(1)
    expect(issues.record(sighting({ key: 'yz:iz', studioPrint: 'v1' })).outcome).toBe('bastirildi')
    expect(issues.record(sighting({ key: 'yz:iz', page: 'baska', studioPrint: 'v9' })).outcome).toBe(
      'bastirildi',
    )

    const changed = issues.record(sighting({ key: 'yz:iz', studioPrint: 'v2' }))
    expect(changed.outcome).toBe('yeniden-acildi')
    expect(issues.detail(first.issue.id).status).toBe('acik')
  })

  it('iki kişinin zıt kararı tartışmalıdır: bastırılmaz, öğrenmeye girmez; ayrışan kişinin onayıyla çözülür', () => {
    const { issues, learner } = h.ctx
    const { issue } = issues.record(sighting({ key: 'yz:tartisma', page: 'p1' }))
    issues.decide(issue.id, 'duzeltilecek', 'Ayşe', null)
    const before = learner.pendingDecisions(app)
    issues.decide(issue.id, 'bulgu-degil', 'Mehmet', 'Bence değil')

    expect(issues.detail(issue.id).contested).toBe(true)
    expect(learner.pendingDecisions(app)).toBe(before - 1)
    expect(issues.record(sighting({ key: 'yz:tartisma', page: 'p2' })).outcome).toBe('tekrar')

    issues.decide(issue.id, 'bulgu-degil', 'Mehmet', null)
    expect(issues.detail(issue.id).contested).toBe(true)
    issues.decide(issue.id, 'bulgu-degil', 'Ayşe', null)
    expect(issues.detail(issue.id).contested).toBe(false)
    expect(issues.record(sighting({ key: 'yz:tartisma', page: 'p3' })).outcome).toBe('bastirildi')
  })

  it('bastırdığı sorun gerçek çıkan "sorun sayma" kuralı yanılttı sayılır ve sorun görünür olur', () => {
    const { issues, db } = h.ctx
    const { issue } = issues.record(sighting({ key: 'yz:bastirilan', suppressedByRule: 'kural-bastir' }))
    issues.decide(issue.id, 'duzeltilecek', 'Ayşe', null)

    expect(ruleStats(db).get('kural-bastir')?.misled).toBe(1)
    expect(issues.list({ app }).some((i) => i.key === 'yz:bastirilan')).toBe(true)
  })
})

describe('kural bakımı', () => {
  it('iki kez yanıltan kural emekliye önerilir', () => {
    const { memory, learner, db } = h.ctx
    memory.writeRule({
      id: 'kural-yaniltan',
      scope: 'uygulama',
      type: 'sorun',
      state: 'onayli',
      text: 'Yanıltan kural.',
      sources: [],
      author: 'Ayşe',
      date: '2026-11-16',
      app,
    })
    bumpMisled(db, ['kural-yaniltan'])
    expect(learner.hygiene(app, 'Ayşe').some((p) => p.rule.id === 'kural-yaniltan')).toBe(false)
    bumpMisled(db, ['kural-yaniltan'])
    const proposal = learner.hygiene(app, 'Ayşe').find((p) => p.rule.id === 'kural-yaniltan')
    expect(proposal?.action).toBe('emekli')
    expect(proposal?.status).toBe('bekliyor')
  })
})
