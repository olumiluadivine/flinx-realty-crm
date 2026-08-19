/**
 * Pipeline.
 *
 * Stages are data, so this board renders whatever the stage list currently says —
 * add one in Settings and a column appears here without a code change. Dragging is
 * the desktop path; on a phone each card carries a stage picker, because dragging
 * across a horizontally scrolling board on a handset is a bad idea.
 */
import { useMemo, useState } from 'react'
import { useScopedData, contactById, propertyById, subStatusName, userById } from '@/data/selectors'
import { contactName, daysInCurrentStage, dealNgnMinor, isWon } from '@/data/derive'
import { useStore } from '@/data/store'
import { formatMoneyCompact, formatMoneyWhole, parseMoneyToMinor } from '@/data/money'
import { formatDate, formatDateShort, pluralize, relativeTime } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  Input,
  Modal,
  Note,
  PageHeader,
  Select,
  StatTile,
  cx,
} from '@/components/ui'
import { PropertyTile, StageBadge, UserChip } from '@/components/domain'
import { FunnelChart } from '@/components/charts'
import type { Currency, Deal, PipelineStage } from '@/data/schema'

export default function Deals() {
  const { db, scope, deals } = useScopedData()
  const moveDealStage = useStore((s) => s.moveDealStage)
  const [view, setView] = useState<'board' | 'funnel'>('board')
  const [openId, setOpenId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [closing, setClosing] = useState<{ deal: Deal; stage: PipelineStage } | null>(null)
  const [ownerFilter, setOwnerFilter] = useState('all')

  const stages = useMemo(
    () => [...db.pipeline_stages].sort((a, b) => a.sort_order - b.sort_order),
    [db.pipeline_stages],
  )

  const visible = useMemo(
    () => (ownerFilter === 'all' ? deals : deals.filter((d) => d.owner_user_id === ownerFilter)),
    [deals, ownerFilter],
  )

  const owners = db.users.filter((u) => scope.userIds.has(u.id) && deals.some((d) => d.owner_user_id === u.id))
  const won = visible.filter((d) => isWon(db, d))
  const open = visible.filter((d) => {
    const s = db.pipeline_stages.find((x) => x.id === d.stage_id)
    return s && !s.is_won && !s.is_lost
  })

  /**
   * The one rule that lives on this screen: a stage flagged `requires_amount` cannot
   * be entered without a value. Rather than rejecting the drop silently, it opens the
   * form that collects what is missing.
   */
  const attemptMove = (dealId: string, stageId: string) => {
    const deal = db.deals.find((d) => d.id === dealId)
    const stage = db.pipeline_stages.find((s) => s.id === stageId)
    if (!deal || !stage || deal.stage_id === stageId) return
    if (stage.requires_amount && deal.amount_minor <= 0) {
      setClosing({ deal, stage })
      return
    }
    moveDealStage(dealId, stageId, scope.viewer.id)
  }

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Deals"
        description="Every live opportunity, by stage. Drag a deal to move it; stages are configurable in Settings."
        actions={
          <div className="flex gap-1 rounded-lg border border-ink-200 bg-surface p-0.5">
            {(['board', 'funnel'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cx(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium capitalize transition-colors',
                  view === v ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-50',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open pipeline" value={formatMoneyCompact(open.reduce((s, d) => s + dealNgnMinor(d), 0))} sub={pluralize(open.length, 'live deal')} tone="brand" />
        <StatTile label="Closed" value={formatMoneyCompact(won.reduce((s, d) => s + dealNgnMinor(d), 0))} sub={`${pluralize(won.length, 'deal')} at full contracted value`} tone="won" />
        <StatTile
          label="Average deal"
          value={won.length ? formatMoneyCompact(won.reduce((s, d) => s + dealNgnMinor(d), 0) / won.length) : '—'}
          sub="Closed deals only"
        />
        <StatTile
          label="In USD"
          value={visible.filter((d) => d.currency === 'USD').length}
          sub="Each frozen at its rate on the day it closed"
        />
      </div>

      <Card className="mt-4 mb-4" padded={false}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <Select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="max-w-xs"
            aria-label="Filter by owner"
          >
            <option value="all">All owners in your view ({owners.length})</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
                  </div>
      </Card>

      {view === 'funnel' ? (
        <Card>
          <h2 className="mb-1 text-base font-semibold text-ink-900">Where the deals sit</h2>
          <p className="mb-4 text-[13px] text-ink-500">
            Deal counts and value at each stage of the pipeline.
          </p>
          <FunnelChart
            data={stages.map((s) => {
              const inStage = visible.filter((d) => d.stage_id === s.id)
              return {
                label: s.name,
                count: inStage.length,
                display: formatMoneyCompact(inStage.reduce((sum, d) => sum + dealNgnMinor(d), 0)),
                isWon: s.is_won,
                isLost: s.is_lost,
              }
            })}
          />
        </Card>
      ) : (
        <>
          <p className="mb-2 text-[12px] text-ink-400">
            <span className="lg:hidden">
              Use the stage menu on each card to move a deal. Drag-and-drop is available on a larger
              screen.{' '}
            </span>
            <span className="hidden lg:inline">
              Drag a card between columns to move a deal. Scroll the board sideways to reach later
              stages.{' '}
            </span>
          </p>
          {/*
            Columns keep a fixed width and the board scrolls, rather than dividing the
            viewport between however many stages exist. With eight stages, equal
            columns truncate every name on every card — and the stage list is meant to
            grow, so the layout cannot assume it stays small.
          */}
          <div className="scroll-slim -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex min-w-max gap-3">
              {stages.map((stage) => {
                const inStage = visible
                  .filter((d) => d.stage_id === stage.id)
                  .sort((a, b) => dealNgnMinor(b) - dealNgnMinor(a))
                const value = inStage.reduce((s, d) => s + dealNgnMinor(d), 0)
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOver(stage.id)
                    }}
                    onDragLeave={() => setDragOver((v) => (v === stage.id ? null : v))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(null)
                      if (dragging) attemptMove(dragging, stage.id)
                      setDragging(null)
                    }}
                    className={cx(
                      'flex w-[272px] shrink-0 flex-col rounded-[--radius-card] border transition-colors',
                      dragOver === stage.id
                        ? 'border-brand-500 bg-brand-50'
                        : 'border-ink-100 bg-ink-50/50',
                    )}
                  >
                    <div className="border-b border-ink-100 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-800">
                          {stage.name}
                        </span>
                        {stage.is_won && <Badge tone="won">won</Badge>}
                        {stage.is_lost && <Badge tone="lost">lost</Badge>}
                        <span className="tnum text-[12px] text-ink-400">{inStage.length}</span>
                      </div>
                      <div className="tnum mt-0.5 text-[12px] text-ink-500">{formatMoneyCompact(value)}</div>
                      {stage.requires_amount && (
                        <div className="mt-1 text-[10.5px] text-warn">requires a deal value</div>
                      )}
                    </div>

                    <div className="scroll-slim flex max-h-[64vh] flex-col gap-2 overflow-y-auto p-2">
                      {inStage.length === 0 && (
                        <div className="px-2 py-6 text-center text-[12px] text-ink-300">Nothing here</div>
                      )}
                      {inStage.map((deal) => {
                        const contact = contactById(db, deal.contact_id)
                        const property = propertyById(db, deal.property_id)
                        const days = daysInCurrentStage(db, deal)
                        return (
                          <div
                            key={deal.id}
                            draggable
                            onDragStart={() => setDragging(deal.id)}
                            onDragEnd={() => setDragging(null)}
                            onClick={() => setOpenId(deal.id)}
                            className={cx(
                              'cursor-pointer rounded-lg border border-ink-100 bg-surface p-2.5 transition-shadow hover:shadow-md',
                              dragging === deal.id && 'opacity-40',
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <PropertyTile property={property} size={30} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[13px] font-medium text-ink-900">
                                  {contactName(contact)}
                                </div>
                                <div className="truncate text-[11.5px] text-ink-400">
                                  {property?.estate ?? 'No unit yet'}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="tnum text-[13px] font-semibold text-ink-900">
                                {deal.amount_minor > 0 ? formatMoneyCompact(dealNgnMinor(deal)) : '—'}
                              </span>
                              {deal.currency === 'USD' && <Badge tone="info">USD</Badge>}
                              {deal.sub_status_id && (
                                <Badge tone="neutral">{subStatusName(db, deal.sub_status_id)}</Badge>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <UserChip user={userById(db, deal.owner_user_id)} size={18} />
                              <span
                                className={cx('text-[11px]', days > 21 ? 'text-warn' : 'text-ink-400')}
                                title={`In ${stage.name} for ${Math.round(days)} days`}
                              >
                                {Math.round(days)}d
                              </span>
                            </div>
                            {/* Mobile move control — dragging is not a phone gesture worth relying on. */}
                            <select
                              value={deal.stage_id}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => attemptMove(deal.id, e.target.value)}
                              className="mt-2 w-full rounded border border-ink-200 bg-surface px-2 py-1 text-[11.5px] text-ink-600 lg:hidden"
                              aria-label={`Move ${contactName(contact)} to another stage`}
                            >
                              {stages.map((s) => (
                                <option key={s.id} value={s.id}>
                                  Move to {s.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      <DealDetail dealId={openId} onClose={() => setOpenId(null)} onMove={attemptMove} />
      <CloseDealModal
        pending={closing}
        onClose={() => setClosing(null)}
        onConfirm={(amountMinor, currency, rate) => {
          if (!closing) return
          moveDealStage(closing.deal.id, closing.stage.id, scope.viewer.id, {
            amount_minor: amountMinor,
            currency,
            fx_rate_to_ngn: rate,
          })
          setClosing(null)
        }}
      />
    </>
  )
}

/* ------------------------------- deal detail ------------------------------- */

function DealDetail({
  dealId,
  onClose,
  onMove,
}: {
  dealId: string | null
  onClose: () => void
  onMove: (dealId: string, stageId: string) => void
}) {
  const { db } = useScopedData()
  const setDealSubStatus = useStore((s) => s.setDealSubStatus)
  const deal = dealId ? db.deals.find((d) => d.id === dealId) : undefined
  if (!deal) return null

  const contact = contactById(db, deal.contact_id)
  const property = propertyById(db, deal.property_id)
  const stage = db.pipeline_stages.find((s) => s.id === deal.stage_id)
  const subs = db.pipeline_sub_statuses.filter((s) => s.stage_id === deal.stage_id)
  const team = db.teams.find((t) => t.id === deal.team_id)
  const history = db.deal_stage_history
    .filter((h) => h.deal_id === deal.id)
    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())
  const activities = db.activities
    .filter((a) => a.deal_id === deal.id)
    .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())

  return (
    <Drawer open onClose={onClose} title={contactName(contact)} subtitle={deal.title}>
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge db={db} stageId={deal.stage_id} />
        {deal.sub_status_id && <Badge tone="neutral">{subStatusName(db, deal.sub_status_id)}</Badge>}
        <span className="ml-auto text-[12px] text-ink-400">Opened {formatDate(deal.created_at)}</span>
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-ink-500">Contracted value</div>
            <div className="tnum mt-0.5 font-display text-[28px] leading-none font-semibold text-ink-900">
              {deal.amount_minor > 0 ? formatMoneyWhole(dealNgnMinor(deal)) : 'Not set'}
            </div>
          </div>
          {deal.currency === 'USD' && (
            <div className="text-right">
              <div className="text-[12px] text-ink-500">Transacted in USD</div>
              <div className="tnum text-[13px] font-medium text-ink-800">
                ${(deal.amount_minor / 100).toLocaleString('en-NG')} @ ₦{deal.fx_rate_to_ngn}
              </div>
            </div>
          )}
        </div>
        {deal.currency === 'USD' && (
          <div className="mt-3">
            <Note tone="info">
              The exchange rate is fixed at the date this deal closed, so reported totals stay
              stable as the rate moves.
            </Note>
          </div>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-ink-400">
          The full contracted value of the sale. Payment progress is tracked separately under
          Payments.
        </p>
      </Card>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Card>
          <div className="text-[12px] font-medium text-ink-500">Stage</div>
          <Select
            className="mt-1.5"
            value={deal.stage_id}
            onChange={(e) => onMove(deal.id, e.target.value)}
            aria-label="Change stage"
          >
            {[...db.pipeline_stages]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
          {subs.length > 0 && (
            <>
              <div className="mt-3 text-[12px] font-medium text-ink-500">
                Sub-status
                <span className="ml-1.5 font-normal text-ink-400">— {stage?.name}</span>
              </div>
              <Select
                className="mt-1.5"
                value={deal.sub_status_id ?? ''}
                onChange={(e) => setDealSubStatus(deal.id, e.target.value || null)}
                aria-label="Change sub-status"
              >
                <option value="">None</option>
                {subs
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </Select>
            </>
          )}
        </Card>

        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
            <dt className="text-ink-400">Owner</dt>
            <dd className="text-ink-800">{userById(db, deal.owner_user_id)?.full_name}</dd>
            <dt className="text-ink-400">Team</dt>
            <dd className="text-ink-800">
              {team?.name}
              <span className="ml-1 text-[11px] text-ink-400">(as at creation)</span>
            </dd>
            <dt className="text-ink-400">Unit</dt>
            <dd className="text-ink-800">{property?.title ?? 'Not selected yet'}</dd>
            {property && (
              <>
                <dt className="text-ink-400">Location</dt>
                <dd className="text-ink-800">{property.location}</dd>
              </>
            )}
            {deal.expected_close_on && (
              <>
                <dt className="text-ink-400">Expected close</dt>
                <dd className="text-ink-800">{formatDate(deal.expected_close_on)}</dd>
              </>
            )}
            {deal.closed_at && (
              <>
                <dt className="text-ink-400">Closed</dt>
                <dd className="text-ink-800">{formatDate(deal.closed_at)}</dd>
              </>
            )}
          </dl>
          <p className="mt-2.5 border-t border-ink-100 pt-2 text-[11.5px] leading-relaxed text-ink-400">
            The team is recorded when the deal is created, so historical figures stay put if this
            salesperson later moves team.
          </p>
        </Card>
      </div>

      <Card className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink-800">Stage history</h3>
        </div>
        <ol className="relative border-l border-ink-100 pl-4">
          {history.map((h, i) => {
            const next = history[i + 1]
            const daysHere = (
              (new Date(next?.changed_at ?? Date.now()).getTime() - new Date(h.changed_at).getTime()) /
              864e5
            ).toFixed(0)
            return (
              <li key={h.id} className="relative pb-3 last:pb-0">
                <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-400" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-medium text-ink-800">
                    {db.pipeline_stages.find((s) => s.id === h.to_stage_id)?.name}
                  </span>
                  <span className="text-[11.5px] text-ink-400">
                    {formatDateShort(h.changed_at)} · {userById(db, h.changed_by)?.full_name}
                  </span>
                  <Badge tone="neutral">{daysHere}d in stage</Badge>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>

      {activities.length > 0 && (
        <Card className="mt-3">
          <h3 className="mb-2 text-[13px] font-semibold text-ink-800">
            Activity against this deal ({activities.length})
          </h3>
          <ul className="divide-y divide-ink-100">
            {activities.slice(0, 6).map((a) => (
              <li key={a.id} className="py-2 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium text-ink-700 capitalize">{a.type}</span>
                  <span className="text-[11.5px] text-ink-400">{relativeTime(a.occurred_at)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-ink-500">{a.notes}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Drawer>
  )
}

/* ------------------------------ closing a deal ----------------------------- */

/**
 * Closed means the client bought, and a sale with no figure is not a sale — so the
 * stage cannot be entered until the value is there (R-PIP-4). A USD deal captures its
 * rate here, once, and keeps it forever (R-CUR-3).
 */
function CloseDealModal({
  pending,
  onClose,
  onConfirm,
}: {
  pending: { deal: Deal; stage: PipelineStage } | null
  onClose: () => void
  onConfirm: (amountMinor: number, currency: Currency, rate: number | null) => void
}) {
  const { db } = useScopedData()
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('NGN')
  const [rate, setRate] = useState(String(db.settings.default_usd_ngn_rate))
  const [error, setError] = useState<string | null>(null)

  if (!pending) return null

  const property = propertyById(db, pending.deal.property_id)
  const parsed = parseMoneyToMinor(amount)
  const rateNum = Number(rate)
  const ngnPreview =
    parsed != null ? (currency === 'NGN' ? parsed : Math.round(parsed * (rateNum || 0))) : null

  const submit = () => {
    if (parsed == null || parsed <= 0) return setError('Enter the value the client is buying at.')
    if (currency === 'USD' && (!Number.isFinite(rateNum) || rateNum <= 0))
      return setError('A USD deal needs the exchange rate on the day it closed.')
    onConfirm(parsed, currency, currency === 'USD' ? rateNum : null)
    setAmount('')
    setError(null)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Move to ${pending.stage.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Record the sale
          </Button>
        </>
      }
    >
      <Note tone="warn">
        <span className="font-semibold">“{pending.stage.name}” requires a deal value.</span> Add
        the figure the client is buying at to move this deal.
      </Note>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field
            label="Contracted value"
            required
            hint={
              property
                ? `${property.title} lists at ${formatMoneyWhole(property.list_price_minor)}`
                : 'The full value, not the deposit'
            }
          >
            <Input
              value={amount}
              autoFocus
              onChange={(e) => {
                setAmount(e.target.value)
                setError(null)
              }}
              placeholder={property ? String(property.list_price_minor / 100) : '60,000,000'}
            />
          </Field>
        </div>
        <Field label="Currency" required>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="NGN">NGN — Naira</option>
            <option value="USD">USD — US Dollars</option>
          </Select>
        </Field>
        {currency === 'USD' && (
          <Field label="Rate at close (₦ per $)" required hint="Frozen on this deal from now on">
            <Input value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
        )}
      </div>

      {ngnPreview != null && ngnPreview > 0 && (
        <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
          <div className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
            Will report as
          </div>
          <div className="tnum mt-0.5 font-display text-[22px] font-semibold text-ink-900">
            {formatMoneyWhole(ngnPreview)}
          </div>
          <p className="mt-1 text-[11.5px] text-ink-500">
            All reporting is in naira. {currency === 'USD' && 'This conversion is fixed at today’s rate.'}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Note tone="lost">{error}</Note>
        </div>
      )}
    </Modal>
  )
}
