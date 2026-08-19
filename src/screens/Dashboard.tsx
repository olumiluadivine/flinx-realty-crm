/**
 * The landing screen, and the same component for all three roles.
 *
 * There is no "manager dashboard" and "rep dashboard" — there is one dashboard whose
 * contents come from the viewer's scope. That is the point of R-ACC-8 made visible:
 * the screen never asks who you are in order to decide what to query.
 */
import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useScopedData } from '@/data/selectors'
import {
  daysInCurrentStage,
  dealNgnMinor,
  detectBackfillBursts,
  isOpen,
  isWon,
  loggingDelayDays,
} from '@/data/derive'
import { salespersonRows, teamRows, activityByWeek, contactById, propertyById, userById } from '@/data/selectors'
import { formatMoneyCompact, formatMoneyWhole } from '@/data/money'
import { formatDateShort, pluralize, relativeTime } from '@/lib/format'
import { Badge, Button, Card, PageHeader, SectionHeading, StatTile, EmptyState } from '@/components/ui'
import { CATEGORICAL, ColumnChart, HBarChart } from '@/components/charts'
import {
  ActivityTypeBadge,
  DelayBadge,
  UserChip,
  delayStatusColor,
  delayStatusLabel,
} from '@/components/domain'
import { contactName } from '@/data/derive'

