/**
 * Reporting.
 *
 * One set of reports, scoped by whoever is looking: a salesperson sees themselves, a
 * team lead sees their team, a super admin sees the company. Nothing here branches on
 * role — the numbers come from the scoped selectors, so the same code serves all three.
 */
import { useMemo, useState } from 'react'
import {
  activityByWeek,
  salespersonRows,
  sourceAttribution,
  stageFunnel,
  useScopedData,
  userById,
} from '@/data/selectors'
import { teamRows } from '@/data/selectors'
import { detectBackfillBursts, loggingDelayDays, dealNgnMinor, isWon } from '@/data/derive'
import { contactName } from '@/data/derive'
import { contactById } from '@/data/selectors'
import { formatMoneyCompact, formatMoneyWhole } from '@/data/money'
import { formatDate, formatDateTime, pluralize } from '@/lib/format'
import {
  Badge,
  Card,
  EmptyState,
  Note,
  PageHeader,
  SectionHeading,
  Select,
  StatTile,
  Tabs,
} from '@/components/ui'
import { CATEGORICAL, ColumnChart, FunnelChart, HBarChart } from '@/components/charts'
import { UserChip, delayStatusColor, delayStatusLabel } from '@/components/domain'

type Tab = 'sales' | 'activity' | 'discipline' | 'sources'

