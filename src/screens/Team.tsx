/**
 * The Team section on a lead's profile (R-ACC-5): their members, with drill-down into
 * any member's activity and progress. This is the notable departure from stock
 * HubSpot — a sales manager with a scoped view of their own reports' work.
 */
import { useMemo, useState } from 'react'
import { useScopedData, salespersonRows, userById, contactById } from '@/data/selectors'
import { activeMemberIds, primaryTeamId } from '@/data/scope'
import { averageLoggingDelayDays, contactName, dealNgnMinor, isWon, loggingDelayDays } from '@/data/derive'
import { formatMoneyCompact, formatMoneyWhole } from '@/data/money'
import { formatDate, pluralize, relativeTime } from '@/lib/format'
import {
  Avatar,
  Badge,
  Card,
  Drawer,
  EmptyState,
  Note,
  PageHeader,
  SectionHeading,
  StatTile,
  cx,
} from '@/components/ui'
import { NoAccess } from '@/components/AppShell'
import { HBarChart } from '@/components/charts'
import {
  ActivityTypeBadge,
  DelayBadge,
  RoleBadge,
  StageBadge,
  delayStatusColor,
  delayStatusLabel,
} from '@/components/domain'

export default function Team() {
  const { db, scope, activities, deals } = useScopedData()
  const [memberId, setMemberId] = useState<string | null>(null)

  if (scope.viewer.role === 'salesperson') {
    return <NoAccess what="Team performance" />
  }

  const teams = scope.isCompanyWide
    ? db.teams
    : db.teams.filter((t) => scope.ledTeamIds.includes(t.id))

  const rows = salespersonRows(db, scope)

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title={scope.isCompanyWide ? 'All teams' : 'Your team'}
        description={
          scope.isCompanyWide
            ? 'Every sales team in the company.'
            : 'The people who report to you, with their pipeline and activity in one place.'
        }
      />

      {teams.length === 0 ? (
        <EmptyState title="You do not lead a team" />
      ) : (
        teams.map((team) => {
          const memberIds = activeMemberIds(db, team.id)
          const members = db.users.filter((u) => memberIds.includes(u.id) && u.role !== 'super_admin')
          const memberRows = rows.filter((r) => memberIds.includes(r.user.id))
          const teamActivities = activities.filter((a) => memberIds.includes(a.user_id))
          const teamDeals = deals.filter((d) => memberIds.includes(d.owner_user_id))
          const teamWon = teamDeals.filter((d) => isWon(db, d))
          const lead = userById(db, team.lead_user_id)

          return (
            <div key={team.id} className="mb-8">
              <Card className="mb-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar name={team.name} hue={team.id === 't-mainland' ? 165 : 28} size={44} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-xl font-semibold text-ink-900">{team.name}</h2>
                    <p className="text-[13px] text-ink-500">
                      Led by {lead?.full_name} · {pluralize(members.length, 'salesperson', 'salespeople')}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatTile
                  label="Team sold"
                  value={formatMoneyCompact(teamWon.reduce((s, d) => s + dealNgnMinor(d), 0))}
                  sub={pluralize(teamWon.length, 'closed deal')}
                  tone="won"
                />
                <StatTile
                  label="Open pipeline"
                  value={formatMoneyCompact(
                    teamDeals
                      .filter((d) => {
                        const s = db.pipeline_stages.find((x) => x.id === d.stage_id)
                        return s && !s.is_won && !s.is_lost
                      })
                      .reduce((s, d) => s + dealNgnMinor(d), 0),
                  )}
                  sub="Live deals across the team"
                  tone="brand"
                />
                <StatTile
                  label="Activity — 30 days"
                  value={teamActivities.filter((a) => new Date(a.occurred_at).getTime() > Date.now() - 30 * 864e5).length}
                  sub="Inspections, meetings and conversations"
                />
                <StatTile
                  label="Average logging delay"
                  value={`${averageLoggingDelayDays(teamActivities).toFixed(1)}d`}
                  tone={averageLoggingDelayDays(teamActivities) < 2 ? 'won' : 'warn'}
                  sub="Across the whole team"
                />
              </div>

              <Card className="mb-3">
                <SectionHeading
                  title="Sold, by member"
                  subtitle="Select a member below to see their pipeline and activity."
                />
                <HBarChart
                  data={memberRows.map((r) => ({
                    key: r.user.id,
                    label: r.user.full_name,
                    labelText: r.user.full_name,
                    value: r.soldNgnMinor,
                    display: formatMoneyCompact(r.soldNgnMinor),
                    meta: `${pluralize(r.closedCount, 'deal')} · ${pluralize(r.activityCount, 'activity record', 'activity records')}`,
                    onClick: () => setMemberId(r.user.id),
                  }))}
                  emptyLabel="No sales recorded for this team yet"
                />
              </Card>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {memberRows.map((r) => {
                  const isMultiTeam =
                    db.team_memberships.filter((m) => m.user_id === r.user.id && m.left_at === null).length > 1
                  const primary = primaryTeamId(db, r.user.id)
                  return (
                    <button
                      key={r.user.id}
                      onClick={() => setMemberId(r.user.id)}
                      className="rounded-[--radius-card] border border-ink-100 bg-surface p-4 text-left transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={r.user.full_name} hue={r.user.hue} size={38} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold text-ink-900">
                            {r.user.full_name}
                          </div>
                          <div className="truncate text-[12px] text-ink-400">{r.user.title}</div>
                        </div>
                        <RoleBadge role={r.user.role} />
                      </div>

                      {isMultiTeam && (
                        <div className="mt-2">
                          <Badge tone="gold" title="Belongs to more than one team; counted once, under the primary">
                            Also on another team · rolls up to{' '}
                            {db.teams.find((t) => t.id === primary)?.name}
                          </Badge>
                        </div>
                      )}

                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <dt className="text-[11px] text-ink-400">Sold</dt>
                          <dd className="tnum text-[14px] font-semibold text-ink-900">
                            {formatMoneyCompact(r.soldNgnMinor)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-ink-400">Open</dt>
                          <dd className="tnum text-[14px] font-semibold text-ink-800">
                            {formatMoneyCompact(r.openNgnMinor)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-ink-400">Activity</dt>
                          <dd className="tnum text-[14px] font-semibold text-ink-800">{r.activityCount}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-ink-400">Logging delay</dt>
                          <dd
                            className="tnum text-[14px] font-semibold"
                            style={{ color: delayStatusColor(r.avgLoggingDelayDays) }}
                          >
                            {r.avgLoggingDelayDays.toFixed(1)}d
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-2.5 border-t border-ink-100 pt-2 text-[11.5px] text-ink-400">
                        {delayStatusLabel(r.avgLoggingDelayDays)} · view their work →
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      <MemberDrawer userId={memberId} onClose={() => setMemberId(null)} />
    </>
  )
}

/** Drill-down into one member's activity and progress. */
function MemberDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { db, scope } = useScopedData()
  const user = userId ? userById(db, userId) : undefined

  const data = useMemo(() => {
    if (!user) return null
    const activities = db.activities
      .filter((a) => a.user_id === user.id)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    const deals = db.deals.filter((d) => d.owner_user_id === user.id)
    const contacts = db.contacts.filter((c) => c.owner_user_id === user.id)
    return { activities, deals, contacts, won: deals.filter((d) => isWon(db, d)) }
  }, [db, user])

  if (!user || !data) return null
  // Belt and braces: the drawer refuses to render anyone outside the viewer's scope.
  if (!scope.userIds.has(user.id)) return null

  const avgDelay = averageLoggingDelayDays(data.activities)

  return (
    <Drawer open onClose={onClose} title={user.full_name} subtitle={user.title}>
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Sold"
          value={formatMoneyWhole(data.won.reduce((s, d) => s + dealNgnMinor(d), 0))}
          sub={pluralize(data.won.length, 'closed deal')}
          tone="won"
        />
        <StatTile label="Contacts owned" value={data.contacts.length} sub={pluralize(data.deals.length, 'deal')} />
        <StatTile label="Activity records" value={data.activities.length} sub="All time" />
        <StatTile
          label="Average logging delay"
          value={`${avgDelay.toFixed(1)}d`}
          tone={avgDelay < 1 ? 'won' : avgDelay < 3 ? 'warn' : 'lost'}
          sub={delayStatusLabel(avgDelay)}
        />
      </div>

      <Card className="mt-4">
        <h3 className="mb-2 text-[13px] font-semibold text-ink-800">Open deals</h3>
        {data.deals.filter((d) => {
          const s = db.pipeline_stages.find((x) => x.id === d.stage_id)
          return s && !s.is_won && !s.is_lost
        }).length === 0 ? (
          <EmptyState title="No open deals" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {data.deals
              .filter((d) => {
                const s = db.pipeline_stages.find((x) => x.id === d.stage_id)
                return s && !s.is_won && !s.is_lost
              })
              .sort((a, b) => dealNgnMinor(b) - dealNgnMinor(a))
              .slice(0, 8)
              .map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-800">
                    {contactName(contactById(db, d.contact_id))}
                  </span>
                  <StageBadge db={db} stageId={d.stage_id} />
                  <span className="tnum text-[13px] font-medium text-ink-900">
                    {formatMoneyCompact(dealNgnMinor(d))}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      <Card className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink-800">Recent activity, with the notes</h3>
        </div>
        {data.activities.length === 0 ? (
          <EmptyState title="Nothing logged" />
        ) : (
          <ol className="relative border-l border-ink-100 pl-4">
            {data.activities.slice(0, 12).map((a) => (
              <li key={a.id} className="relative pb-3.5 last:pb-0">
                <span
                  className={cx(
                    'absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface',
                    loggingDelayDays(a) >= 5 ? 'bg-warn' : 'bg-brand-400',
                  )}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <ActivityTypeBadge type={a.type} />
                  <span className="text-[12px] text-ink-500">{formatDate(a.occurred_at)}</span>
                  <DelayBadge activity={a} compact />
                </div>
                <div className="mt-0.5 text-[12.5px] font-medium text-ink-800">
                  {contactName(contactById(db, a.contact_id))}
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-600">{a.notes}</p>
                <div className="mt-0.5 text-[11px] text-ink-400">
                  Entered {relativeTime(a.logged_at)}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="mt-3">
        <Note tone="neutral">
          Only members of the teams you lead appear here.
        </Note>
      </div>
    </Drawer>
  )
}
