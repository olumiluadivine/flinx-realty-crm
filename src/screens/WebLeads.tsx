/**
 * Website enquiries.
 *
 * Leads captured by the forms on flinxrealtyltd.com, routed to a salesperson on
 * arrival so first-response time is measurable from the moment of submission.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScopedData, userById } from '@/data/selectors'
import { useStore } from '@/data/store'
import { formatPhone } from '@/data/phone'
import { formatDateTime, pluralize, relativeTime } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  StatTile,
  Tabs,
  cx,
} from '@/components/ui'
import { UserChip } from '@/components/domain'
import type { WebLead } from '@/data/schema'

const FORM_LABEL: Record<WebLead['form'], string> = {
  apartment_availability: 'Apartment Availability',
  unit_availability: 'Unit Availability',
  inspection_booking: 'Inspection booking',
  contact: 'Contact form',
}

export default function WebLeads() {
  const { db, scope } = useScopedData()
  const { routeWebLead, convertWebLead, simulateWebLead } = useStore()
  const [tab, setTab] = useState<'inbox' | 'routed' | 'all'>('inbox')
  const [justAdded, setJustAdded] = useState<string | null>(null)

  const leads = db.web_leads
    .slice()
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())

  const unrouted = leads.filter((l) => !l.routed_to_user_id)
  const routed = leads.filter((l) => l.routed_to_user_id)
  const list = tab === 'inbox' ? unrouted : tab === 'routed' ? routed : leads

  const assignable = db.users.filter((u) => scope.userIds.has(u.id) && u.role !== 'super_admin')

  /** First-response time, measured from the moment the enquiry was submitted. */
  const responseStats = useMemo(() => {
    const answered = routed.filter((l) => l.first_response_at)
    if (answered.length === 0) return { median: null as number | null, answered: 0, awaiting: routed.length }
    const mins = answered
      .map((l) => (new Date(l.first_response_at!).getTime() - new Date(l.submitted_at).getTime()) / 60000)
      .sort((a, b) => a - b)
    return {
      median: mins[Math.floor(mins.length / 2)],
      answered: answered.length,
      awaiting: routed.length - answered.length,
    }
  }, [routed])

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="Enquiries from flinxrealtyltd.com"
        description="Leads from the availability and inspection-booking forms, carrying the unit type, budget, project and timeline the enquirer gave — and the campaign that brought them in."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setJustAdded(simulateWebLead())}
          >
            Simulate an enquiry
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Awaiting routing"
          value={unrouted.length}
          tone={unrouted.length > 0 ? 'lost' : 'won'}
          sub="Nobody has picked these up"
        />
        <StatTile label="Routed" value={routed.length} sub={`${responseStats.awaiting} still awaiting a first response`} />
        <StatTile
          label="Median first response"
          value={responseStats.median == null ? '—' : formatMinutes(responseStats.median)}
          tone={responseStats.median != null && responseStats.median < 120 ? 'won' : 'warn'}
          sub="Measured from the moment of submission"
        />
        <StatTile
          label="Converted to contacts"
          value={leads.filter((l) => l.contact_id).length}
          sub="Now in Contacts, with their source recorded"
          tone="brand"
        />
      </div>

      {unrouted.length > 0 && (
        <Card className="mt-4 border-lost/25 bg-lost-soft">
          <div className="flex flex-wrap items-start gap-3">
            <span aria-hidden className="text-lg leading-none text-lost">
              ⚑
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-lost">
                {pluralize(unrouted.length, 'enquiry', 'enquiries')} with nobody assigned
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-lost/90">
                The oldest has been waiting {relativeTime(unrouted[unrouted.length - 1].submitted_at)}.
                Assign them to a salesperson so the response clock starts.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-4 mb-4">
        <Tabs
          tabs={[
            { id: 'inbox' as const, label: 'Needs routing', count: unrouted.length },
            { id: 'routed' as const, label: 'Routed', count: routed.length },
            { id: 'all' as const, label: 'All enquiries', count: leads.length },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={tab === 'inbox' ? 'Everything has been routed' : 'No enquiries yet'}
          description="Press “Simulate an enquiry” to see one arrive."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.map((lead) => {
            const owner = userById(db, lead.routed_to_user_id)
            const responseMins = lead.first_response_at
              ? (new Date(lead.first_response_at).getTime() - new Date(lead.submitted_at).getTime()) / 60000
              : null
            return (
              <Card key={lead.id} className={cx(lead.id === justAdded && 'ring-2 ring-brand-500')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-ink-900">{lead.full_name}</div>
                    <div className="tnum mt-0.5 text-[12.5px] text-ink-500">
                      {formatPhone(lead.phone)} · {lead.email}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge tone={lead.routed_to_user_id ? 'brand' : 'lost'}>
                      {lead.routed_to_user_id ? 'Routed' : 'Unassigned'}
                    </Badge>
                    <div className="mt-1 text-[11px] text-ink-400">{relativeTime(lead.submitted_at)}</div>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-ink-50/70 p-2.5 text-[12px]">
                  <Detail label="Form" value={FORM_LABEL[lead.form]} />
                  <Detail label="Project interest" value={lead.project_interest} />
                  <Detail label="Unit type" value={lead.apartment_type} />
                  <Detail label="Budget" value={lead.budget_band} />
                  <Detail label="Timeline" value={lead.timeline} />
                  <Detail label="Prefers" value={lead.preferred_channel} />
                  {lead.preferred_dates && <Detail label="Preferred dates" value={lead.preferred_dates} />}
                </dl>

                {lead.message && (
                  <p className="mt-2.5 border-l-2 border-ink-200 pl-2.5 text-[12.5px] leading-relaxed text-ink-600 italic">
                    “{lead.message}”
                  </p>
                )}

                {/* Attribution — spend traced to closed sales, not to clicks. */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                  <Badge tone="info">{lead.page}</Badge>
                  {lead.campaign && <Badge tone="gold">{lead.campaign}</Badge>}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
                  {lead.routed_to_user_id ? (
                    <>
                      <UserChip user={owner} size={22} />
                      {responseMins != null ? (
                        <Badge tone={responseMins < 120 ? 'won' : 'warn'}>
                          Responded in {formatMinutes(responseMins)}
                        </Badge>
                      ) : (
                        <Badge tone="warn">Awaiting first response</Badge>
                      )}
                    </>
                  ) : (
                    <Select
                      value=""
                      onChange={(e) => e.target.value && routeWebLead(lead.id, e.target.value)}
                      className="max-w-[220px]"
                      aria-label={`Route ${lead.full_name} to a salesperson`}
                    >
                      <option value="">Route to a salesperson…</option>
                      {assignable.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </Select>
                  )}

                  {lead.contact_id ? (
                    <Link to="/contacts" className="ml-auto text-[12.5px] font-medium text-brand-700 hover:underline">
                      In the contact book →
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => convertWebLead(lead.id)}
                      disabled={!lead.routed_to_user_id}
                      title={lead.routed_to_user_id ? 'Create a contact from this enquiry' : 'Route it to someone first'}
                    >
                      Create contact
                    </Button>
                  )}
                </div>

                {lead.routed_at && (
                  <div className="mt-1.5 text-[11px] text-ink-400">
                    Submitted {formatDateTime(lead.submitted_at)} · routed {formatDateTime(lead.routed_at)}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

    </>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] tracking-wide text-ink-400 uppercase">{label}</dt>
      <dd className="truncate text-[12.5px] text-ink-700 capitalize">{value}</dd>
    </div>
  )
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`
  if (mins < 60 * 24) return `${(mins / 60).toFixed(1)}h`
  return `${(mins / 60 / 24).toFixed(1)}d`
}
