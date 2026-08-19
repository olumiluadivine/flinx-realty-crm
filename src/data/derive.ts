/**
 * Values that are computed, never stored loose.
 *
 * Everything here exists because storing the number instead would let it drift from
 * the records behind it — a contact status that disagrees with its deals, an
 * outstanding balance that disagrees with its payments.
 */
import { toNgnMinor } from './money'
import type {
  Activity,
  Contact,
  Currency,
  Database,
  Deal,
  DealPayment,
  DealScheduleItem,
  Id,
  PipelineStage,
} from './schema'

export const DAY_MS = 24 * 60 * 60 * 1000

/* -------------------------------------------------------------------------
 * Contact lifecycle status (R-PIP-6)
 * ----------------------------------------------------------------------- */

/**
 * Status = the manual override if one is set, otherwise the most advanced *open*
 * deal by stage sort order, otherwise the first stage.
 *
 * "Most advanced" deliberately ignores closed deals: a repeat buyer who bought last
 * year and is now browsing again is an active prospect, not a closed one.
 */
export function deriveContactStatus(db: Database, contactId: Id): string {
  const contact = db.contacts.find((c) => c.id === contactId)
  if (!contact) return ''
  if (contact.lifecycle_status_override) return contact.lifecycle_status_override

  const stageById = new Map(db.pipeline_stages.map((s) => [s.id, s]))
  const openStages = db.deals
    .filter((d) => d.contact_id === contactId)
    .map((d) => stageById.get(d.stage_id))
    .filter((s): s is PipelineStage => !!s && !s.is_won && !s.is_lost)

  if (openStages.length > 0) {
    return openStages.reduce((best, s) => (s.sort_order > best.sort_order ? s : best)).name
  }

  // No open deals — fall back to the most advanced closed one so a buyer still reads as a buyer.
  const closedStages = db.deals
    .filter((d) => d.contact_id === contactId)
    .map((d) => stageById.get(d.stage_id))
    .filter((s): s is PipelineStage => !!s)
  if (closedStages.length > 0) {
    return closedStages.reduce((best, s) => (s.sort_order > best.sort_order ? s : best)).name
  }

  const first = [...db.pipeline_stages].sort((a, b) => a.sort_order - b.sort_order)[0]
  return first?.name ?? ''
}

/** Recompute the denormalised column for every contact touched by a deal change. */
export function recomputeContactStatuses(db: Database, contactIds: Id[]): void {
  for (const id of new Set(contactIds)) {
    const contact = db.contacts.find((c) => c.id === id)
    if (!contact) continue
    contact.lifecycle_status = deriveContactStatus(db, id)
  }
}

/* -------------------------------------------------------------------------
 * Money in the reporting base (R-CUR-2/3)
 * ----------------------------------------------------------------------- */

/** A deal's value in NGN, at the rate frozen on the deal. */
export function dealNgnMinor(deal: Deal): number {
  return toNgnMinor(deal.amount_minor, deal.currency, deal.fx_rate_to_ngn)
}

/** A payment's value in NGN, at the rate frozen on that tranche (R-PAY-6). */
export function paymentNgnMinor(payment: DealPayment): number {
  return toNgnMinor(payment.amount_minor, payment.currency, payment.fx_rate_to_ngn)
}

export function isWon(db: Database, deal: Deal): boolean {
  return !!db.pipeline_stages.find((s) => s.id === deal.stage_id)?.is_won
}

export function isLost(db: Database, deal: Deal): boolean {
  return !!db.pipeline_stages.find((s) => s.id === deal.stage_id)?.is_lost
}

export function isOpen(db: Database, deal: Deal): boolean {
  const stage = db.pipeline_stages.find((s) => s.id === deal.stage_id)
  return !!stage && !stage.is_won && !stage.is_lost
}

/**
 * Total sold, in NGN. Reads the won flag off the stage, never the stage's name —
 * renaming "Closed" must not break the sales report (R-PIP-9).
 */
