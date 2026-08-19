/**
 * Bulk import.
 *
 * Built around the fact that this is a *recurring* operation, not a one-time
 * migration — every ad campaign brings a fresh batch. So: a preview before anything
 * is written, a permanent record of what each upload did, and an undo.
 */
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useScopedData, userById } from '@/data/selectors'
import { useStore } from '@/data/store'
import { parseImportFile, type ParseResult } from '@/data/import/parse'
import { countCrossOwnerMerges, planImport, type ImportPlan } from '@/data/import/dedupe'
import { formatPhone } from '@/data/phone'
import { formatDateTime, pluralize } from '@/lib/format'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Note,
  PageHeader,
  SectionHeading,
  Select,
  cx,
} from '@/components/ui'
import { SOURCE_LABEL } from '@/components/domain'
import type { ContactSource } from '@/data/schema'
import { makeSampleCsv, makeSampleVcf } from '@/data/import/samples'
import { downloadText } from '@/data/import/export'

type Phase = 'drop' | 'preview' | 'done'

export default function ContactImport() {
  const { db, scope } = useScopedData()
  const commitImport = useStore((s) => s.commitImport)
  const revertImportBatch = useStore((s) => s.revertImportBatch)
  const viewer = scope.viewer

  const [phase, setPhase] = useState<Phase>('drop')
  const [dragging, setDragging] = useState(false)
  const [filename, setFilename] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [source, setSource] = useState<ContactSource>('ad_campaign')
  const [sourceDetail, setSourceDetail] = useState('')
  const [ownerId, setOwnerId] = useState(viewer.role === 'salesperson' ? viewer.id : '')
  const [committedBatchId, setCommittedBatchId] = useState<string | null>(null)
  const [showRows, setShowRows] = useState<'all' | 'create' | 'merge' | 'fail'>('all')
  const fileInput = useRef<HTMLInputElement>(null)

  const plan: ImportPlan | null = useMemo(
    () => (parsed ? planImport(db, parsed.rows) : null),
    [db, parsed],
  )
  const crossOwner = plan ? countCrossOwnerMerges(plan, ownerId || viewer.id) : 0

  const assignable = db.users.filter((u) => scope.userIds.has(u.id) && u.role !== 'super_admin')

  const ingest = async (file: File) => {
    const text = await file.text()
    loadText(file.name, text)
  }

  const loadText = (name: string, text: string) => {
    const result = parseImportFile(name, text)
    setFilename(name)
    setParsed(result)
    setPhase('preview')
    setCommittedBatchId(null)
    if (!sourceDetail) {
      setSourceDetail(result.format === 'vcard' ? `Personal phone — ${viewer.full_name}` : '')
    }
    if (result.format === 'vcard') setSource('phone_import')
  }

  const commit = () => {
    if (!plan || !parsed) return
    const id = commitImport(plan, {
      filename,
      format: parsed.format,
      uploaded_by: viewer.id,
      source,
      source_detail: sourceDetail.trim() || null,
      owner_user_id: ownerId || viewer.id,
    })
    setCommittedBatchId(id)
    setPhase('done')
  }

  const reset = () => {
    setPhase('drop')
    setParsed(null)
    setFilename('')
    setCommittedBatchId(null)
  }

  const batches = [...db.import_batches].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
  )

  const visibleRows =
    plan?.rows.filter((r) => showRows === 'all' || r.outcome === showRows) ?? []

  return (
    <>
      <PageHeader
        eyebrow="Contacts · Import"
        title="Import a batch of leads"
        description="Bring in a list from a campaign or a phone export. Review what the file will do to your contacts before any of it is saved."
        actions={
          <Link to="/contacts">
            <Button size="sm">Back to contacts</Button>
          </Link>
        }
      />

      {phase === 'drop' && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files[0]
              if (file) void ingest(file)
            }}
            className={cx(
              'rounded-[--radius-card] border-2 border-dashed px-6 py-14 text-center transition-colors',
              dragging ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-surface',
            )}
          >
            <div aria-hidden className="text-3xl">
              ⇩
            </div>
            <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">
              Drop a CSV or vCard file here
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-500">
              A spreadsheet, or a <span className="font-mono text-[12px]">.vcf</span> export from a
              phone. Nothing is saved until you have reviewed the preview.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" size="sm" onClick={() => fileInput.current?.click()}>
                Choose a file
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.vcf,.vcard,text/csv,text/vcard"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void ingest(file)
                }}
              />
              <Button size="sm" onClick={() => loadText('meta-leads-sample.csv', makeSampleCsv(db))}>
                Use sample CSV
              </Button>
              <Button size="sm" onClick={() => loadText('phone-export-sample.vcf', makeSampleVcf(db))}>
                Use sample vCard
              </Button>
            </div>
            <p className="mt-3 text-[11.5px] text-ink-400">
              The sample files include people already on file, written differently.{' '}
              <button
                className="underline hover:text-ink-600"
                onClick={() => void downloadText('flinx-sample-leads.csv', makeSampleCsv(db), 'text/csv')}
              >
                Download the CSV
              </button>{' '}
              to try dragging a real file in.
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ['Phone number first', 'Numbers are matched in a single standard form, so “0803 123 4567” and “+2348031234567” are recognised as one person.'],
              ['Then email', 'Checked only when no number matches, since an address can be shared between people.'],
              ['Ownership is kept', 'When a row matches a contact someone else owns, the new details are added and the owner stays as they are.'],
            ].map(([title, body]) => (
              <Card key={title}>
                <div className="text-[13px] font-semibold text-ink-800">{title}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{body}</p>
              </Card>
            ))}
          </div>
        </>
      )}

      {phase === 'preview' && plan && parsed && (
        <>
          <Card className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={parsed.format === 'vcard' ? 'info' : 'brand'}>
                    {parsed.format === 'vcard' ? 'vCard' : 'CSV'}
                  </Badge>
                  <span className="truncate font-medium text-ink-900">{filename}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-500">
                  {pluralize(plan.rows.length, 'row')} read. Nothing has been written yet.
                </p>
              </div>
              <Button size="sm" onClick={reset}>
                Choose a different file
              </Button>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Will be created"
              value={plan.created}
              tone="won"
              active={showRows === 'create'}
              onClick={() => setShowRows(showRows === 'create' ? 'all' : 'create')}
            />
            <StatCard
              label="Will merge into existing"
              value={plan.merged}
              tone="info"
              active={showRows === 'merge'}
              onClick={() => setShowRows(showRows === 'merge' ? 'all' : 'merge')}
            />
            <StatCard
              label="Cannot be used"
              value={plan.failed}
              tone="lost"
              active={showRows === 'fail'}
              onClick={() => setShowRows(showRows === 'fail' ? 'all' : 'fail')}
            />
          </div>

          {crossOwner > 0 && (
            <div className="mt-3">
              <Note tone="warn">
                <span className="font-semibold">
                  {pluralize(crossOwner, 'row matches a contact', 'rows match contacts')} owned by
                  another salesperson.
                </span>{' '}
                The extra details will be added and the existing owner will be left unchanged.
              </Note>
            </div>
          )}

          <Card className="mt-4">
            <SectionHeading
              title="Where these leads came from"
              subtitle="Recorded against every contact this batch creates, so you can trace which campaigns produce sales."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Source" required>
                <Select value={source} onChange={(e) => setSource(e.target.value as ContactSource)}>
                  {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Campaign / detail">
                <Input
                  value={sourceDetail}
                  onChange={(e) => setSourceDetail(e.target.value)}
                  placeholder="e.g. Meta — Wells IV Aug 2026"
                />
              </Field>
              <Field label="Assign new contacts to" hint="Existing contacts keep their current owner">
                <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
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
          </Card>

          <Card className="mt-4" padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
              <h3 className="text-[13.5px] font-semibold text-ink-900">
                Row-by-row preview
                {showRows !== 'all' && (
                  <button onClick={() => setShowRows('all')} className="ml-2 text-[12px] font-normal text-brand-700 underline">
                    show all {plan.rows.length}
                  </button>
                )}
              </h3>
            </div>
            <div className="scroll-slim max-h-[460px] overflow-y-auto">
              <ul className="divide-y divide-ink-100">
                {visibleRows.map((planned, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                    <Badge
                      tone={planned.outcome === 'create' ? 'won' : planned.outcome === 'merge' ? 'info' : 'lost'}
                    >
                      {planned.outcome === 'create' ? 'New' : planned.outcome === 'merge' ? 'Merge' : 'Failed'}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium text-ink-900">
                        {`${planned.row.first_name} ${planned.row.last_name}`.trim() || (
                          <span className="text-ink-400 italic">no name in row</span>
                        )}
                        {planned.row.company && (
                          <span className="ml-2 text-[12px] font-normal text-ink-400">
                            {planned.row.company}
                          </span>
                        )}
                      </div>
                      <div className="tnum mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-ink-500">
                        {planned.row.channels.map((ch) => (
                          <span key={ch.normalized}>
                            {ch.kind === 'email' ? ch.value : formatPhone(ch.normalized)}
                          </span>
                        ))}
                      </div>
                      <div
                        className={cx(
                          'mt-1 text-[12px] leading-snug',
                          planned.outcome === 'fail' ? 'text-lost' : 'text-ink-400',
                        )}
                      >
                        {planned.reason}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button onClick={reset}>Cancel</Button>
            <Button variant="primary" onClick={commit} disabled={plan.created + plan.merged === 0}>
              Import {pluralize(plan.created + plan.merged, 'row')}
            </Button>
          </div>
        </>
      )}

      {phase === 'done' && committedBatchId && (
        <Card className="border-won/25 bg-won-soft">
          <div className="flex flex-wrap items-start gap-3">
            <span aria-hidden className="text-xl leading-none text-won">
              ✓
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-semibold text-won">Batch imported</h2>
              <p className="mt-1 text-[13px] text-won/90">
                {(() => {
                  const b = db.import_batches.find((x) => x.id === committedBatchId)
                  return b
                    ? `${b.rows_created} created, ${b.rows_merged} merged into existing contacts, ${b.rows_failed} could not be used.`
                    : ''
                })()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/contacts">
                  <Button size="sm" variant="primary">
                    See the contacts
                  </Button>
                </Link>
                <Button size="sm" onClick={reset}>
                  Import another file
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Batch history */}
      <div className="mt-8">
        <SectionHeading
          title="Import history"
          subtitle="Every upload is kept, and can be undone if a batch turns out to be wrong."
        />
        {batches.length === 0 ? (
          <EmptyState title="No imports yet" />
        ) : (
          <Card padded={false}>
            <ul className="divide-y divide-ink-100">
              {batches.map((b) => {
                const stillPresent = db.contacts.filter((c) => c.import_batch_id === b.id).length
                return (
                  <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Badge tone={b.format === 'vcard' ? 'info' : 'brand'}>{b.format.toUpperCase()}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink-900">{b.filename}</div>
                      <div className="text-[12px] text-ink-400">
                        {formatDateTime(b.uploaded_at)} · {userById(db, b.uploaded_by)?.full_name}
                        {b.source_detail && ` · ${b.source_detail}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="won">{b.rows_created} created</Badge>
                      <Badge tone="info">{b.rows_merged} merged</Badge>
                      {b.rows_failed > 0 && <Badge tone="lost">{b.rows_failed} failed</Badge>}
                    </div>
                    {b.reverted_at ? (
                      <Badge tone="neutral">Undone {formatDateTime(b.reverted_at)}</Badge>
                    ) : stillPresent > 0 ? (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          if (
                            confirm(
                              `Undo this batch?\n\nThe ${stillPresent} contacts it created will be removed, along with any deals and activity logged against them. Details merged into contacts that already existed are left untouched.`,
                            )
                          ) {
                            revertImportBatch(b.id)
                          }
                        }}
                      >
                        Undo batch
                      </Button>
                    ) : (
                      <span className="text-[12px] text-ink-400">Nothing left to undo</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </div>
    </>
  )
}

function StatCard({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: 'won' | 'info' | 'lost'
  active: boolean
  onClick: () => void
}) {
  const tones = {
    won: 'text-won',
    info: 'text-info',
    lost: 'text-lost',
  }
  return (
    <button
      onClick={onClick}
      className={cx(
        'rounded-[--radius-card] border bg-surface p-4 text-left transition-colors',
        active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-ink-100 hover:border-ink-200',
      )}
    >
      <div className="text-[12px] font-medium text-ink-500">{label}</div>
      <div className={cx('tnum mt-1 font-display text-[26px] leading-none font-semibold', tones[tone])}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-ink-400">{active ? 'showing these' : 'click to filter'}</div>
    </button>
  )
}
