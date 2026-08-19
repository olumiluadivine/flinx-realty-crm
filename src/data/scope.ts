/**
 * THE visibility rule (R-ACC-8).
 *
 * Not a table — a predicate applied to every contact / deal / activity query. It lives
 * here and only here. No screen, selector or report re-implements it; they all call
 * `visibleUserIds` or one of the filters built on it. This is the requirement most
 * likely to leak if it is hand-rolled at each query site, and a leak means one
 * salesperson reading another's book of business.
 *
 *   salesperson  → rows where they are the owner
 *   team_lead    → rows owned by any member of a team they lead (respecting left_at)
 *   super_admin  → everything
 */
import type { Activity, Contact, Database, Deal, Id, User } from './schema'

export interface Scope {
  viewer: User
  /** Owner ids this viewer may see. */
  userIds: Set<Id>
  /** Teams this viewer leads — empty for salespeople and super admins. */
  ledTeamIds: Id[]
  /** True when the viewer sees company-wide data. */
  isCompanyWide: boolean
  /** Human-readable description, shown in the scope banner on every screen. */
  label: string
}

/** Members of a team as at now — a membership that has ended no longer grants sight. */
export function activeMemberIds(db: Database, teamId: Id, asOf = new Date()): Id[] {
  return db.team_memberships
    .filter(
      (m) =>
        m.team_id === teamId &&
        new Date(m.joined_at) <= asOf &&
        (m.left_at === null || new Date(m.left_at) > asOf),
    )
    .map((m) => m.user_id)
}

export function teamsLedBy(db: Database, userId: Id): Id[] {
  return db.teams.filter((t) => t.lead_user_id === userId).map((t) => t.id)
}

/** The single source of truth for "whose rows can this person see". */
export function buildScope(db: Database, viewer: User): Scope {
  if (viewer.role === 'super_admin') {
    return {
      viewer,
      userIds: new Set(db.users.map((u) => u.id)),
      ledTeamIds: [],
      isCompanyWide: true,
      label: 'Company-wide — every team, every salesperson',
    }
  }

  if (viewer.role === 'team_lead') {
    const ledTeamIds = teamsLedBy(db, viewer.id)
    const ids = new Set<Id>([viewer.id])
    for (const teamId of ledTeamIds) for (const id of activeMemberIds(db, teamId)) ids.add(id)
    const teamNames = ledTeamIds
      .map((id) => db.teams.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(' · ')
    return {
      viewer,
      userIds: ids,
      ledTeamIds,
      isCompanyWide: false,
      label: `${teamNames || 'No team'} — ${ids.size - 1} salespeople and your own records`,
    }
  }

  return {
    viewer,
    userIds: new Set([viewer.id]),
    ledTeamIds: [],
    isCompanyWide: false,
    label: 'Your own contacts, deals and activity only',
  }
}

export function canSeeUser(scope: Scope, userId: Id): boolean {
  return scope.userIds.has(userId)
}

export function scopeContacts(scope: Scope, contacts: Contact[]): Contact[] {
  return contacts.filter((c) => scope.userIds.has(c.owner_user_id))
}

export function scopeDeals(scope: Scope, deals: Deal[]): Deal[] {
  return deals.filter((d) => scope.userIds.has(d.owner_user_id))
}

export function scopeActivities(scope: Scope, activities: Activity[]): Activity[] {
  return activities.filter((a) => scope.userIds.has(a.user_id))
}

/**
 * Salespeople whose numbers this viewer may see, in a stable order.
 * Reports iterate this rather than `db.users` so a lead's leaderboard cannot
 * accidentally include another team.
 */
export function scopedSalespeople(db: Database, scope: Scope): User[] {
  return db.users
    .filter((u) => scope.userIds.has(u.id) && u.is_active)
    .filter((u) => u.role !== 'super_admin')
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
}

/** Whether a viewer may open a given record's detail page. */
export function canOpenContact(scope: Scope, contact: Contact | undefined): boolean {
  return !!contact && scope.userIds.has(contact.owner_user_id)
}

/**
 * A salesperson's primary team — rollups sum over primary membership so a
 * multi-team salesperson counts once (R-REP-5).
 */
export function primaryTeamId(db: Database, userId: Id): Id | null {
  const primary = db.team_memberships.find(
    (m) => m.user_id === userId && m.is_primary && m.left_at === null,
  )
  if (primary) return primary.team_id
  const any = db.team_memberships.find((m) => m.user_id === userId && m.left_at === null)
  return any?.team_id ?? null
}
