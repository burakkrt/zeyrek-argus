import type { AppRef, Proposal } from '@argus/shared'
import { json, newId, now, type Database } from '../db/database.ts'

interface ProposalRow {
  id: string
  project: string
  application: string
  action: Proposal['action']
  rule: string
  related: string
  reason: string
  sources: string
  origin: Proposal['origin']
  status: Proposal['status']
  created_at: string
}

const toProposal = (r: ProposalRow): Proposal => ({
  id: r.id,
  project: r.project,
  application: r.application,
  action: r.action,
  rule: json<Proposal['rule']>(r.rule, { id: '', scope: 'uygulama', type: 'sorun', text: '' }),
  related: json<string[]>(r.related, []),
  reason: r.reason,
  sources: json<string[]>(r.sources, []),
  origin: r.origin,
  status: r.status,
  createdAt: r.created_at,
})

export function saveProposal(db: Database, app: AppRef, proposal: Omit<Proposal, 'id' | 'createdAt' | 'project' | 'application'>): Proposal {
  const id = newId()
  db.prepare(
    `insert into proposals (id, project, application, action, rule, related, reason, sources, origin, status, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    app.project,
    app.application,
    proposal.action,
    JSON.stringify(proposal.rule),
    JSON.stringify(proposal.related),
    proposal.reason,
    JSON.stringify(proposal.sources),
    proposal.origin,
    proposal.status,
    now(),
  )
  return getProposal(db, id)!
}

export function getProposal(db: Database, id: string): Proposal | null {
  const row = db.prepare('select * from proposals where id = ?').get(id) as ProposalRow | undefined
  return row ? toProposal(row) : null
}

export function listProposals(db: Database, filter: { app?: AppRef; status?: Proposal['status'] } = {}): Proposal[] {
  const where: string[] = []
  const args: string[] = []
  if (filter.app) {
    where.push('project = ? and application = ?')
    args.push(filter.app.project, filter.app.application)
  }
  if (filter.status) {
    where.push('status = ?')
    args.push(filter.status)
  }
  const sql = `select * from proposals ${where.length ? `where ${where.join(' and ')}` : ''} order by created_at desc limit 300`
  return (db.prepare(sql).all(...args) as unknown as ProposalRow[]).map(toProposal)
}

export function setProposalStatus(db: Database, id: string, status: Proposal['status']): void {
  db.prepare('update proposals set status = ? where id = ?').run(status, id)
}
