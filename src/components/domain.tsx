/** Domain-specific display pieces shared across screens. */
import { delayBand, loggingDelayDays } from '@/data/derive'
import { formatDelay, formatDelayShort } from '@/lib/format'
import type { Activity, ActivityType, Contact, Database, Property, User } from '@/data/schema'
import { Avatar, Badge, cx } from './ui'
import { STATUS } from './charts'

/* ------------------------------- activities -------------------------------- */

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  inspection: 'Inspection',
  meeting: 'Meeting',
  call: 'Call',
  whatsapp: 'WhatsApp',
  note: 'Note',
}

export const ACTIVITY_ICON: Record<ActivityType, string> = {
  inspection: '🏠',
  meeting: '🤝',
  call: '📞',
  whatsapp: '💬',
  note: '📝',
}

export function ActivityTypeBadge({ type }: { type: ActivityType }) {
  const tone = type === 'inspection' ? 'brand' : type === 'meeting' ? 'info' : 'neutral'
  return (
    <Badge tone={tone}>
      <span aria-hidden>{ACTIVITY_ICON[type]}</span>
      {ACTIVITY_LABEL[type]}
    </Badge>
  )
}

/**
 * The gap between doing the work and recording it.
 *
 * This badge is the visible form of R-ACT-4, and the reason the client wants the
 * system at all: five meetings logged as they happened and five logged the night
 * before a review look identical on one timestamp, and completely different on two.
 */
export function DelayBadge({ activity, compact }: { activity: Activity; compact?: boolean }) {
  const days = loggingDelayDays(activity)
  const band = delayBand(days)
  const tone = band === 'same_day' ? 'won' : band === 'next_day' ? 'neutral' : band === 'few_days' ? 'warn' : 'lost'
  return (
    <Badge tone={tone} title={`Happened ${new Date(activity.occurred_at).toLocaleString('en-GB')} · entered ${new Date(activity.logged_at).toLocaleString('en-GB')}`}>
      {compact ? formatDelayShort(days) : formatDelay(days)}
    </Badge>
  )
}

/** Colour for a person's average logging delay. Always shipped with a label. */
export function delayStatusColor(days: number): string {
  if (days < 1) return STATUS.good
  if (days < 2.5) return STATUS.warning
  if (days < 5) return STATUS.serious
  return STATUS.critical
}

export function delayStatusLabel(days: number): string {
  if (days < 1) return 'Same day'
  if (days < 2.5) return 'Next day'
  if (days < 5) return 'Several days'
  return 'Back-filled'
}

/* --------------------------------- pipeline -------------------------------- */

export function StageBadge({ db, stageId }: { db: Database; stageId: string }) {
  const stage = db.pipeline_stages.find((s) => s.id === stageId)
  if (!stage) return <Badge>Unknown</Badge>
  const tone = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'neutral'
  return <Badge tone={tone}>{stage.name}</Badge>
}

/** A contact's lifecycle status — derived unless someone has overridden it. */
export function StatusBadge({ contact }: { contact: Contact }) {
  const overridden = !!contact.lifecycle_status_override
  const value = contact.lifecycle_status_override ?? contact.lifecycle_status
  const tone = value === 'Closed' ? 'won' : value === 'Not interested' ? 'lost' : 'neutral'
  return (
    <Badge tone={tone} title={overridden ? 'Set by hand — overrides the value derived from this contact’s deals' : 'Derived from the most advanced open deal'}>
      {value || '—'}
      {overridden && <span className="opacity-60">·&nbsp;set by hand</span>}
    </Badge>
  )
}

export const SOURCE_LABEL: Record<string, string> = {
  ad_campaign: 'Ad campaign',
  referral: 'Referral',
  walk_in: 'Walk-in',
  phone_import: 'Phone import',
  website: 'Website',
}

export function SourceBadge({ contact }: { contact: Contact }) {
  return (
    <Badge tone={contact.source === 'website' ? 'info' : 'neutral'} title={contact.source_detail ?? undefined}>
      {SOURCE_LABEL[contact.source] ?? contact.source}
    </Badge>
  )
}

/* ---------------------------------- people --------------------------------- */

export function UserChip({ user, size = 22 }: { user: User | undefined; size?: number }) {
  if (!user) return <span className="text-[13px] text-ink-400">Unassigned</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Avatar name={user.full_name} hue={user.hue} size={size} />
      <span className="truncate text-[13px] text-ink-700">{user.full_name}</span>
    </span>
  )
}

export const ROLE_LABEL: Record<User['role'], string> = {
  super_admin: 'Super admin',
  team_lead: 'Team lead',
  salesperson: 'Salesperson',
}

export function RoleBadge({ role }: { role: User['role'] }) {
  const tone = role === 'super_admin' ? 'gold' : role === 'team_lead' ? 'brand' : 'neutral'
  return <Badge tone={tone}>{ROLE_LABEL[role]}</Badge>
}

/* -------------------------------- properties ------------------------------- */

/**
 * An abstract tile keyed to the development, not a photograph. The demo shouldn't
 * put invented imagery next to a real building the client is actually selling.
 */
export function PropertyTile({
  property,
  size = 40,
  className,
}: {
  property: Property | undefined
  size?: number
  className?: string
}) {
  if (!property) return null
  const h = property.tint
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center rounded-lg font-display font-semibold', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(140deg, hsl(${h} 38% 88%), hsl(${(h + 28) % 360} 32% 78%))`,
        color: `hsl(${h} 45% 24%)`,
      }}
      aria-hidden
    >
      {property.estate.slice(0, 2).toUpperCase()}
    </span>
  )
}

export function PropertyStatusBadge({ status }: { status: Property['status'] }) {
  const tone = status === 'available' ? 'won' : status === 'reserved' ? 'warn' : 'neutral'
  const label = status === 'available' ? 'Now selling' : status === 'reserved' ? 'Reserved' : 'Sold out'
  return <Badge tone={tone}>{label}</Badge>
}
