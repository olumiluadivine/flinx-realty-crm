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

  if (!contact) return null

  const channels = channelsFor(db, contact.id)
  const activities = activitiesForContact(db, contact.id)
  const deals = dealsForContact(db, contact.id)
  const owner = userById(db, contact.owner_user_id)
  const batch = db.import_batches.find((b) => b.id === contact.import_batch_id)

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
        <span className="ml-auto text-[12px] text-ink-400">Added {formatDate(contact.created_at)}</span>
      </div>

      {/* Channels — the reason they live in their own table */}
      <Card className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-ink-800">
            Reachable on {pluralize(channels.length, 'number or address')}
          </h3>
        </div>
        <ul className="divide-y divide-ink-100">
          {channels.map((ch) => (
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
    </Drawer>
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