export function totalSoldNgnMinor(db: Database, deals: Deal[]): number {
  return deals.filter((d) => isWon(db, d)).reduce((sum, d) => sum + dealNgnMinor(d), 0)
}

export function openPipelineNgnMinor(db: Database, deals: Deal[]): number {
  return deals.filter((d) => isOpen(db, d)).reduce((sum, d) => sum + dealNgnMinor(d), 0)
}

/* -------------------------------------------------------------------------
 * Logging delay (R-ACT-4 / R-REP-6) — the accountability measure
 * ----------------------------------------------------------------------- */

/**
 * Days between an activity happening and someone typing it in. This is the number
 * the client actually asked for: it separates records kept as work happens from a
 * batch back-filled the night before a review.
 */
export function loggingDelayDays(activity: Activity): number {
  const delta = new Date(activity.logged_at).getTime() - new Date(activity.occurred_at).getTime()
  return Math.max(0, delta / DAY_MS)
}

export function averageLoggingDelayDays(activities: Activity[]): number {
  if (activities.length === 0) return 0
  return activities.reduce((sum, a) => sum + loggingDelayDays(a), 0) / activities.length
}

export type DelayBand = 'same_day' | 'next_day' | 'few_days' | 'late'

export function delayBand(days: number): DelayBand {
  if (days < 1) return 'same_day'
  if (days < 2) return 'next_day'
  if (days < 5) return 'few_days'
  return 'late'
}

/**
 * A back-fill is several activities for different days all typed in within one short
 * session. Flagging the pattern — not just the average — is what makes "I had five
 * meetings" checkable.
 */
export function detectBackfillBursts(
  activities: Activity[],
  opts: { windowHours?: number; minCount?: number; minDelayDays?: number } = {},
): { loggedAt: string; count: number; activities: Activity[] }[] {
  const windowMs = (opts.windowHours ?? 3) * 60 * 60 * 1000
  const minCount = opts.minCount ?? 4
  const minDelayDays = opts.minDelayDays ?? 3

  const late = activities
    .filter((a) => loggingDelayDays(a) >= minDelayDays)
    .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime())

  const bursts: { loggedAt: string; count: number; activities: Activity[] }[] = []
  let current: Activity[] = []

  for (const a of late) {
    if (current.length === 0) {
      current = [a]
      continue
    }
    const gap = new Date(a.logged_at).getTime() - new Date(current[0].logged_at).getTime()
    if (gap <= windowMs) {
      current.push(a)
    } else {
      if (current.length >= minCount) {
        bursts.push({ loggedAt: current[0].logged_at, count: current.length, activities: current })
      }
      current = [a]
    }
  }
  if (current.length >= minCount) {
    bursts.push({ loggedAt: current[0].logged_at, count: current.length, activities: current })
  }
  return bursts
}

/* -------------------------------------------------------------------------
 * Time in stage (R-PIP-7)
 * ----------------------------------------------------------------------- */

export function daysInCurrentStage(db: Database, deal: Deal, asOf = new Date()): number {
  const moves = db.deal_stage_history
    .filter((h) => h.deal_id === deal.id)
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())
  const since = moves[0]?.changed_at ?? deal.created_at
  return Math.max(0, (asOf.getTime() - new Date(since).getTime()) / DAY_MS)
}

/* -------------------------------------------------------------------------
 * Payment ledger — add-on §9. All derived, never stored (R-PAY-2/9/10).
 * ----------------------------------------------------------------------- */

/** Payments net of reversals. A reversal cancels the payment it points at. */
export function effectivePayments(db: Database, dealId: Id): DealPayment[] {
  const all = db.deal_payments.filter((p) => p.deal_id === dealId)
  const reversed = new Set(all.map((p) => p.reverses_payment_id).filter(Boolean) as Id[])
  return all.filter((p) => p.reverses_payment_id === null && !reversed.has(p.id))
}

export function paidNgnMinor(db: Database, dealId: Id): number {
  return effectivePayments(db, dealId).reduce((sum, p) => sum + paymentNgnMinor(p), 0)
}

