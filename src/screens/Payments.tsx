/**
 * Collections and cashflow.
 *
 * A sale keeps its full contracted value throughout; this screen tracks the money
 * against it — what has been received, what is outstanding, how overdue it is, and
 * what the agreed plans say should arrive next.
 */
import { useMemo, useState } from 'react'
import { useScopedData, collectionsSummary, contactById, propertyById, userById } from '@/data/selectors'
import {
  ageingBucket,
  contactName,
  dealNgnMinor,
  derivedPaymentStatus,
  effectivePayments,
  expectedInflowByMonth,
  outstandingNgnMinor,
  paidNgnMinor,
} from '@/data/derive'
import { useStore } from '@/data/store'
import { formatMoneyCompact, formatMoneyWhole, parseMoneyToMinor } from '@/data/money'
import { formatDate, formatDateTime, pluralize, todayIsoDate } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Note,
  PageHeader,
  SectionHeading,
  Select,
  StatTile,
  Tabs,
  cx,
} from '@/components/ui'
import { AGEING_RAMP, ColumnChart, HBarChart, MAGNITUDE } from '@/components/charts'
import { UserChip } from '@/components/domain'
import type { Currency, Deal, PaymentMethod } from '@/data/schema'

export default function Payments() {
  const { db, scope, deals } = useScopedData()
  const [tab, setTab] = useState<'collections' | 'inflow' | 'ledger'>('collections')
  const [openDealId, setOpenDealId] = useState<string | null>(null)

  const { won, overdue, totalOutstanding, totalOverdue } = useMemo(
    () => collectionsSummary(db, deals),
    [db, deals],
  )

  const totalSold = won.reduce((s, d) => s + dealNgnMinor(d), 0)
  const collected = won.reduce((s, d) => s + paidNgnMinor(db, d.id), 0)

  const ageing = useMemo(() => {
    const buckets: Record<string, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
    for (const o of overdue) buckets[ageingBucket(o.daysOverdue)] += o.amountNgnMinor
    return buckets
  }, [overdue])

  const inflow = useMemo(() => expectedInflowByMonth(db, won, 6), [db, won])

  const byBuyer = useMemo(
    () =>
      won
        .map((d) => ({
          deal: d,
          outstanding: outstandingNgnMinor(db, d),
          overdueDays: overdue.filter((o) => o.deal.id === d.id).reduce((m, o) => Math.max(m, o.daysOverdue), 0),
        }))
        .filter((x) => x.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding),
    [db, won, overdue],
  )

  const bySalesperson = useMemo(() => {
    const map = new Map<string, { outstanding: number; overdue: number; deals: number }>()
    for (const d of won) {
      const key = d.owner_user_id
      if (!map.has(key)) map.set(key, { outstanding: 0, overdue: 0, deals: 0 })
      const entry = map.get(key)!
      entry.outstanding += outstandingNgnMinor(db, d)
      entry.deals += 1
    }
    for (const o of overdue) {
      const entry = map.get(o.deal.owner_user_id)
      if (entry) entry.overdue += o.amountNgnMinor
    }
    return [...map.entries()]
      .map(([userId, v]) => ({ userId, ...v }))
      .filter((r) => r.outstanding > 0)
      .sort((a, b) => b.outstanding - a.outstanding)
  }, [db, won, overdue])

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="Collections & cashflow"
        description="What has been banked against each sale, what is still owed, and what the agreed payment plans say should arrive over the coming months."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Contracted"
          value={formatMoneyCompact(totalSold)}
          sub={pluralize(won.length, 'closed deal')}
        />
        <StatTile label="Collected" value={formatMoneyCompact(collected)} sub={`${totalSold > 0 ? Math.round((collected / totalSold) * 100) : 0}% of contracted value banked`} tone="won" />
        <StatTile
          label="Outstanding"
          value={formatMoneyCompact(totalOutstanding)}
          sub="Contracted value less everything banked"
          tone="warn"
        />
        <StatTile
          label="Overdue"
          value={formatMoneyCompact(totalOverdue)}
          sub={`${pluralize(overdue.length, 'instalment')} past its due date`}
          tone={totalOverdue > 0 ? 'lost' : 'won'}
        />
      </div>

      <div className="mt-4 mb-4">
        <Tabs
          tabs={[
            { id: 'collections' as const, label: 'Collections' },
            { id: 'inflow' as const, label: 'Expected inflow' },
            { id: 'ledger' as const, label: 'All closed deals', count: won.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'collections' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <SectionHeading
              title="Overdue, by how late it is"
              subtitle="Ageing buckets. Each figure is the shortfall on instalments whose due date has passed."
            />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {(['0-30', '31-60', '61-90', '90+'] as const).map((bucket, i) => (
                <div
                  key={bucket}
                  className="rounded-lg border border-ink-100 p-3"
                  style={{ borderTopWidth: 3, borderTopColor: AGEING_RAMP[i] }}
                >
                  <div className="text-[12px] font-medium text-ink-500">
                    {bucket === '90+' ? 'Over 90 days' : `${bucket} days`}
                  </div>
                  <div className="tnum mt-1 font-display text-[22px] leading-none font-semibold text-ink-900">
                    {formatMoneyCompact(ageing[bucket])}
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-ink-400">
                    {pluralize(overdue.filter((o) => ageingBucket(o.daysOverdue) === bucket).length, 'instalment')}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeading title="Outstanding per buyer" subtitle="Largest balance first." />
            {byBuyer.length === 0 ? (
              <EmptyState title="Everything is fully paid" />
            ) : (
              <HBarChart
                data={byBuyer.slice(0, 10).map((x) => ({
                  key: x.deal.id,
                  label: contactName(contactById(db, x.deal.contact_id)),
                  labelText: contactName(contactById(db, x.deal.contact_id)),
                  value: x.outstanding,
                  display: formatMoneyCompact(x.outstanding),
                  color: x.overdueDays > 0 ? AGEING_RAMP[Math.min(3, Math.floor(x.overdueDays / 30))] : MAGNITUDE,
                  meta: [
                    x.overdueDays > 0 ? `${x.overdueDays} days overdue` : 'On schedule',
                    propertyById(db, x.deal.property_id)?.estate,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  onClick: () => setOpenDealId(x.deal.id),
                }))}
              />
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Outstanding per salesperson"
              subtitle="Who is carrying the collection work — and whose buyers have stalled."
            />
            {bySalesperson.length === 0 ? (
              <EmptyState title="Nothing outstanding" />
            ) : (
              <HBarChart
                data={bySalesperson.map((r) => ({
                  key: r.userId,
                  label: userById(db, r.userId)?.full_name ?? '—',
                  labelText: userById(db, r.userId)?.full_name ?? '',
                  value: r.outstanding,
                  display: formatMoneyCompact(r.outstanding),
                  meta:
                    r.overdue > 0
                      ? `${formatMoneyCompact(r.overdue)} of it overdue · ${pluralize(r.deals, 'deal')}`
                      : `All on schedule · ${pluralize(r.deals, 'deal')}`,
                  color: r.overdue > 0 ? AGEING_RAMP[2] : MAGNITUDE,
                }))}
              />
            )}
          </Card>

          <Card className="lg:col-span-2">
            <SectionHeading
              title="Overdue instalments"
              subtitle="Surfaced to the owning salesperson and their team lead."
            />
            {overdue.length === 0 ? (
              <EmptyState title="Nothing overdue" description="Every scheduled instalment has been covered." />
            ) : (
              <div className="scroll-slim overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-[13px]">
                  <thead className="border-b border-ink-100 text-[11.5px] tracking-wide text-ink-500 uppercase">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Buyer</th>
                      <th className="px-3 py-2.5 font-semibold">Unit</th>
                      <th className="px-3 py-2.5 font-semibold">Instalment</th>
                      <th className="px-3 py-2.5 font-semibold">Due</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Shortfall</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Overdue</th>
                      <th className="px-3 py-2.5 font-semibold">Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {overdue.slice(0, 20).map((o) => (
                      <tr
                        key={o.item.id}
                        onClick={() => setOpenDealId(o.deal.id)}
                        className="cursor-pointer hover:bg-brand-50/40"
                      >
                        <td className="px-3 py-2.5 font-medium text-ink-900">
                          {contactName(contactById(db, o.deal.contact_id))}
                        </td>
                        <td className="px-3 py-2.5 text-ink-500">
                          {propertyById(db, o.deal.property_id)?.estate ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-ink-600">
                          {o.item.sequence === 0 ? 'Commitment fee' : `Instalment ${o.item.sequence}`}
                        </td>
                        <td className="tnum px-3 py-2.5 text-ink-600">{formatDate(o.item.due_on)}</td>
                        <td className="tnum px-3 py-2.5 text-right font-medium text-ink-900">
                          {formatMoneyWhole(o.amountNgnMinor)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Badge tone={o.daysOverdue > 60 ? 'lost' : 'warn'}>{o.daysOverdue}d</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <UserChip user={userById(db, o.deal.owner_user_id)} size={20} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'inflow' && (
        <div className="grid gap-4">
          <Card>
            <SectionHeading
              title="What is contractually due to arrive"
              subtitle="From the agreed schedules on each closed deal — the next six months."
            />
            <ColumnChart
              data={inflow.map((m) => ({
                label: m.label,
                values: { due: m.amountNgnMinor },
                tooltip: (
                  <div>
                    <div className="font-medium text-ink-900">{m.label}</div>
                    <div>{formatMoneyWhole(m.amountNgnMinor)}</div>
                    <div className="text-ink-400">{pluralize(m.itemCount, 'instalment')}</div>
                  </div>
                ),
              }))}
              series={[{ key: 'due', label: 'Contractually due', color: MAGNITUDE }]}
              format={(n) => formatMoneyCompact(n)}
              height={200}
              showLegend={false}
            />
            <div className="mt-4">
              <Note tone="neutral">
                This is what the agreed payment plans say should arrive, not a forecast. A buyer
                who pays late moves money between these columns — the ageing report on the
                previous tab shows where that has already happened.
              </Note>
            </div>
          </Card>

          <Card padded={false}>
            <div className="border-b border-ink-100 px-4 py-3">
              <h3 className="text-[14px] font-semibold text-ink-900">Month by month</h3>
            </div>
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-ink-100 text-[11.5px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Month</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Instalments</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {inflow.map((m) => (
                  <tr key={m.month}>
                    <td className="px-4 py-2.5 text-ink-800">{m.label}</td>
                    <td className="tnum px-4 py-2.5 text-right text-ink-600">{m.itemCount}</td>
                    <td className="tnum px-4 py-2.5 text-right font-medium text-ink-900">
                      {formatMoneyWhole(m.amountNgnMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink-200 font-semibold">
                <tr>
                  <td className="px-4 py-2.5">Six-month total</td>
                  <td className="tnum px-4 py-2.5 text-right">{inflow.reduce((s, m) => s + m.itemCount, 0)}</td>
                  <td className="tnum px-4 py-2.5 text-right">
                    {formatMoneyWhole(inflow.reduce((s, m) => s + m.amountNgnMinor, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      {tab === 'ledger' && (
        <Card padded={false}>
          <div className="border-b border-ink-100 px-4 py-3">
            <h3 className="text-[14px] font-semibold text-ink-900">Every closed deal</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-500">
              Part payment and Fully paid follow the money received — a deal whose payments
              equal its value is fully paid.
            </p>
          </div>
          {won.length === 0 ? (
            <EmptyState title="No closed deals in your view" />
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="border-b border-ink-100 text-[11.5px] tracking-wide text-ink-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Buyer</th>
                    <th className="px-4 py-2.5 font-semibold">Unit</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Contracted</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Plan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {won
                    .slice()
                    .sort((a, b) => outstandingNgnMinor(db, b) - outstandingNgnMinor(db, a))
                    .map((d) => {
                      const status = derivedPaymentStatus(db, d)
                      const plan = db.payment_plans.find((p) => p.id === d.payment_plan_id)
                      return (
                        <tr
                          key={d.id}
                          onClick={() => setOpenDealId(d.id)}
                          className="cursor-pointer hover:bg-brand-50/40"
                        >
                          <td className="px-4 py-2.5 font-medium text-ink-900">
                            {contactName(contactById(db, d.contact_id))}
                          </td>
                          <td className="px-4 py-2.5 text-ink-500">
                            {propertyById(db, d.property_id)?.estate ?? '—'}
                          </td>
                          <td className="tnum px-4 py-2.5 text-right text-ink-800">
                            {formatMoneyWhole(dealNgnMinor(d))}
                          </td>
                          <td className="tnum px-4 py-2.5 text-right text-won">
                            {formatMoneyWhole(paidNgnMinor(db, d.id))}
                          </td>
                          <td className="tnum px-4 py-2.5 text-right font-medium text-ink-900">
                            {formatMoneyWhole(outstandingNgnMinor(db, d))}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              tone={status === 'fully_paid' ? 'won' : status === 'part_payment' ? 'warn' : 'lost'}
                            >
                              {status === 'fully_paid'
                                ? 'Fully paid'
                                : status === 'part_payment'
                                  ? 'Part payment'
                                  : 'Awaiting first payment'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-ink-500">{plan?.name ?? '—'}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <DealLedger dealId={openDealId} onClose={() => setOpenDealId(null)} viewerId={scope.viewer.id} />
    </>
  )
}

/* ------------------------------- deal ledger ------------------------------- */

function DealLedger({
  dealId,
  onClose,
  viewerId,
}: {
  dealId: string | null
  onClose: () => void
  viewerId: string
}) {
  const { db } = useScopedData()
  const reversePayment = useStore((s) => s.reversePayment)
  const [recordOpen, setRecordOpen] = useState(false)

  const deal = dealId ? db.deals.find((d) => d.id === dealId) : undefined
  if (!deal) return null

  const payments = db.deal_payments
    .filter((p) => p.deal_id === deal.id)
    .sort((a, b) => new Date(b.received_on).getTime() - new Date(a.received_on).getTime())
  const effective = effectivePayments(db, deal.id)
  const effectiveIds = new Set(effective.map((p) => p.id))
  const reversedIds = new Set(payments.map((p) => p.reverses_payment_id).filter(Boolean) as string[])
  const schedule = db.deal_schedule
    .filter((s) => s.deal_id === deal.id)
    .sort((a, b) => a.sequence - b.sequence)
  const paid = paidNgnMinor(db, deal.id)
  const total = dealNgnMinor(deal)
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={contactName(contactById(db, deal.contact_id))}
        subtitle={deal.title}
        footer={
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setRecordOpen(true)}>
              Record a payment
            </Button>
          </div>
        }
      >
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[12px] text-ink-500">Contracted value — unchanged by any payment</div>
              <div className="tnum font-display text-[26px] leading-none font-semibold text-ink-900">
                {formatMoneyWhole(total)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[12px] text-ink-500">Outstanding</div>
              <div className="tnum font-display text-[26px] leading-none font-semibold text-warn">
                {formatMoneyWhole(outstandingNgnMinor(db, deal))}
              </div>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-won transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11.5px] text-ink-400">
            <span>{formatMoneyWhole(paid)} received</span>
            <span>{Math.round(pct)}% collected</span>
          </div>
        </Card>

        {schedule.length > 0 && (
          <Card className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-ink-800">Agreed schedule</h3>
            </div>
            <ul className="divide-y divide-ink-100">
              {schedule.map((s, i) => {
                // Instalments settle in sequence, so credit runs down the list.
                const priorTotal = schedule.slice(0, i).reduce((sum, x) => sum + x.amount_minor, 0)
                const covered = paid >= priorTotal + s.amount_minor
                const partial = !covered && paid > priorTotal
                const overdue = !covered && new Date(`${s.due_on}T00:00:00`) < new Date()
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                    <span className="min-w-0 flex-1 text-[12.5px] text-ink-700">
                      {s.sequence === 0 ? 'Commitment fee' : `Instalment ${s.sequence}`}
                      <span className="ml-2 text-ink-400">due {formatDate(s.due_on)}</span>
                    </span>
                    <span className="tnum text-[13px] font-medium text-ink-900">
                      {formatMoneyWhole(s.amount_minor)}
                    </span>
                    <Badge tone={covered ? 'won' : overdue ? 'lost' : partial ? 'warn' : 'neutral'}>
                      {covered ? 'covered' : overdue ? 'overdue' : partial ? 'part' : 'upcoming'}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <Card className="mt-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-ink-800">Payments received</h3>
          </div>
          {payments.length === 0 ? (
            <EmptyState title="Nothing received yet" description="This deal reads as entirely outstanding." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {payments.map((p) => {
                const isReversal = !!p.reverses_payment_id
                const wasReversed = reversedIds.has(p.id)
                return (
                  <li
                    key={p.id}
                    className={cx(
                      'py-2.5 first:pt-0',
                      (isReversal || wasReversed) && 'opacity-70',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'tnum text-[14px] font-semibold',
                          isReversal ? 'text-lost' : 'text-ink-900',
                          wasReversed && 'line-through',
                        )}
                      >
                        {formatMoneyWhole(p.amount_ngn_minor)}
                      </span>
                      <Badge tone="neutral">{p.method}</Badge>
                      {p.currency === 'USD' && (
                        <Badge tone="info" title="Converted at the rate on the day this tranche landed">
                          ${(Math.abs(p.amount_minor) / 100).toLocaleString('en-NG')} @ ₦{p.fx_rate_to_ngn}
                        </Badge>
                      )}
                      {isReversal && <Badge tone="lost">reversal</Badge>}
                      {wasReversed && <Badge tone="lost">reversed</Badge>}
                      <span className="ml-auto text-[11.5px] text-ink-400">{formatDate(p.received_on)}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-400">
                      <span className="font-mono">{p.reference}</span>
                      <span>· entered by {userById(db, p.recorded_by)?.full_name}</span>
                      <span>· {formatDateTime(p.recorded_at)}</span>
                      {effectiveIds.has(p.id) && (
                        <button
                          onClick={() => reversePayment(p.id, viewerId)}
                          className="ml-auto font-medium text-lost hover:underline"
                        >
                          Reverse
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-3">
            <Note tone="neutral">
              Payments are corrected by reversal rather than edited, so the original entry and the
              correction both stay on the record along with who made each one.
            </Note>
          </div>
        </Card>

        {deal.currency === 'USD' && (
          <div className="mt-3">
            <Note tone="info">
              This deal closed in USD at ₦{deal.fx_rate_to_ngn}. Each payment above converts at the
              rate on the day it landed, so a sale paid across several months reflects what was
              actually banked.
            </Note>
          </div>
        )}
      </Drawer>

      <RecordPaymentModal
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        deal={deal}
        viewerId={viewerId}
      />
    </>
  )
}

function RecordPaymentModal({
  open,
  onClose,
  deal,
  viewerId,
}: {
  open: boolean
  onClose: () => void
  deal: Deal
  viewerId: string
}) {
  const { db } = useScopedData()
  const recordPayment = useStore((s) => s.recordPayment)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>(deal.currency)
  const [rate, setRate] = useState(String(deal.fx_rate_to_ngn ?? db.settings.default_usd_ngn_rate))
  const [receivedOn, setReceivedOn] = useState(todayIsoDate())
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const submit = () => {
    const parsed = parseMoneyToMinor(amount)
    if (parsed == null || parsed <= 0) return setError('Enter the amount received.')
    if (!reference.trim()) return setError('A bank reference or teller number keeps the record auditable.')
    recordPayment({
      deal_id: deal.id,
      amount_minor: parsed,
      currency,
      fx_rate_to_ngn: Number(rate) || null,
      received_on: receivedOn,
      method,
      reference: reference.trim(),
      recorded_by: viewerId,
    })
    setAmount('')
    setReference('')
    setError(null)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record a payment"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Record it
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received" required>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="20,000,000" autoFocus />
        </Field>
        <Field label="Currency" required>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
          </Select>
        </Field>
        {currency === 'USD' && (
          <Field label="Rate on the day it landed" required hint="Not the deal's rate — this tranche's own">
            <Input value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
        <Field label="Date received" required>
          <Input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        </Field>
        <Field label="Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Reference" required hint="Bank reference or teller number">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="FLX/20260819/0042" />
          </Field>
        </div>
      </div>

      <div className="mt-3">
        <Note tone="neutral">
          Recording a payment reduces the outstanding balance. The sale keeps its full contracted
          value, so sales figures are unaffected.
        </Note>
      </div>

      {error && (
        <div className="mt-3">
          <Note tone="lost">{error}</Note>
        </div>
      )}
    </Modal>
  )
}
