/**
 * The contact book — the screen that makes contacts company property rather than
 * entries on somebody's phone.
 *
 * A table on a desktop and cards on a phone: the same data, laid out for the device,
 * because a salesperson looking someone up at the gate of a property is on a handset.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScopedData, activitiesForContact, channelsFor, dealsForContact, propertyById, userById } from '@/data/selectors'
import { contactName, dealNgnMinor } from '@/data/derive'
import { useStore } from '@/data/store'
import { checkManualDuplicate, type DedupeMatch } from '@/data/import/dedupe'
import { SOCIAL_KINDS, isSocialKind, type ChannelKind, type SocialKind } from '@/data/schema'
import { SOCIAL_META, socialDisplay, socialUrl } from '@/data/social'
import { LifecycleTrack, LifecycleJourney } from '@/components/Lifecycle'
import { contactsToCsv, contactsToVCard, downloadText } from '@/data/import/export'
import { formatPhone } from '@/data/phone'
import { formatMoneyCompact } from '@/data/money'
import { formatDate, formatDateShort, relativeTime, pluralize } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  CopyText,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Note,
  PageHeader,
  Select,
  Textarea,
  cx,
} from '@/components/ui'
import {
  ActivityTypeBadge,
  DelayBadge,
  SOURCE_LABEL,
  SourceBadge,
  StageBadge,
  StatusBadge,
  UserChip,
} from '@/components/domain'
import type { Contact, ContactSource } from '@/data/schema'

export default function Contacts() {
  const { db, scope, contacts } = useScopedData()
  const [query, setQuery] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [exportNote, setExportNote] = useState<string | null>(null)

  /** Export goes through whichever save route this environment allows. */
  const runExport = async (filename: string, text: string, mime: string) => {
    setExportNote(null)
    const ok = await downloadText(filename, text, mime)
    if (!ok) {
      setExportNote(
        'This view would not accept the file. Try again, or open the CRM in a browser tab to export.',
      )
    }
  }

  const owners = useMemo(
    () => db.users.filter((u) => scope.userIds.has(u.id) && contacts.some((c) => c.owner_user_id === u.id)),
    [db.users, scope.userIds, contacts],
  )

  const statuses = useMemo(
    () => [...new Set(contacts.map((c) => c.lifecycle_status_override ?? c.lifecycle_status))].filter(Boolean).sort(),
    [contacts],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts
      .filter((c) => {
        if (ownerFilter !== 'all' && c.owner_user_id !== ownerFilter) return false
        if (statusFilter !== 'all' && (c.lifecycle_status_override ?? c.lifecycle_status) !== statusFilter) return false
        if (sourceFilter !== 'all' && c.source !== sourceFilter) return false
        if (!q) return true
        if (contactName(c).toLowerCase().includes(q)) return true
        if (c.company?.toLowerCase().includes(q)) return true
        return channelsFor(db, c.id).some(
          (ch) => ch.value.toLowerCase().includes(q) || ch.value_normalized.includes(q.replace(/\D/g, '')),
        )
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [contacts, query, ownerFilter, statusFilter, sourceFilter, db])

  const open = openId ? db.contacts.find((c) => c.id === openId) : undefined

  return (
    <>
      <PageHeader
        eyebrow="Contacts"
        title="Contacts"
        description="Everyone the company is talking to, with every number and address they can be reached on, who owns the relationship and where they came from."
        actions={
          <>
            <Button
              size="sm"
              onClick={() =>
                runExport('flinx-contacts.csv', contactsToCsv(db, filtered), 'text/csv')
              }
            >
              Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() =>
                runExport('flinx-contacts.vcf', contactsToVCard(db, filtered), 'text/vcard')
              }
            >
              Export vCard
            </Button>
            <Link to="/contacts/import">
              <Button size="sm">Import</Button>
            </Link>
            <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
              + Add contact
            </Button>
          </>
        }
      />

      {exportNote && (
        <div className="mb-4">
          <Note tone="warn">{exportNote}</Note>
        </div>
      )}

      <Card className="mb-4" padded={false}>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company or any phone number…"
            aria-label="Search contacts"
          />
          <Select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="Filter by owner">
            <option value="all">All owners ({owners.length})</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
            <option value="all">Any status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} aria-label="Filter by source">
            <option value="all">Any source</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 px-3 py-2 text-[12px] text-ink-500">
          <span>
            {pluralize(filtered.length, 'contact')}
            {filtered.length !== contacts.length && ` of ${contacts.length} visible to you`}
          </span>
                  </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No contacts match"
          description="Try clearing the filters, or import a fresh batch from the latest campaign."
          action={
            <Link to="/contacts/import">
              <Button variant="primary" size="sm">
                Import contacts
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden lg:block" padded={false}>
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-ink-100 text-[11.5px] tracking-wide text-ink-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Name</th>
                  <th className="px-4 py-2.5 font-semibold">Contact details</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Source</th>
                  <th className="px-4 py-2.5 font-semibold">Owner</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Last touched</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.slice(0, 80).map((c) => {
                  const channels = channelsFor(db, c.id)
                  const phones = channels.filter((ch) => ch.kind !== 'email')
                  const emails = channels.filter((ch) => ch.kind === 'email')
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setOpenId(c.id)}
                      className="cursor-pointer transition-colors hover:bg-brand-50/50"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-ink-900">{contactName(c)}</div>
                        {c.company && <div className="truncate text-[12px] text-ink-400">{c.company}</div>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="tnum text-ink-700">{phones[0] ? formatPhone(phones[0].value_normalized) : '—'}</div>
                        <div className="truncate text-[12px] text-ink-400">
                          {emails[0]?.value ?? '—'}
                          {(phones.length > 1 || emails.length > 1) && (
                            <span className="ml-1 text-brand-600">
                              +{phones.length + emails.length - (emails[0] ? 2 : 1)} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge contact={c} />
                      </td>
                      <td className="px-4 py-2.5">
                        <SourceBadge contact={c} />
                        {c.source_detail && (
                          <div className="mt-0.5 max-w-[180px] truncate text-[11.5px] text-ink-400">
                            {c.source_detail}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <UserChip user={userById(db, c.owner_user_id)} size={20} />
                      </td>
                      <td className="px-4 py-2.5 text-right text-[12px] text-ink-400">
                        {relativeTime(c.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length > 80 && (
              <div className="border-t border-ink-100 px-4 py-2.5 text-center text-[12px] text-ink-400">
                Showing the 80 most recently touched of {filtered.length}. Narrow the filters to see more.
              </div>
            )}
          </Card>

          {/* Mobile cards */}
          <div className="flex flex-col gap-2 lg:hidden">
            {filtered.slice(0, 40).map((c) => {
              const phones = channelsFor(db, c.id).filter((ch) => ch.kind !== 'email')
              return (
                <button
                  key={c.id}
                  onClick={() => setOpenId(c.id)}
                  className="rounded-[--radius-card] border border-ink-100 bg-surface p-3.5 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-medium text-ink-900">{contactName(c)}</div>
                      <div className="tnum mt-0.5 text-[12.5px] text-ink-500">
                        {phones[0] ? formatPhone(phones[0].value_normalized) : 'No number'}
                      </div>
                    </div>
                    <StatusBadge contact={c} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <SourceBadge contact={c} />
                    <UserChip user={userById(db, c.owner_user_id)} size={18} />
                    <span className="ml-auto text-[11px] text-ink-400">{relativeTime(c.updated_at)}</span>
                  </div>
                </button>
              )
            })}
            {filtered.length > 40 && (
              <p className="py-2 text-center text-[12px] text-ink-400">
                Showing 40 of {filtered.length}. Use search to narrow.
              </p>
            )}
          </div>
        </>
      )}

      <ContactDetail contact={open} onClose={() => setOpenId(null)} />
      <AddContactModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={(id) => setOpenId(id)} />
    </>
  )
}

/* -------------------------------- detail ---------------------------------- */

function ContactDetail({ contact, onClose }: { contact: Contact | undefined; onClose: () => void }) {
  const { db } = useScopedData()
  const setStatusOverride = useStore((s) => s.setStatusOverride)
  const [tab, setTab] = useState<'timeline' | 'details'>('timeline')
  const [editing, setEditing] = useState(false)

  if (!contact) return null

  const channels = channelsFor(db, contact.id)
  const reachable = channels.filter((ch) => !isSocialKind(ch.kind))
  const socials = channels.filter((ch) => isSocialKind(ch.kind))
  const activities = activitiesForContact(db, contact.id)
  const deals = dealsForContact(db, contact.id)
  const owner = userById(db, contact.owner_user_id)
  const batch = db.import_batches.find((b) => b.id === contact.import_batch_id)

  // The lifecycle is shown against the deal that currently defines the status:
  // the most advanced open one, falling back to the most recent.
  const stageById = new Map(db.pipeline_stages.map((st) => [st.id, st]))
  const openDeals = deals.filter((d) => {
    const st = stageById.get(d.stage_id)
    return st && !st.is_won && !st.is_lost
  })
  const leadDeal =
    openDeals.sort(
      (a, b) => (stageById.get(b.stage_id)?.sort_order ?? 0) - (stageById.get(a.stage_id)?.sort_order ?? 0),
    )[0] ?? deals[0]

  return (
    <Drawer
      open
      onClose={onClose}
      title={contactName(contact)}
      subtitle={contact.company ?? 'Individual buyer'}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge contact={contact} />
        <SourceBadge contact={contact} />
        {contact.do_not_contact && <Badge tone="lost">Do not contact</Badge>}
        <Button size="sm" className="ml-auto" onClick={() => setEditing(true)}>
          Edit contact
        </Button>
      </div>

      {/* Where this person sits in the sales lifecycle. */}
      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink-800">Lifecycle</h3>
          {leadDeal && (
            <span className="text-[11.5px] text-ink-400">
              {propertyById(db, leadDeal.property_id)?.estate ?? 'No unit selected'}
            </span>
          )}
        </div>
        {leadDeal ? (
          <LifecycleTrack db={db} stageId={leadDeal.stage_id} deal={leadDeal} />
        ) : (
          <>
            <LifecycleTrack
              db={db}
              stageId={
                db.pipeline_stages.find(
                  (st) => st.name === (contact.lifecycle_status_override ?? contact.lifecycle_status),
                )?.id ?? [...db.pipeline_stages].sort((a, b) => a.sort_order - b.sort_order)[0].id
              }
            />
            <p className="mt-2 text-[11.5px] text-ink-400">
              No deal open yet — this reflects the status set on the contact.
            </p>
          </>
        )}
        {leadDeal && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <h4 className="mb-2 text-[12px] font-medium text-ink-600">How they got here</h4>
            <LifecycleJourney db={db} deal={leadDeal} />
          </div>
        )}
      </Card>

      {/* Channels — the reason they live in their own table */}
      <Card className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink-800">
            Reachable on {pluralize(reachable.length, 'number or address', 'numbers and addresses')}
          </h3>
        </div>
        <ul className="divide-y divide-ink-100">
          {reachable.map((ch) => (
            <li key={ch.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <Badge tone={ch.kind === 'email' ? 'info' : ch.kind === 'whatsapp' ? 'won' : 'neutral'}>
                {ch.label ?? ch.kind}
              </Badge>
              <span className="tnum min-w-0 flex-1 truncate text-[13px] text-ink-800">
                <CopyText value={ch.kind === 'email' ? ch.value : ch.value_normalized}>
                  {ch.kind === 'email' ? ch.value : formatPhone(ch.value_normalized)}
                </CopyText>
              </span>
              {ch.is_primary && <span className="text-[11px] text-ink-400">primary</span>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-400">
          Imports match against all of these, so the same number written differently is recognised
          as the same person.
        </p>
      </Card>

      <Card className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-semibold text-ink-800">Social profiles</h3>
          {socials.length > 0 && (
            <span className="text-[11.5px] text-ink-400">{pluralize(socials.length, 'profile')}</span>
          )}
        </div>
        {socials.length === 0 ? (
          <p className="text-[12.5px] text-ink-400">
            None linked yet. Add one from{' '}
            <button onClick={() => setEditing(true)} className="font-medium text-brand-700 underline">
              Edit contact
            </button>
            .
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {socials.map((ch) => {
              const kind = ch.kind as SocialKind
              return (
                <li key={ch.id}>
                  <a
                    href={socialUrl(kind, ch.value_normalized)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-surface px-2.5 py-1 text-[12.5px] text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800"
                  >
                    <span className="font-medium">{SOCIAL_META[kind].label}</span>
                    <span className="text-ink-500">{socialDisplay(kind, ch.value_normalized)}</span>
                    <span aria-hidden className="text-[10px] text-ink-400">↗</span>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Status control */}
      <Card className="mt-3">
        <h3 className="mb-1.5 text-[13px] font-semibold text-ink-800">Status</h3>
        <p className="mb-2.5 text-[12px] leading-relaxed text-ink-500">
          Follows this contact’s most advanced open deal. Set it by hand for someone who never
          reaches a deal — a flat “not interested” on the first call.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={contact.lifecycle_status_override ?? ''}
            onChange={(e) => setStatusOverride(contact.id, e.target.value || null)}
            className="max-w-[240px]"
            aria-label="Status override"
          >
            <option value="">Derived — {contact.lifecycle_status || 'no deals yet'}</option>
            {db.pipeline_stages.map((s) => (
              <option key={s.id} value={s.name}>
                Set by hand: {s.name}
              </option>
            ))}
          </Select>
          {contact.lifecycle_status_override && (
            <Button size="sm" onClick={() => setStatusOverride(contact.id, null)}>
              Clear override
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-4 flex gap-1 border-b border-ink-100">
        {(
          [
            ['timeline', `Activity (${activities.length})`],
            ['details', `Deals (${deals.length}) & record`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium',
              tab === id ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-500',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' ? (
        <div className="mt-3">
          {activities.length === 0 ? (
            <EmptyState title="Nothing logged against this contact yet" />
          ) : (
            <ol className="relative border-l border-ink-100 pl-4">
              {activities.map((a) => (
                <li key={a.id} className="relative pb-4 last:pb-0">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand-400" />
                  <div className="flex flex-wrap items-center gap-2">
                    <ActivityTypeBadge type={a.type} />
                    <span className="text-[12.5px] text-ink-500">{formatDate(a.occurred_at)}</span>
                    <DelayBadge activity={a} compact />
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-700">{a.notes}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-400">
                    <UserChip user={userById(db, a.user_id)} size={18} />
                    {a.property_id && <span>· {propertyById(db, a.property_id)?.title}</span>}
                    {a.outcome && <span>· {a.outcome}</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {deals.length === 0 ? (
            <EmptyState title="No deals yet" description="Interest often precedes a specific unit." />
          ) : (
            deals.map((d) => (
              <Card key={d.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink-900">{d.title}</div>
                    <div className="mt-0.5 text-[12px] text-ink-400">
                      {propertyById(db, d.property_id)?.location ?? 'No unit selected'} · opened{' '}
                      {formatDateShort(d.created_at)}
                    </div>
                  </div>
                  <StageBadge db={db} stageId={d.stage_id} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="tnum text-[15px] font-semibold text-ink-900">
                    {formatMoneyCompact(dealNgnMinor(d))}
                  </span>
                  {d.currency === 'USD' && (
                    <Badge tone="info" title="Rate frozen at close so historical totals never shift">
                      ${(d.amount_minor / 100).toLocaleString('en-NG')} @ ₦{d.fx_rate_to_ngn}
                    </Badge>
                  )}
                </div>
              </Card>
            ))
          )}

          <Card>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-800">Record</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-ink-400">Owner</dt>
              <dd className="text-ink-800">{owner?.full_name ?? '—'}</dd>
              <dt className="text-ink-400">Source</dt>
              <dd className="text-ink-800">
                {SOURCE_LABEL[contact.source]}
                {contact.source_detail && <span className="text-ink-500"> · {contact.source_detail}</span>}
              </dd>
              {batch && (
                <>
                  <dt className="text-ink-400">Imported in</dt>
                  <dd className="text-ink-800">
                    {batch.filename} · {formatDate(batch.uploaded_at)}
                  </dd>
                </>
              )}
              <dt className="text-ink-400">Created</dt>
              <dd className="text-ink-800">{formatDate(contact.created_at)}</dd>
              <dt className="text-ink-400">Last updated</dt>
              <dd className="text-ink-800">{formatDate(contact.updated_at)}</dd>
            </dl>
            {contact.notes && (
              <p className="mt-3 border-t border-ink-100 pt-2.5 text-[12.5px] leading-relaxed text-ink-600">
                {contact.notes}
              </p>
            )}
          </Card>
        </div>
      )}

      <EditContactModal
        open={editing}
        onClose={() => setEditing(false)}
        contact={contact}
      />
    </Drawer>
  )
}

/* ------------------------------ editing ----------------------------------- */

/**
 * Editing a contact.
 *
 * Names, company and notes are a straight patch. Channels are handled one at a time
 * through their own actions, because each carries a normalised dedupe key that has
 * to be recomputed rather than edited — and because removing the primary number has
 * to promote a replacement rather than leave the record unreachable.
 */
function EditContactModal({
  open,
  onClose,
  contact,
}: {
  open: boolean
  onClose: () => void
  contact: Contact
}) {
  const { db, scope } = useScopedData()
  const { updateContact, addChannel, updateChannel, removeChannel, setPrimaryChannel } = useStore()

  const [form, setForm] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name,
    company: contact.company ?? '',
    notes: contact.notes ?? '',
    source: contact.source,
    source_detail: contact.source_detail ?? '',
    owner_user_id: contact.owner_user_id,
    do_not_contact: contact.do_not_contact,
  })
  const [newKind, setNewKind] = useState<ChannelKind>('phone')
  const [newValue, setNewValue] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [warning, setWarning] = useState<string | null>(null)

  // Re-seed the form whenever a different contact is opened.
  const [loadedFor, setLoadedFor] = useState(contact.id)
  if (loadedFor !== contact.id) {
    setLoadedFor(contact.id)
    setForm({
      first_name: contact.first_name,
      last_name: contact.last_name,
      company: contact.company ?? '',
      notes: contact.notes ?? '',
      source: contact.source,
      source_detail: contact.source_detail ?? '',
      owner_user_id: contact.owner_user_id,
      do_not_contact: contact.do_not_contact,
    })
  }

  if (!open) return null

  const channels = channelsFor(db, contact.id)
  const assignable = db.users.filter((u) => scope.userIds.has(u.id) && u.role !== 'super_admin')

  const save = () => {
    if (!form.first_name.trim()) return
    updateContact(contact.id, {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      company: form.company.trim() || null,
      notes: form.notes.trim() || null,
      source: form.source,
      source_detail: form.source_detail.trim() || null,
      owner_user_id: form.owner_user_id,
      do_not_contact: form.do_not_contact,
    })
    onClose()
  }

  const addNew = () => {
    const value = newValue.trim()
    if (!value) return
    // A new number or address might already belong to somebody else — say so rather
    // than quietly creating a second route to the same person.
    if (!isSocialKind(newKind)) {
      const dup = checkManualDuplicate(db, [{ kind: newKind, value }])
      if (dup && dup.contactId !== contact.id) {
        setWarning(`${dup.matchedValue} is already on file against ${dup.contactName}. Added here anyway.`)
      } else {
        setWarning(null)
      }
    }
    addChannel(contact.id, { kind: newKind, value, label: newLabel.trim() || null })
    setNewValue('')
    setNewLabel('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${contactName(contact)}`}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={save} disabled={!form.first_name.trim()}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" required>
          <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
        </Field>
        <Field label="Last name">
          <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </Field>
        <Field label="Owner">
          <Select
            value={form.owner_user_id}
            onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
          >
            {assignable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source">
          <Select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as ContactSource })}
          >
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Campaign / detail">
          <Input
            value={form.source_detail}
            onChange={(e) => setForm({ ...form, source_detail: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px] text-ink-700">
        <input
          type="checkbox"
          checked={form.do_not_contact}
          onChange={(e) => setForm({ ...form, do_not_contact: e.target.checked })}
          className="h-4 w-4 accent-[--color-brand-600]"
        />
        Do not contact
      </label>

      {/* Channels are saved as you go, so they are separated from the form above. */}
      <div className="mt-5 border-t border-ink-100 pt-4">
        <h3 className="text-[13px] font-semibold text-ink-800">Numbers, addresses & profiles</h3>
        <p className="mt-0.5 mb-2.5 text-[12px] text-ink-400">
          Changes here save immediately.
        </p>

        <ul className="divide-y divide-ink-100">
          {channels.map((ch) => {
            const social = isSocialKind(ch.kind)
            return (
              <li key={ch.id} className="flex flex-wrap items-center gap-2 py-2 first:pt-0">
                <Badge tone={social ? 'brand' : ch.kind === 'email' ? 'info' : 'neutral'}>
                  {social ? SOCIAL_META[ch.kind as SocialKind].label : (ch.label ?? ch.kind)}
                </Badge>
                <Input
                  value={ch.value}
                  onChange={(e) => updateChannel(ch.id, { value: e.target.value })}
                  className="min-w-[160px] flex-1"
                  aria-label={`Value for ${ch.label ?? ch.kind}`}
                />
                {!social && (
                  <button
                    onClick={() => setPrimaryChannel(ch.id)}
                    disabled={ch.is_primary}
                    className={cx(
                      'rounded px-2 py-1 text-[11.5px] font-medium',
                      ch.is_primary ? 'text-ink-400' : 'text-brand-700 hover:bg-brand-50',
                    )}
                  >
                    {ch.is_primary ? 'primary' : 'make primary'}
                  </button>
                )}
                <button
                  onClick={() => removeChannel(ch.id)}
                  className="rounded px-2 py-1 text-[11.5px] font-medium text-lost hover:bg-lost-soft"
                  aria-label={`Remove ${ch.value}`}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_auto]">
          <Select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as ChannelKind)}
            aria-label="Type of contact detail to add"
          >
            <option value="phone">Phone</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            {SOCIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {SOCIAL_META[k].label}
              </option>
            ))}
          </Select>
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNew()}
            placeholder={
              isSocialKind(newKind)
                ? `${SOCIAL_META[newKind as SocialKind].base}handle — or just the handle`
                : newKind === 'email'
                  ? 'name@example.com'
                  : '0803 123 4567'
            }
            aria-label="New contact detail"
          />
          <Button onClick={addNew} disabled={!newValue.trim()}>
            Add
          </Button>
        </div>
        {!isSocialKind(newKind) && (
          <div className="mt-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label — Mobile, Work, Personal (optional)"
              aria-label="Label for the new contact detail"
            />
          </div>
        )}

        {warning && (
          <div className="mt-3">
            <Note tone="warn">{warning}</Note>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------ manual add -------------------------------- */

/**
 * Adding one contact by hand runs the same dedupe the bulk import runs (R-CON-10).
 * The check is deliberately not silent — it shows who the match is and lets the
 * person decide, rather than either blocking them or quietly creating a twin.
 */
function AddContactModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { db, scope } = useScopedData()
  const createContact = useStore((s) => s.createContact)
  const viewer = scope.viewer

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    company: '',
    phone: '',
    phone2: '',
    email: '',
    source: 'referral' as ContactSource,
    source_detail: '',
    notes: '',
    owner_user_id: viewer.role === 'salesperson' ? viewer.id : '',
  })
  const [duplicate, setDuplicate] = useState<DedupeMatch | null>(null)
  const [checked, setChecked] = useState(false)

  const assignable = db.users.filter((u) => scope.userIds.has(u.id) && u.role !== 'super_admin')

  const runCheck = () => {
    const match = checkManualDuplicate(db, [
      { kind: 'phone', value: form.phone },
      { kind: 'phone', value: form.phone2 },
      { kind: 'email', value: form.email },
    ])
    setDuplicate(match)
    setChecked(true)
    return match
  }

  const submit = () => {
    if (!checked) {
      const match = runCheck()
      if (match) return // let them see it before committing
    }
    const id = createContact({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      company: form.company.trim() || null,
      owner_user_id: form.owner_user_id || viewer.id,
      source: form.source,
      source_detail: form.source_detail.trim() || null,
      notes: form.notes.trim() || null,
      channels: [
        { kind: 'phone', value: form.phone, label: 'Mobile' },
        { kind: 'phone', value: form.phone2, label: 'Alternate' },
        { kind: 'email', value: form.email, label: 'Email' },
      ],
    })
    onClose()
    onCreated(id)
    setForm({ ...form, first_name: '', last_name: '', company: '', phone: '', phone2: '', email: '', notes: '' })
    setChecked(false)
    setDuplicate(null)
  }

  const valid = form.first_name.trim() && (form.phone.trim() || form.email.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a contact"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {duplicate ? 'Add anyway' : 'Check and save'}
          </Button>
        </>
      }
    >
      <Note>
        New contacts are checked against everyone already on file before they are saved.
      </Note>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="First name" required>
          <Input
            value={form.first_name}
            onChange={(e) => {
              setForm({ ...form, first_name: e.target.value })
              setChecked(false)
            }}
          />
        </Field>
        <Field label="Last name">
          <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
        </Field>
        <Field label="Phone" hint="Any format — it is normalised before matching">
          <Input
            value={form.phone}
            placeholder="0803 123 4567"
            onChange={(e) => {
              setForm({ ...form, phone: e.target.value })
              setChecked(false)
              setDuplicate(null)
            }}
            onBlur={runCheck}
          />
        </Field>
        <Field label="Alternate phone">
          <Input
            value={form.phone2}
            onChange={(e) => {
              setForm({ ...form, phone2: e.target.value })
              setChecked(false)
            }}
            onBlur={runCheck}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => {
              setForm({ ...form, email: e.target.value })
              setChecked(false)
            }}
            onBlur={runCheck}
          />
        </Field>
        <Field label="Company">
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </Field>
        <Field label="Source" required>
          <Select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as ContactSource })}
          >
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Campaign / detail">
          <Input
            value={form.source_detail}
            placeholder="e.g. Meta — Wells IV Aug 2026"
            onChange={(e) => setForm({ ...form, source_detail: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Owner" hint="Every contact has an owning salesperson">
            <Select
              value={form.owner_user_id}
              onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
            >
              <option value="">{viewer.full_name} (you)</option>
              {assignable
                .filter((u) => u.id !== viewer.id)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="What they are looking for, budget, timing…"
            />
          </Field>
        </div>
      </div>

      {duplicate && (
        <div className="mt-3">
          <Note tone="warn">
            <span className="font-semibold">Already on file.</span> This matches{' '}
            <span className="font-semibold">{duplicate.contactName}</span> on{' '}
            <span className="tnum">{duplicate.matchedValue}</span>, owned by{' '}
            {userById(db, duplicate.ownerUserId)?.full_name}. Saving anyway will create a second
            record for the same person.
          </Note>
        </div>
      )}
      {checked && !duplicate && (
        <div className="mt-3">
          <Note tone="won">No match found — this is a new person.</Note>
        </div>
      )}
    </Modal>
  )
}
