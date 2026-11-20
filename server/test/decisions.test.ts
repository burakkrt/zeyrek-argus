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

describe('değerlendirme kararları', () => {
  it('"bilerek böyle" yeniden görülünce bastırılır; tanım değişince gözden geçirilmek üzere yeniden açılır', () => {
    const { issues, db, memory } = h.ctx
    const first = issues.record(sighting({ key: 'yz:kabul', page: 'egt-kabul', studioPrint: 'k1' }))
    db.prepare(
      `insert into page_prints (project, application, environment, page, run_id, ui, api, studio, at)
       values ('qm', 'web', 'development', 'egt-kabul', ?, 'u', 'a', 'k1', '2999-01-02T00:00:00.000Z')`,
    ).run(runId)
    issues.decide(first.issue.id, 'kabul-edildi', 'Ayşe', null)
    expect(memory.decision(app, 'yz:kabul')?.status).toBe('kabul-edildi')
    const again = issues.record(sighting({ key: 'yz:kabul', page: 'egt-kabul', studioPrint: 'k1' }))
    expect(again.outcome).toBe('bastirildi')
    expect(again.reason).toBe('İnsan kararı: bilerek böyle')
    expect(issues.record(sighting({ key: 'yz:kabul', page: 'egt-kabul', studioPrint: 'k2' })).outcome).toBe(
      'yeniden-acildi',
    )
  })

  it('"bulgu değil" nedeni saklanır; yanlış gözlem ve kapsam dışı öğrenmeye girmez, davranış doğru nedeniyle girer', () => {
    const { issues, memory } = h.ctx
    const wrong = issues.record(sighting({ key: 'yz:yukleniyordu' }))
    const right = issues.record(sighting({ key: 'yz:bos-alan-dogru' }))
    const out = issues.record(sighting({ key: 'yz:kapsam-disi' }))
    issues.decide(wrong.issue.id, 'bulgu-degil', 'Ayşe', null, 'yanlis-gozlem')
    issues.decide(right.issue.id, 'bulgu-degil', 'Ayşe', null, 'davranis-dogru')
    issues.decide(out.issue.id, 'bulgu-degil', 'Ayşe', null, 'kapsam-disi')
    expect(issues.detail(wrong.issue.id).reason).toBe('yanlis-gozlem')
    expect(memory.decision(app, 'yz:bos-alan-dogru')?.reason).toBe('davranis-dogru')
    const learned = issues.decisionsSince(app, null).map((d) => [d.key, d.reason])
    expect(learned).toContainEqual(['yz:bos-alan-dogru', 'davranis-dogru'])
    expect(learned.map(([k]) => k)).not.toContain('yz:yukleniyordu')
    expect(learned.map(([k]) => k)).not.toContain('yz:kapsam-disi')
    // Başka karara geçince neden silinir.
    issues.decide(wrong.issue.id, 'duzeltilecek', 'Ayşe', null)
    expect(issues.detail(wrong.issue.id).reason).toBeNull()
  })

  it('düzenlenen düzeltme kartın düzeltmesi olur ve karar dosyasına yazılır; boş metin önerilene döner', () => {
    const { issues, memory } = h.ctx
    const found = issues.record(sighting({ key: 'yz:cozum' }))
    const edited = issues.editFix(found.issue.id, 'Toplamı süzülmüş satırlardan hesapla.', 'Ayşe')
    expect(edited.fix).toBe('Toplamı süzülmüş satırlardan hesapla.')
    expect(edited.fixEdited).toBe(true)
    expect(memory.decision(app, 'yz:cozum')?.fixOverride).toBe('Toplamı süzülmüş satırlardan hesapla.')
    const reverted = issues.editFix(found.issue.id, '  ', 'Ayşe')
    expect(reverted.fixEdited).toBe(false)
  })
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