export default function Reports() {
  const { db, scope, deals, activities, contacts } = useScopedData()
  const [tab, setTab] = useState<Tab>('sales')
  const [period, setPeriod] = useState<'30' | '90' | '365' | 'all'>('90')

  const sinceDays = period === 'all' ? undefined : Number(period)
  const cutoff = sinceDays ? Date.now() - sinceDays * 864e5 : 0

  const rows = useMemo(() => salespersonRows(db, scope, { sinceDays }), [db, scope, sinceDays])
  const teams = useMemo(() => teamRows(db, scope, { sinceDays }), [db, scope, sinceDays])
  const periodDeals = useMemo(
    () => deals.filter((d) => !d.closed_at || new Date(d.closed_at).getTime() >= cutoff),
    [deals, cutoff],
  )
  const periodActivities = useMemo(
    () => activities.filter((a) => new Date(a.occurred_at).getTime() >= cutoff),
    [activities, cutoff],
  )

  const wonInPeriod = periodDeals.filter((d) => isWon(db, d))
  const totalSold = wonInPeriod.reduce((s, d) => s + dealNgnMinor(d), 0)

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        description="Sales, activity and record keeping across everyone you have visibility of."
        actions={
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as never)}
            className="max-w-[180px]"
            aria-label="Reporting period"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="all">All time</option>
          </Select>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Sold"
          value={formatMoneyCompact(totalSold)}
          sub={`${pluralize(wonInPeriod.length, 'closed deal')} at full contracted value`}
          tone="won"
        />
        <StatTile
          label="Average deal"
          value={wonInPeriod.length ? formatMoneyCompact(totalSold / wonInPeriod.length) : '—'}
          sub="Closed deals in period"
        />
        <StatTile
          label="Activity"
          value={periodActivities.length.toLocaleString('en-NG')}
          sub={`${periodActivities.filter((a) => a.type === 'inspection').length} inspections · ${periodActivities.filter((a) => a.type === 'meeting').length} meetings`}
        />
        <StatTile
          label="People in view"
          value={rows.length}
          sub={scope.isCompanyWide ? 'Company-wide' : scope.viewer.role === 'team_lead' ? 'Your team' : 'You'}
        />
      </div>

      <div className="mt-4 mb-4">
        <Tabs
          tabs={[
            { id: 'sales' as const, label: 'Sales' },
            { id: 'activity' as const, label: 'Activity volume' },
            { id: 'discipline' as const, label: 'Record keeping' },
            { id: 'sources' as const, label: 'Lead sources' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'sales' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <SectionHeading
              title="Sales per salesperson"
              subtitle="Closed deals at their full contracted value, in naira."
            />
            {rows.filter((r) => r.soldNgnMinor > 0).length === 0 ? (
              <EmptyState title="No closed deals in this period" />
            ) : (
              <HBarChart
                data={rows
                  .filter((r) => r.soldNgnMinor > 0)
                  .map((r) => ({
                    key: r.user.id,
                    label: r.user.full_name,
                    labelText: r.user.full_name,
                    value: r.soldNgnMinor,
                    display: formatMoneyCompact(r.soldNgnMinor),
                    meta: `${pluralize(r.closedCount, 'deal')} · ${Math.round(r.conversionRate * 100)}% of decided deals won · ${r.teamName}`,
                  }))}
              />
            )}
          </Card>

          <Card>
            <SectionHeading
              title={scope.isCompanyWide ? 'Team rollups' : 'Your team'}
              subtitle="Someone on two teams is counted once, under their primary team."
            />
            {teams.length === 0 ? (
              <EmptyState title="No teams in scope" />
            ) : (
              <HBarChart
                data={teams.map((t) => ({
                  key: t.teamId,
                  label: t.name,
                  labelText: t.name,
                  value: t.soldNgnMinor,
                  display: formatMoneyCompact(t.soldNgnMinor),
                  meta: `Led by ${t.leadName} · ${pluralize(t.memberCount, 'salesperson', 'salespeople')} · ${formatMoneyCompact(t.openNgnMinor)} still open`,
                }))}
              />
            )}
            {db.settings.allow_multi_team && (
              <div className="mt-4">
                <Note tone="neutral">
                  Multi-team membership is switched on. {db.team_memberships.filter((m) => !m.is_primary && m.left_at === null).length}{' '}
                  salesperson sits on a second team — visible to both leads, but counted only once
                  in company totals.
                </Note>
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <SectionHeading
              title="Pipeline funnel"
              subtitle="How deals are distributed across the pipeline."
            />
            <FunnelChart
              data={stageFunnel(db, periodDeals).map((f) => ({
                label: f.stage.name,
                count: f.count,
                display: formatMoneyCompact(f.valueNgnMinor),
                isWon: f.stage.is_won,
                isLost: f.stage.is_lost,
              }))}
            />
          </Card>

          <Card className="lg:col-span-2" padded={false}>
            <div className="border-b border-ink-100 px-4 py-3">
              <h3 className="text-[14px] font-semibold text-ink-900">Full breakdown</h3>
              <p className="mt-0.5 text-[12.5px] text-ink-500">
                The same figures as a table.
              </p>
            </div>
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="border-b border-ink-100 text-[11.5px] tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Salesperson</th>
                    <th className="px-4 py-2.5 font-semibold">Team</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Sold</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Closed</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Open</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Won %</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {rows.map((r) => (
                    <tr key={r.user.id}>
                      <td className="px-4 py-2.5">
                        <UserChip user={r.user} size={22} />
                      </td>
                      <td className="px-4 py-2.5 text-ink-500">{r.teamName}</td>
                      <td className="tnum px-4 py-2.5 text-right font-medium text-ink-900">
                        {formatMoneyWhole(r.soldNgnMinor)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-ink-700">{r.closedCount}</td>
                      <td className="tnum px-4 py-2.5 text-right text-ink-700">
                        {formatMoneyCompact(r.openNgnMinor)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-ink-700">
                        {r.closedCount + r.lostCount > 0 ? `${Math.round(r.conversionRate * 100)}%` : '—'}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-ink-700">{r.activityCount}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-ink-200 text-[13px] font-semibold">
                  <tr>
                    <td className="px-4 py-2.5" colSpan={2}>
                      Total
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">
                      {formatMoneyWhole(rows.reduce((s, r) => s + r.soldNgnMinor, 0))}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">
                      {rows.reduce((s, r) => s + r.closedCount, 0)}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right">
                      {formatMoneyCompact(rows.reduce((s, r) => s + r.openNgnMinor, 0))}
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="tnum px-4 py-2.5 text-right">
                      {rows.reduce((s, r) => s + r.activityCount, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <SectionHeading
              title="Activity volume over time"
              subtitle="By the week the work took place."
            />
            <ColumnChart
              data={activityByWeek(periodActivities, period === '30' ? 5 : period === '90' ? 13 : 16).map((w) => ({
                label: w.label,
                values: { inspections: w.inspections, meetings: w.meetings, calls: w.calls },
              }))}
              series={[
                { key: 'inspections', label: 'Inspections', color: CATEGORICAL[0] },
                { key: 'meetings', label: 'Meetings', color: CATEGORICAL[1] },
                { key: 'calls', label: 'Calls & WhatsApp', color: CATEGORICAL[2] },
              ]}
              format={(n) => String(n)}
              height={200}
            />
          </Card>

          <Card>
            <SectionHeading title="Total activity per salesperson" subtitle="Everything logged in the period." />
            <HBarChart
              data={rows
                .filter((r) => r.activityCount > 0)
                .sort((a, b) => b.activityCount - a.activityCount)
                .map((r) => ({
                  key: r.user.id,
                  label: r.user.full_name,
                  labelText: r.user.full_name,
                  value: r.activityCount,
                  display: String(r.activityCount),
                  meta: `${r.inspections} inspections · ${r.meetings} meetings · ${r.calls} calls`,
                }))}
              emptyLabel="No activity in this period"
            />
          </Card>

          <Card>
            <SectionHeading
              title="Inspections per salesperson"
              subtitle="The activity that most reliably precedes a sale."
            />
            <HBarChart
              data={rows
                .filter((r) => r.inspections > 0)
                .sort((a, b) => b.inspections - a.inspections)
                .map((r) => ({
                  key: r.user.id,
                  label: r.user.full_name,
                  labelText: r.user.full_name,
                  value: r.inspections,
                  display: String(r.inspections),
                  color: CATEGORICAL[0],
                  meta: r.closedCount > 0 ? `${r.closedCount} closed from these` : 'No closes yet',
                }))}
              emptyLabel="No inspections in this period"
            />
          </Card>
        </div>
      )}

      {tab === 'discipline' && <DisciplineReport />}

      {tab === 'sources' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <SectionHeading
              title="Where the business came from"
              subtitle="Leads by source, and what each one went on to close."
            />
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-[13px]">
                <thead className="border-b border-ink-100 text-[11.5px] tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">Source</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Leads</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Closed</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Conversion</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Value sold</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {sourceAttribution(db, contacts, periodDeals)
                    .slice(0, 14)
                    .map((s) => (
                      <tr key={s.source}>
                        <td className="max-w-[280px] truncate px-3 py-2.5 text-ink-800">{s.source}</td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-700">{s.leads}</td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-700">{s.closed}</td>
                        <td className="tnum px-3 py-2.5 text-right text-ink-700">
                          {s.leads > 0 ? `${(s.conversion * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td className="tnum px-3 py-2.5 text-right font-medium text-ink-900">
                          {s.soldNgnMinor > 0 ? formatMoneyWhole(s.soldNgnMinor) : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4">
              <Note tone="neutral">
                Accuracy here depends on the source recorded against each contact. Imports stamp
                their campaign onto every contact they create, and website enquiries carry the page
                and campaign that produced them.
              </Note>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}

/* ---------------------- record keeping / logging delay --------------------- */

/**
 * The report the client described without naming: who keeps records as the work
 * happens, and whose go in all at once before a review.
 */
function DisciplineReport() {
  const { db, scope, activities } = useScopedData()
  const rows = useMemo(() => salespersonRows(db, scope), [db, scope])
  const withActivity = rows.filter((r) => r.activityCount > 0)

  const bursts = useMemo(() => {
    const out: { userId: string; count: number; loggedAt: string; activityIds: string[] }[] = []
    for (const id of scope.userIds) {
      for (const b of detectBackfillBursts(activities.filter((a) => a.user_id === id))) {
        out.push({ userId: id, count: b.count, loggedAt: b.loggedAt, activityIds: b.activities.map((a) => a.id) })
      }
    }
    return out.sort((a, b) => b.count - a.count)
  }, [activities, scope.userIds])

  const late = activities
    .filter((a) => loggingDelayDays(a) >= 5)
    .sort((a, b) => loggingDelayDays(b) - loggingDelayDays(a))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <SectionHeading
          title="Average logging delay per salesperson"
          subtitle="The gap between an activity happening and being recorded. Lower means records are kept as the work happens."
        />
        {withActivity.length === 0 ? (
          <EmptyState title="No activity to measure" />
        ) : (
          <>
            <HBarChart
              data={[...withActivity]
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
            <div className="mt-4">
              <Note tone="neutral">
                This is descriptive, not a verdict — someone out on site all week may have a good
                reason for a longer gap.
              </Note>
            </div>
          </>
        )}
      </Card>

      <Card>
        <SectionHeading
          title="Bulk entry sessions"
          subtitle="Several records, for work done on different days, all typed in within one short sitting."
        />
        {bursts.length === 0 ? (
          <EmptyState
            title="No bulk back-filling detected"
            description="Records in your view were entered close to when the work happened."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {bursts.slice(0, 6).map((b, i) => (
              <li key={i} className="py-3 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <UserChip user={userById(db, b.userId)} size={22} />
                  <Badge tone="warn">{pluralize(b.count, 'record')} in one session</Badge>
                </div>
                <div className="mt-1 text-[12px] text-ink-500">
                  Entered {formatDateTime(b.loggedAt)} — covering work done over the preceding weeks.
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading
          title="Latest late entries"
          subtitle="Individual records entered five or more days after the work."
        />
        {late.length === 0 ? (
          <EmptyState title="Nothing entered late" />
        ) : (
          <ul className="divide-y divide-ink-100">
            {late.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink-800">
                    {contactName(contactById(db, a.contact_id))}
                  </div>
                  <div className="text-[11.5px] text-ink-400">
                    {a.type} on {formatDate(a.occurred_at)} · {userById(db, a.user_id)?.full_name}
                  </div>
                </div>
                <Badge tone="lost">{Math.round(loggingDelayDays(a))}d late</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
