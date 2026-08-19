/**
 * The read layer. Every screen goes through here, and everything here goes through
 * `buildScope` — which is how R-ACC-8 stays true as the app grows: there is no way to
 * read a list of contacts, deals or activities without the visibility rule applying.
 */
import { useMemo } from 'react'
import {
  averageLoggingDelayDays,
  dealNgnMinor,
  isLost,
  isOpen,
  isWon,
  loggingDelayDays,
  outstandingNgnMinor,
  overdueSchedule,
} from './derive'
import { buildScope, primaryTeamId, scopeActivities, scopeContacts, scopeDeals, type Scope } from './scope'
import { useDb, useViewer } from './store'
import type { Activity, Contact, Database, Deal, Id, Property, User } from './schema'

export function useScope(): Scope {
  const db = useDb()
  const viewer = useViewer()
  return useMemo(() => buildScope(db, viewer), [db, viewer])
}

export function useScopedData() {
  const db = useDb()
  const scope = useScope()
  return useMemo(
    () => ({
      db,
      scope,
      contacts: scopeContacts(scope, db.contacts),
      deals: scopeDeals(scope, db.deals),
      activities: scopeActivities(scope, db.activities),
    }),
    [db, scope],
  )
}

/* ------------------------------ lookup helpers ----------------------------- */

export function userById(db: Database, id: Id | null | undefined): User | undefined {
  return id ? db.users.find((u) => u.id === id) : undefined
}

export function userName(db: Database, id: Id | null | undefined): string {
  return userById(db, id)?.full_name ?? '—'
}

export function contactById(db: Database, id: Id | null | undefined): Contact | undefined {
  return id ? db.contacts.find((c) => c.id === id) : undefined
}

export function propertyById(db: Database, id: Id | null | undefined): Property | undefined {
  return id ? db.properties.find((p) => p.id === id) : undefined
}

export function dealById(db: Database, id: Id | null | undefined): Deal | undefined {
  return id ? db.deals.find((d) => d.id === id) : undefined
}

export function stageName(db: Database, id: Id | null | undefined): string {
  return db.pipeline_stages.find((s) => s.id === id)?.name ?? '—'
}

export function subStatusName(db: Database, id: Id | null | undefined): string | null {
  return db.pipeline_sub_statuses.find((s) => s.id === id)?.name ?? null
}

export function channelsFor(db: Database, contactId: Id) {
  return db.contact_channels.filter((c) => c.contact_id === contactId)
}

export function primaryPhone(db: Database, contactId: Id): string | null {
  const channels = channelsFor(db, contactId).filter((c) => c.kind === 'phone' || c.kind === 'whatsapp')
  return (channels.find((c) => c.is_primary) ?? channels[0])?.value_normalized ?? null
}

export function primaryEmail(db: Database, contactId: Id): string | null {
  const channels = channelsFor(db, contactId).filter((c) => c.kind === 'email')
  return (channels.find((c) => c.is_primary) ?? channels[0])?.value ?? null
}

export function activitiesForContact(db: Database, contactId: Id): Activity[] {
  return db.activities
    .filter((a) => a.contact_id === contactId)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
}

