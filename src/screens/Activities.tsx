/**
 * Activity logging.
 *
 * The screen is built around one idea: a claim of five meetings should be five
 * records, each naming a client, each carrying what was actually discussed, and each
 * carrying two timestamps. The entry timestamp is set by the server and is shown
 * read-only, because without that the whole measure is decorative.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useScopedData, contactById, propertyById, userById } from '@/data/selectors'
import { contactName, loggingDelayDays, averageLoggingDelayDays } from '@/data/derive'
import { useStore } from '@/data/store'
import { formatDate, formatDateTime, formatDuration, toDateTimeLocal, fromDateTimeLocal, pluralize } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Note,
  PageHeader,
  Select,
  StatTile,
  Tabs,
  Textarea,
  cx,
} from '@/components/ui'
import { ACTIVITY_LABEL, ActivityTypeBadge, DelayBadge, UserChip } from '@/components/domain'
import type { ActivityType } from '@/data/schema'

const TYPES: ActivityType[] = ['inspection', 'meeting', 'call', 'whatsapp', 'note']

export default function Activities() {
  const { db, scope, activities, contacts } = useScopedData()
  const [params, setParams] = useSearchParams()
  const [logOpen, setLogOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [range, setRange] = useState<'30' | '90' | 'all'>('30')
  const [lateOnly, setLateOnly] = useState(false)

  useEffect(() => {
    if (params.get('log') === '1') {
      setLogOpen(true)
      params.delete('log')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const owners = db.users.filter((u) => scope.userIds.has(u.id) && activities.some((a) => a.user_id === u.id))

  const filtered = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 864e5
    return activities
      .filter((a) => {
        if (new Date(a.occurred_at).getTime() < cutoff) return false
        if (typeFilter !== 'all' && a.type !== typeFilter) return false
        if (ownerFilter !== 'all' && a.user_id !== ownerFilter) return false
        if (lateOnly && loggingDelayDays(a) < 5) return false
        return true
      })
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
  }, [activities, range, typeFilter, ownerFilter, lateOnly])

  const avgDelay = averageLoggingDelayDays(filtered)
  const lateCount = filtered.filter((a) => loggingDelayDays(a) >= 5).length

  /** Group by the day the work happened, so the timeline reads like a diary. */
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const a of filtered) {
      const key = a.occurred_at.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    return [...map.entries()].slice(0, 40)
  }, [filtered])

  return (
    <>
      <PageHeader
        eyebrow="Activity"
        title="Activity"
        description="Inspections, meetings and conversations, each logged against a named client with what was discussed and when it happened."
        actions={
          <Button variant="primary" size="sm" onClick={() => setLogOpen(true)}>
            + Log activity
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Records in view" value={filtered.length.toLocaleString('en-NG')} sub={rangeLabel(range)} />
        <StatTile
          label="Inspections"
          value={filtered.filter((a) => a.type === 'inspection').length}
          sub="Each one references the unit inspected"
        />
        <StatTile
          label="Average logging delay"
          value={`${avgDelay.toFixed(1)}d`}
          tone={avgDelay < 1 ? 'won' : avgDelay < 3 ? 'warn' : 'lost'}
          sub="Between the work happening and it being recorded"
        />
        <StatTile
          label="Entered 5+ days late"
          value={lateCount}
          tone={lateCount === 0 ? 'won' : 'warn'}
          sub={
            <button onClick={() => setLateOnly((v) => !v)} className="font-medium text-brand-700 underline">
              {lateOnly ? 'show everything' : 'show only these'}
            </button>
          }
        />
      </div>

      <Card className="mt-4 mb-4" padded={false}>
        <div className="grid gap-2 p-3 sm:grid-cols-3">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as never)} aria-label="Filter by type">
            <option value="all">All activity types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABEL[t]}
              </option>
            ))}
          </Select>
          <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="Filter by person">
            <option value="all">Everyone in your view ({owners.length})</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
          <Select value={range} onChange={(e) => setRange(e.target.value as never)} aria-label="Date range">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-3 py-2 text-[12px] text-ink-500">
          <span>{pluralize(filtered.length, 'record')} · {scope.label}</span>
                  </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing logged in this range"
          description="Widen the date range, or log the work you did today."
          action={
            <Button variant="primary" size="sm" onClick={() => setLogOpen(true)}>
              Log activity
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-3">
                <h3 className="text-[13px] font-semibold text-ink-700">{formatDate(day)}</h3>
                <span className="h-px flex-1 bg-ink-100" />
                <span className="text-[12px] text-ink-400">{pluralize(items.length, 'record')}</span>
              </div>
              <div className="space-y-2">
                {items.map((a) => {
                  const delay = loggingDelayDays(a)
                  const contact = contactById(db, a.contact_id)
                  const property = propertyById(db, a.property_id)
                  return (
                    <Card
                      key={a.id}
                      className={cx(delay >= 5 && 'border-warn/30 bg-warn-soft/40')}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <ActivityTypeBadge type={a.type} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-medium text-ink-900">{contactName(contact)}</div>
                          <div className="text-[12px] text-ink-400">
                            {property && <>{property.title} · </>}
                            {formatDuration(a.duration_minutes) && <>{formatDuration(a.duration_minutes)} · </>}
                            {a.outcome}
                          </div>
                        </div>
                        <UserChip user={userById(db, a.user_id)} size={22} />
                      </div>

                      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-700">{a.notes}</p>

                      {/* The two timestamps, side by side. This is the whole point. */}
                      <div className="mt-3 grid gap-2 rounded-lg border border-ink-100 bg-ink-50/60 p-2.5 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                        <div>
                          <div className="text-[10.5px] font-semibold tracking-wide text-ink-400 uppercase">
                            Happened
                          </div>
                          <div className="tnum text-[12.5px] text-ink-700">{formatDateTime(a.occurred_at)}</div>
                        </div>
                        <div>
                          <div className="text-[10.5px] font-semibold tracking-wide text-ink-400 uppercase">
                            Entered
                          </div>
                          <div className="tnum text-[12.5px] text-ink-700">{formatDateTime(a.logged_at)}</div>
                        </div>
                        <DelayBadge activity={a} />
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
          {filtered.length > grouped.reduce((s, [, items]) => s + items.length, 0) && (
            <p className="text-center text-[12px] text-ink-400">
              Showing the most recent 40 days of activity. Narrow the filters to see further back.
            </p>
          )}
        </div>
      )}

      <LogActivityModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        contactOptions={contacts}
      />
    </>
  )
}

function rangeLabel(range: string) {
  return range === 'all' ? 'All time' : `Last ${range} days`
}

/* ------------------------------ logging form ------------------------------- */

function LogActivityModal({
  open,
  onClose,
  contactOptions,
}: {
  open: boolean
  onClose: () => void
  contactOptions: { id: string; first_name: string; last_name: string }[]
}) {
  const { db, scope } = useScopedData()
  const logActivity = useStore((s) => s.logActivity)
  const viewer = scope.viewer

  const [tab, setTab] = useState<ActivityType>('inspection')
  const [contactId, setContactId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocal(new Date()))
  const [duration, setDuration] = useState('')
  const [outcome, setOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const selling = db.properties.filter((p) => p.status !== 'sold')
  const occurredDate = new Date(occurredAt)
  const projectedDelay = Math.max(0, (Date.now() - occurredDate.getTime()) / 864e5)

  const submit = () => {
    if (!contactId) return setError('Every activity has to name a client. That is the point of the record.')
    if (notes.trim().length < 10) return setError('Add what was actually discussed — “met client” is not a record.')
    if (tab === 'inspection' && !propertyId) return setError('An inspection has to say which unit was inspected.')
    if (occurredDate.getTime() > Date.now()) return setError('This is a log of work done, not a diary entry. Pick a time that has already passed.')

    logActivity({
      type: tab,
      contact_id: contactId,
      deal_id: db.deals.find((d) => d.contact_id === contactId)?.id ?? null,
      property_id: tab === 'inspection' ? propertyId : propertyId || null,
      user_id: viewer.id,
      occurred_at: fromDateTimeLocal(occurredAt),
      duration_minutes: duration ? Number(duration) : null,
      outcome: outcome.trim() || null,
      notes: notes.trim(),
    })

    setContactId('')
    setPropertyId('')
    setNotes('')
    setOutcome('')
    setDuration('')
    setOccurredAt(toDateTimeLocal(new Date()))
    setError(null)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log activity"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Save record
          </Button>
        </>
      }
    >
      <Tabs
        tabs={TYPES.map((t) => ({ id: t, label: ACTIVITY_LABEL[t] }))}
        active={tab}
        onChange={(t) => {
          setTab(t)
          setError(null)
        }}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Client" required hint="Every activity names a client — a claim of five meetings is five named records">
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">Choose a contact…</option>
              {contactOptions
                .slice()
                .sort((a, b) => a.first_name.localeCompare(b.first_name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Property"
            required={tab === 'inspection'}
            hint={tab === 'inspection' ? 'An inspection references the unit inspected' : 'Optional for anything other than an inspection'}
          >
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">{tab === 'inspection' ? 'Choose the unit inspected…' : 'No specific unit'}</option>
              {selling.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} — {p.location}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="When did it happen" required>
          <Input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>

        <Field label="How long" hint="Minutes — optional">
          <Input
            type="number"
            min={0}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={tab === 'inspection' ? '60' : '15'}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Outcome" hint="A short summary line">
            <Input
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder={tab === 'inspection' ? 'Interested — wants a second viewing' : 'Call back next week'}
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Discussion notes" required hint="The substance, not just that it happened">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What did they ask about? What did you promise? What is the next step?"
            />
          </Field>
        </div>
      </div>

      {/* The entry timestamp is not a field. That is deliberate and worth saying out loud. */}
      <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10.5px] font-semibold tracking-wide text-ink-400 uppercase">
              Entered at — set by the system
            </div>
            <div className="tnum mt-0.5 text-[13px] text-ink-700">{formatDateTime(new Date().toISOString())}</div>
          </div>
          {projectedDelay >= 1 && (
            <Badge tone={projectedDelay >= 5 ? 'lost' : 'warn'}>
              This will record as {Math.round(projectedDelay)} days late
            </Badge>
          )}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
          You set when the activity took place. The time it was entered is recorded automatically
          and cannot be changed.
        </p>
      </div>

      {error && (
        <div className="mt-3">
          <Note tone="lost">{error}</Note>
        </div>
      )}
    </Modal>
  )
}