/** Outstanding = deal value − payments received. Derived, so it cannot drift (R-PAY-2). */
export function outstandingNgnMinor(db: Database, deal: Deal): number {
  return Math.max(0, dealNgnMinor(deal) - paidNgnMinor(db, deal.id))
}

export function isFullyPaid(db: Database, deal: Deal): boolean {
  return dealNgnMinor(deal) > 0 && paidNgnMinor(db, deal.id) >= dealNgnMinor(deal)
}

/**
 * Closed sub-status becomes computed once the ledger exists (R-PAY-10) — a deal whose
 * payments equal its value is fully paid by definition, nobody should be setting that
 * by hand.
 */
export function derivedPaymentStatus(db: Database, deal: Deal): 'awaiting' | 'part_payment' | 'fully_paid' {
  const paid = paidNgnMinor(db, deal.id)
  if (paid <= 0) return 'awaiting'
  return paid >= dealNgnMinor(deal) ? 'fully_paid' : 'part_payment'
}

export interface OverdueItem {
  item: DealScheduleItem
  deal: Deal
  daysOverdue: number
  amountNgnMinor: number
}

/**
 * Overdue = schedule rows past their due date that the payments received so far do
 * not cover. Instalments are settled in sequence, so a buyer who has paid enough to
 * cover instalments 0–2 is not overdue on 1 even if the reference doesn't match.
 */
export function overdueSchedule(db: Database, deals: Deal[], asOf = new Date()): OverdueItem[] {
  const out: OverdueItem[] = []
  for (const deal of deals) {
    const items = db.deal_schedule
      .filter((s) => s.deal_id === deal.id)
      .sort((a, b) => a.sequence - b.sequence)
    if (items.length === 0) continue
    let credit = paidNgnMinor(db, deal.id)
    for (const item of items) {
      const itemNgn = toNgnMinor(item.amount_minor, item.currency, deal.fx_rate_to_ngn)
      if (credit >= itemNgn) {
        credit -= itemNgn
        continue
      }
      const shortfall = itemNgn - credit
      credit = 0
      const due = new Date(`${item.due_on}T00:00:00`)
      if (due < asOf) {
        out.push({
          item,
          deal,
          daysOverdue: Math.floor((asOf.getTime() - due.getTime()) / DAY_MS),
          amountNgnMinor: shortfall,
        })
      }
    }
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue)
}

export type AgeingBucket = '0-30' | '31-60' | '61-90' | '90+'

export function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 30) return '0-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

/** What is contractually due to arrive in each of the coming months (R-PAY-8). */
export function expectedInflowByMonth(
  db: Database,
  deals: Deal[],
  months: number,
  from = new Date(),
): { month: string; label: string; amountNgnMinor: number; itemCount: number }[] {
  const dealById = new Map(deals.map((d) => [d.id, d]))
  const buckets = new Map<string, { amountNgnMinor: number; itemCount: number }>()
  const start = new Date(from.getFullYear(), from.getMonth(), 1)

  const keys: string[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    keys.push(key)
    buckets.set(key, { amountNgnMinor: 0, itemCount: 0 })
  }

  for (const item of db.deal_schedule) {
    const deal = dealById.get(item.deal_id)
    if (!deal) continue
    const key = item.due_on.slice(0, 7)
    const bucket = buckets.get(key)
    if (!bucket) continue
    bucket.amountNgnMinor += toNgnMinor(item.amount_minor, item.currency, deal.fx_rate_to_ngn)
    bucket.itemCount += 1
  }

  return keys.map((key) => {
    const [y, m] = key.split('-').map(Number)
    return {
      month: key,
      label: new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      amountNgnMinor: buckets.get(key)!.amountNgnMinor,
      itemCount: buckets.get(key)!.itemCount,
    }
  })
}

/* -------------------------------------------------------------------------
 * Small shared helpers
 * ----------------------------------------------------------------------- */

export function contactName(contact: Contact | undefined): string {
  return contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Unknown contact'
}

export function currencyOf(deal: Deal): Currency {
  return deal.currency
}