export function dealsForContact(db: Database, contactId: Id): Deal[] {
  return db.deals
    .filter((d) => d.contact_id === contactId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

/* ------------------------------- report rows ------------------------------- */

export interface SalespersonRow {
  user: User
  teamId: Id | null
  teamName: string
  closedCount: number
  soldNgnMinor: number
  openCount: number
  openNgnMinor: number
  lostCount: number
  activityCount: number
  inspections: number
  meetings: number
  calls: number
  avgLoggingDelayDays: number
  conversionRate: number
}

/**
 * One row per salesperson the viewer is allowed to see. The same function serves a
 * salesperson looking at themselves, a lead looking at their team and a super admin
 * looking at the company — the scope decides, not the screen (R-REP-7).
 */
export function salespersonRows(
  db: Database,
  scope: Scope,
  opts: { sinceDays?: number } = {},
): SalespersonRow[] {
  const since = opts.sinceDays ? Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000 : 0
  const teamName = (id: Id | null) => db.teams.find((t) => t.id === id)?.name ?? 'Unassigned'

  return db.users
    .filter((u) => scope.userIds.has(u.id) && u.role !== 'super_admin' && u.is_active)
    .map((user) => {
      const deals = db.deals.filter((d) => d.owner_user_id === user.id)
      const activities = db.activities.filter(
        (a) => a.user_id === user.id && new Date(a.occurred_at).getTime() >= since,
      )
      const won = deals.filter((d) => isWon(db, d))
      const open = deals.filter((d) => isOpen(db, d))
      const lost = deals.filter((d) => isLost(db, d))
      const decided = won.length + lost.length
      const teamId = primaryTeamId(db, user.id)

      return {
        user,
        teamId,
        teamName: teamName(teamId),
        closedCount: won.length,
        soldNgnMinor: won.reduce((sum, d) => sum + dealNgnMinor(d), 0),
        openCount: open.length,
        openNgnMinor: open.reduce((sum, d) => sum + dealNgnMinor(d), 0),
        lostCount: lost.length,
        activityCount: activities.length,
        inspections: activities.filter((a) => a.type === 'inspection').length,
        meetings: activities.filter((a) => a.type === 'meeting').length,
        calls: activities.filter((a) => a.type === 'call' || a.type === 'whatsapp').length,
        avgLoggingDelayDays: averageLoggingDelayDays(activities),
        conversionRate: decided > 0 ? won.length / decided : 0,
      }
    })
    .sort((a, b) => b.soldNgnMinor - a.soldNgnMinor)
}

export interface TeamRow {
  teamId: Id
  name: string
  leadName: string
  memberCount: number
  soldNgnMinor: number
  openNgnMinor: number
  closedCount: number
  activityCount: number
  avgLoggingDelayDays: number
}

/**
 * Team rollups. A salesperson on two teams counts once, under the team where their
 * membership is primary (R-REP-5) — that is what `primaryTeamId` is for.
 */
export function teamRows(db: Database, scope: Scope, opts: { sinceDays?: number } = {}): TeamRow[] {
  const rows = salespersonRows(db, scope, opts)
  const teams = scope.isCompanyWide
    ? db.teams
    : db.teams.filter((t) => scope.ledTeamIds.includes(t.id))

  return teams.map((team) => {
    const members = rows.filter((r) => r.teamId === team.id)
    const allActivities = db.activities.filter((a) =>
      members.some((m) => m.user.id === a.user_id),
    )
    return {
      teamId: team.id,
      name: team.name,
      leadName: userName(db, team.lead_user_id),
      memberCount: members.filter((m) => m.user.role === 'salesperson').length,
      soldNgnMinor: members.reduce((s, m) => s + m.soldNgnMinor, 0),
      openNgnMinor: members.reduce((s, m) => s + m.openNgnMinor, 0),
      closedCount: members.reduce((s, m) => s + m.closedCount, 0),
      activityCount: members.reduce((s, m) => s + m.activityCount, 0),
      avgLoggingDelayDays: averageLoggingDelayDays(allActivities),
    }
  })
}

/** Which campaign produced sales, not just clicks (R-CON-7, R-WEB-2). */
export function sourceAttribution(db: Database, contacts: Contact[], deals: Deal[]) {
  const contactById = new Map(contacts.map((c) => [c.id, c]))
  const buckets = new Map<string, { leads: number; closed: number; soldNgnMinor: number }>()

  for (const c of contacts) {
    const key = c.source_detail ?? c.source
    if (!buckets.has(key)) buckets.set(key, { leads: 0, closed: 0, soldNgnMinor: 0 })
    buckets.get(key)!.leads += 1
  }
  for (const d of deals) {
    if (!isWon(db, d)) continue
    const c = contactById.get(d.contact_id)
    if (!c) continue
    const key = c.source_detail ?? c.source
    if (!buckets.has(key)) buckets.set(key, { leads: 0, closed: 0, soldNgnMinor: 0 })
    const bucket = buckets.get(key)!
    bucket.closed += 1
    bucket.soldNgnMinor += dealNgnMinor(d)
  }

  return [...buckets.entries()]
    .map(([source, v]) => ({ source, ...v, conversion: v.leads > 0 ? v.closed / v.leads : 0 }))
    .sort((a, b) => b.soldNgnMinor - a.soldNgnMinor || b.leads - a.leads)
}

/** Stage funnel for the pipeline report. */
export function stageFunnel(db: Database, deals: Deal[]) {
  return [...db.pipeline_stages]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((stage) => {
      const inStage = deals.filter((d) => d.stage_id === stage.id)
      return {
        stage,
        count: inStage.length,
        valueNgnMinor: inStage.reduce((s, d) => s + dealNgnMinor(d), 0),
      }
    })
}

/** Activity volume bucketed by week, for the trend chart. */
export function activityByWeek(activities: Activity[], weeks: number) {
  const now = new Date()
  const out: { label: string; start: Date; total: number; inspections: number; meetings: number; calls: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    const inWeek = activities.filter((a) => {
      const t = new Date(a.occurred_at).getTime()
      return t >= start.getTime() && t < end.getTime()
    })
    out.push({
      label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      start,
      total: inWeek.length,
      inspections: inWeek.filter((a) => a.type === 'inspection').length,
      meetings: inWeek.filter((a) => a.type === 'meeting').length,
      calls: inWeek.filter((a) => a.type === 'call' || a.type === 'whatsapp').length,
    })
  }
  return out
}

/** Collections summary for the payment ledger add-on (R-PAY-7). */
export function collectionsSummary(db: Database, deals: Deal[]) {
  const won = deals.filter((d) => isWon(db, d))
  const overdue = overdueSchedule(db, won)
  const totalOutstanding = won.reduce((s, d) => s + outstandingNgnMinor(db, d), 0)
  const totalOverdue = overdue.reduce((s, o) => s + o.amountNgnMinor, 0)
  return { won, overdue, totalOutstanding, totalOverdue }
}

/** Activities logged suspiciously late, newest first — the lead's follow-up list. */
export function lateLoggedActivities(activities: Activity[], minDays = 5): Activity[] {
  return activities
    .filter((a) => loggingDelayDays(a) >= minDays)
    .sort((a, b) => loggingDelayDays(b) - loggingDelayDays(a))
}