export default function Dashboard() {
  const { db, scope, contacts, deals, activities } = useScopedData()
  const viewer = scope.viewer
  const isRep = viewer.role === 'salesperson'

  const now = Date.now()
  const last30 = now - 30 * 864e5
  const last90 = now - 90 * 864e5

  const won = deals.filter((d) => isWon(db, d))
  const open = deals.filter((d) => isOpen(db, d))
  const wonRecent = won.filter((d) => d.closed_at && new Date(d.closed_at).getTime() >= last90)
  const activities30 = activities.filter((a) => new Date(a.occurred_at).getTime() >= last30)
  const inspections30 = activities30.filter((a) => a.type === 'inspection').length
  const meetings30 = activities30.filter((a) => a.type === 'meeting').length

  const rows = useMemo(() => salespersonRows(db, scope), [db, scope])
  const teams = useMemo(() => teamRows(db, scope), [db, scope])
  const weekly = useMemo(() => activityByWeek(activities, 8), [activities])

  /** Open deals nobody has touched in three weeks — the follow-up list. */
  const stalled = useMemo(
    () =>
      open
        .map((d) => ({ deal: d, days: daysInCurrentStage(db, d) }))
        .filter((x) => x.days > 21)
        .sort((a, b) => b.days - a.days)
        .slice(0, 6),
    [db, open],
  )

  /** Back-filling, per person, within scope. */
  const backfills = useMemo(() => {
    const out: { userId: string; count: number; loggedAt: string }[] = []
    for (const id of scope.userIds) {
      const bursts = detectBackfillBursts(activities.filter((a) => a.user_id === id))
      for (const b of bursts) out.push({ userId: id, count: b.count, loggedAt: b.loggedAt })
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 3)
  }, [activities, scope.userIds])

  const recent = useMemo(
    () => [...activities].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()).slice(0, 8),
    [activities],
  )

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={isRep ? `Good day, ${viewer.full_name.split(' ')[0]}` : `${viewer.full_name.split(' ')[0]}’s desk`}
        description={
          isRep
            ? 'Your contacts, your pipeline and your activity this month.'
            : scope.isCompanyWide
              ? 'Company-wide performance across every team.'
              : `Performance across ${scope.label.split(' — ')[0]}.`
        }
        actions={
          <>
            <Button size="sm" onClick={() => (window.location.hash = '#/activities?log=1')}>
              Log activity
            </Button>
            <Link to="/reports">
              <Button size="sm" variant="primary">
                Full reports
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sold — last 90 days"
          value={formatMoneyCompact(wonRecent.reduce((s, d) => s + dealNgnMinor(d), 0))}
          sub={`${pluralize(wonRecent.length, 'deal')} closed · ${formatMoneyCompact(won.reduce((s, d) => s + dealNgnMinor(d), 0))} all time`}
          tone="won"
        />
        <StatTile
          label="Open pipeline"
          value={formatMoneyCompact(open.reduce((s, d) => s + dealNgnMinor(d), 0))}
          sub={`${pluralize(open.length, 'live deal')} across ${pluralize(new Set(open.map((d) => d.stage_id)).size, 'stage')}`}
          tone="brand"
        />
        <StatTile
          label="Activity — last 30 days"
          value={activities30.length.toLocaleString('en-NG')}
          sub={`${inspections30} inspections · ${meetings30} meetings`}
        />
        <StatTile
          label={isRep ? 'Contacts you own' : 'Contacts in scope'}
          value={contacts.length.toLocaleString('en-NG')}
          sub={`${contacts.filter((c) => new Date(c.created_at).getTime() >= last30).length} added in the last 30 days`}
        />
      </div>

      {backfills.length > 0 && !isRep && (
        <Card className="mt-4 border-warn/25 bg-warn-soft">
          <div className="flex flex-wrap items-start gap-3">
            <span aria-hidden className="text-lg leading-none text-warn">
              ⚠
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-warn">Activity recorded in bulk</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-warn/90">
                Several records entered in one sitting, days or weeks after the work took place.
                Worth a conversation rather than a conclusion.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {backfills.map((b, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-[12.5px] text-warn">
                    <UserChip user={userById(db, b.userId)} size={20} />
                    <span>
                      {pluralize(b.count, 'record')} entered together on {formatDateShort(b.loggedAt)}
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/reports" className="mt-2.5 inline-block text-[12.5px] font-medium underline">
                See logging delay per salesperson →
              </Link>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeading
            title={isRep ? 'Your activity, week by week' : 'Team activity, week by week'}
            subtitle="Inspections, meetings and conversations, by the week they took place."
          />
          <ColumnChart
            data={weekly.map((w) => ({
              label: w.label,
              values: { inspections: w.inspections, meetings: w.meetings, calls: w.calls },
            }))}
            series={[
              { key: 'inspections', label: 'Inspections', color: CATEGORICAL[0] },
              { key: 'meetings', label: 'Meetings', color: CATEGORICAL[1] },
              { key: 'calls', label: 'Calls & WhatsApp', color: CATEGORICAL[2] },
            ]}
            format={(n) => String(n)}
          />
        </Card>

        <Card>
          <SectionHeading
            title={isRep ? 'Your closed business' : 'Sold, by salesperson'}
            subtitle="Closed deals, at full contracted value."
          />
          <HBarChart
            data={rows
              .filter((r) => r.soldNgnMinor > 0)
              .slice(0, 7)
              .map((r) => ({
                key: r.user.id,
                label: r.user.full_name,
                labelText: r.user.full_name,
                value: r.soldNgnMinor,
                display: formatMoneyCompact(r.soldNgnMinor),
                meta: `${pluralize(r.closedCount, 'deal')} · ${r.teamName}`,
                tooltip: (
                  <div>
                    <div className="font-medium text-ink-900">{r.user.full_name}</div>
                    <div>{formatMoneyWhole(r.soldNgnMinor)}</div>
                    <div className="text-ink-400">{pluralize(r.closedCount, 'closed deal')}</div>
                  </div>
                ),
              }))}
            emptyLabel="No closed deals yet"
          />
        </Card>
      </div>

      {!isRep && teams.length > 1 && (
        <Card className="mt-4">
          <SectionHeading
            title="Team comparison"
            subtitle="Someone on two teams is counted once, under their primary team."
          />
          <HBarChart
            data={teams.map((t) => ({
              key: t.teamId,
              label: `${t.name} · led by ${t.leadName}`,
              labelText: t.name,
              value: t.soldNgnMinor,
              display: formatMoneyCompact(t.soldNgnMinor),
              meta: `${pluralize(t.memberCount, 'salesperson', 'salespeople')} · ${pluralize(t.closedCount, 'deal')} closed · ${formatMoneyCompact(t.openNgnMinor)} open`,
            }))}
          />
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Gone quiet"
            subtitle="Open deals that have not moved stage in over three weeks."
            action={
              <Link to="/deals" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                All deals →
              </Link>
            }
          />
          {stalled.length === 0 ? (
            <EmptyState title="Nothing stalled" description="Every open deal has moved in the last three weeks." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {stalled.map(({ deal, days }) => {
                const contact = contactById(db, deal.contact_id)
                const property = propertyById(db, deal.property_id)
                return (
                  <li key={deal.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink-800">
                        {contactName(contact)}
                      </div>
                      <div className="truncate text-[12px] text-ink-400">
                        {property?.estate ?? 'No unit selected'} ·{' '}
                        {db.pipeline_stages.find((s) => s.id === deal.stage_id)?.name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tnum text-[13px] font-medium text-ink-800">
                        {formatMoneyCompact(dealNgnMinor(deal))}
                      </div>
                      <Badge tone={days > 45 ? 'lost' : 'warn'}>{Math.round(days)} days</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Latest activity"
            subtitle="Newest first."
            action={
              <Link to="/activities" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                All activity →
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState title="Nothing logged yet" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {recent.map((a) => (
                <li key={a.id} className="py-2.5 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ActivityTypeBadge type={a.type} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink-800">
                      {contactName(contactById(db, a.contact_id))}
                    </span>
                    <span className="text-[11.5px] text-ink-400">{relativeTime(a.occurred_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-500">{a.notes}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {!isRep && <UserChip user={userById(db, a.user_id)} size={18} />}
                    <DelayBadge activity={a} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {!isRep && rows.length > 1 && (
        <Card className="mt-4">
          <SectionHeading
            title="How promptly work gets recorded"
            subtitle="Average gap between an activity happening and being recorded."
          />
          <HBarChart
            data={[...rows]
              .filter((r) => r.activityCount > 0)
              .sort((a, b) => b.avgLoggingDelayDays - a.avgLoggingDelayDays)
              .map((r) => ({
                key: r.user.id,
                label: r.user.full_name,
                labelText: r.user.full_name,
                value: r.avgLoggingDelayDays,
                display: `${r.avgLoggingDelayDays.toFixed(1)} days`,
                color: delayStatusColor(r.avgLoggingDelayDays),
                meta: `${delayStatusLabel(r.avgLoggingDelayDays)} · ${pluralize(r.activityCount, 'record')}`,
              }))}
          />

        </Card>
      )}

      {isRep && (
        <Card className="mt-4">
          <SectionHeading title="Your late entries" subtitle="Records entered five or more days after the work." />
          {activities.filter((a) => loggingDelayDays(a) >= 5).length === 0 ? (
            <EmptyState
              title="Everything logged promptly"
              description="All your records went in within a few days of the work taking place."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {activities
                .filter((a) => loggingDelayDays(a) >= 5)
                .sort((a, b) => loggingDelayDays(b) - loggingDelayDays(a))
                .slice(0, 5)
                .map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 first:pt-0">
                    <ActivityTypeBadge type={a.type} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-800">
                      {contactName(contactById(db, a.contact_id))}
                    </span>
                    <span className="text-[11.5px] text-ink-400">{formatDateShort(a.occurred_at)}</span>
                    <DelayBadge activity={a} />
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

    </>
  )
}
