/**
 * Company settings — mostly, the pipeline editor.
 *
 * The client said the stage list is still under discussion and will change. That is
 * why stages are rows rather than an enum, and why this screen exists: adding,
 * renaming or reordering a stage is data entry, not a release. Rename "Closed" here
 * and the sales report keeps working, because reporting reads the won flag.
 */
import { useState } from 'react'
import { useScopedData } from '@/data/selectors'
import { useStore } from '@/data/store'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Note,
  PageHeader,
  SectionHeading,
  StatTile,
  Tabs,
  Toggle,
  cx,
} from '@/components/ui'
import { NoAccess } from '@/components/AppShell'
import { RoleBadge, UserChip } from '@/components/domain'
import { pluralize } from '@/lib/format'
import { formatMoneyWhole } from '@/data/money'

type Tab = 'pipeline' | 'people' | 'company' | 'plans'

export default function Settings() {
  const { db, scope } = useScopedData()
  const [tab, setTab] = useState<Tab>('pipeline')

  if (scope.viewer.role !== 'super_admin') {
    return <NoAccess what="Company settings" />
  }

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Pipeline, people and company-wide preferences."
      />

      <div className="mb-4">
        <Tabs
          tabs={[
            { id: 'pipeline' as const, label: 'Pipeline stages', count: db.pipeline_stages.length },
            { id: 'people' as const, label: 'People & teams', count: db.users.length },
            { id: 'plans' as const, label: 'Payment plans', count: db.payment_plans.length },
            { id: 'company' as const, label: 'Company' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'pipeline' && <PipelineSettings />}
      {tab === 'people' && <PeopleSettings />}
      {tab === 'plans' && <PlansSettings />}
      {tab === 'company' && <CompanySettingsTab />}
    </>
  )
}

/* -------------------------------- pipeline --------------------------------- */

function PipelineSettings() {
  const { db } = useScopedData()
  const { updateStage, deleteStage, moveStage, addStage, addSubStatus, deleteSubStatus } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newStage, setNewStage] = useState({ name: '', is_won: false, is_lost: false, requires_amount: false })
  const [subDraft, setSubDraft] = useState<Record<string, string>>({})

  const stages = [...db.pipeline_stages].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      <Note>
        Changes here take effect immediately across the deal board, the reports and contact
        statuses. Reporting follows the <span className="font-semibold">won</span> and{' '}
        <span className="font-semibold">lost</span> flags below rather than stage names, so a stage
        can be renamed safely.
      </Note>

      {error && (
        <div className="mt-3">
          <Note tone="lost">{error}</Note>
        </div>
      )}

      <div className="mt-4 mb-3 flex items-center justify-between gap-3">
        <SectionHeading title="Stages" subtitle={`${stages.length} stages, in pipeline order`} />
        <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
          + Add stage
        </Button>
      </div>

      <div className="space-y-2">
        {stages.map((stage, i) => {
          const held = db.deals.filter((d) => d.stage_id === stage.id).length
          const subs = db.pipeline_sub_statuses
            .filter((s) => s.stage_id === stage.id)
            .sort((a, b) => a.sort_order - b.sort_order)
          return (
            <Card key={stage.id}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveStage(stage.id, -1)}
                    disabled={i === 0}
                    className="rounded px-1.5 text-[11px] text-ink-400 hover:bg-ink-50 disabled:opacity-30"
                    aria-label={`Move ${stage.name} earlier`}
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveStage(stage.id, 1)}
                    disabled={i === stages.length - 1}
                    className="rounded px-1.5 text-[11px] text-ink-400 hover:bg-ink-50 disabled:opacity-30"
                    aria-label={`Move ${stage.name} later`}
                  >
                    ▼
                  </button>
                </div>

                <div className="min-w-[180px] flex-1">
                  <Input
                    value={stage.name}
                    onChange={(e) => updateStage(stage.id, { name: e.target.value })}
                    aria-label={`Name of stage ${stage.name}`}
                    className="font-medium"
                  />
                  <div className="mt-1.5 text-[11.5px] text-ink-400">
                    {held > 0 ? pluralize(held, 'deal') + ' currently here' : 'No deals in this stage'}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <FlagToggle
                    label="Won"
                    checked={stage.is_won}
                    onChange={(v) => updateStage(stage.id, { is_won: v, is_lost: v ? false : stage.is_lost })}
                    hint="Counts as a sale in every report"
                  />
                  <FlagToggle
                    label="Lost"
                    checked={stage.is_lost}
                    onChange={(v) => updateStage(stage.id, { is_lost: v, is_won: v ? false : stage.is_won })}
                    hint="Closed without a sale"
                  />
                  <FlagToggle
                    label="Needs value"
                    checked={stage.requires_amount}
                    onChange={(v) => updateStage(stage.id, { requires_amount: v })}
                    hint="Cannot be entered without a deal amount"
                  />
                </div>

                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const result = deleteStage(stage.id)
                    setError(result.ok ? null : (result.reason ?? 'Could not delete this stage.'))
                  }}
                  title={held > 0 ? 'A stage holding deals cannot be deleted' : 'Delete this stage'}
                >
                  Delete
                </Button>
              </div>

              {/* Sub-statuses hang off any stage, not just Closed. */}
              <div className="mt-3 border-t border-ink-100 pt-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12px] font-medium text-ink-600">Sub-statuses</span>
                  <span className="text-[11.5px] text-ink-400">
                    {stage.is_won ? 'the money trail after the handshake' : 'optional breakdown within this stage'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {subs.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded-full bg-ink-50 py-0.5 pr-1.5 pl-2.5 text-[12px] text-ink-700 ring-1 ring-ink-200 ring-inset"
                    >
                      {s.name}
                      <button
                        onClick={() => deleteSubStatus(s.id)}
                        className="text-ink-400 hover:text-lost"
                        aria-label={`Remove ${s.name}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const name = (subDraft[stage.id] ?? '').trim()
                      if (!name) return
                      addSubStatus({ stage_id: stage.id, name, sort_order: (subs.at(-1)?.sort_order ?? 0) + 10 })
                      setSubDraft({ ...subDraft, [stage.id]: '' })
                    }}
                    className="flex items-center gap-1"
                  >
                    <input
                      value={subDraft[stage.id] ?? ''}
                      onChange={(e) => setSubDraft({ ...subDraft, [stage.id]: e.target.value })}
                      placeholder="Add sub-status…"
                      className="w-36 rounded-full border border-dashed border-ink-200 bg-surface px-2.5 py-1 text-[12px] focus:border-brand-500 focus:outline-none"
                      aria-label={`Add a sub-status to ${stage.name}`}
                    />
                  </form>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a pipeline stage"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!newStage.name.trim()}
              onClick={() => {
                addStage({
                  name: newStage.name.trim(),
                  sort_order: (db.pipeline_stages.at(-1)?.sort_order ?? 0) + 10,
                  is_won: newStage.is_won,
                  is_lost: newStage.is_lost,
                  requires_amount: newStage.requires_amount,
                  description: null,
                })
                setNewStage({ name: '', is_won: false, is_lost: false, requires_amount: false })
                setAddOpen(false)
              }}
            >
              Add stage
            </Button>
          </>
        }
      >
        <Field label="Stage name" required>
          <Input
            value={newStage.name}
            onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
            placeholder="e.g. Offer made"
            autoFocus
          />
        </Field>
        <div className="mt-4 space-y-3">
          <Toggle
            label="Counts as won"
            description="Deals in this stage are treated as sales by every report."
            checked={newStage.is_won}
            onChange={(v) => setNewStage({ ...newStage, is_won: v, is_lost: v ? false : newStage.is_lost })}
          />
          <Toggle
            label="Counts as lost"
            description="Closed without a sale."
            checked={newStage.is_lost}
            onChange={(v) => setNewStage({ ...newStage, is_lost: v, is_won: v ? false : newStage.is_won })}
          />
          <Toggle
            label="Requires a deal value"
            description="A deal cannot enter this stage until an amount is recorded."
            checked={newStage.requires_amount}
            onChange={(v) => setNewStage({ ...newStage, requires_amount: v })}
          />
        </div>
      </Modal>
    </>
  )
}

function FlagToggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      title={hint}
      className={cx(
        'rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors',
        checked ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-200 bg-surface text-ink-400',
      )}
    >
      {checked ? '✓ ' : ''}
      {label}
    </button>
  )
}

/* --------------------------------- people ---------------------------------- */

function PeopleSettings() {
  const { db } = useScopedData()
  const { toggleMembership, setPrimaryTeam, updateSettings } = useStore()

  return (
    <>
      <Card className="mb-4">
        <Toggle
          label="Allow a salesperson to belong to more than one team"
          description="Lets a salesperson work under more than one sales manager."
          checked={db.settings.allow_multi_team}
          onChange={(v) => updateSettings({ allow_multi_team: v })}
        />
        <div className="mt-3 border-t border-ink-100 pt-3">
          <Note tone="neutral">
            One team is always marked <span className="font-semibold">primary</span>. Company
            totals count each salesperson once, under that team, while both managers still see
            their work.
          </Note>
        </div>
      </Card>

      {db.teams.map((team) => {
        const memberships = db.team_memberships.filter((m) => m.team_id === team.id && m.left_at === null)
        return (
          <Card key={team.id} className="mb-3">
            <SectionHeading
              title={team.name}
              subtitle={`Led by ${db.users.find((u) => u.id === team.lead_user_id)?.full_name}`}
            />
            <ul className="divide-y divide-ink-100">
              {memberships.map((m) => {
                const user = db.users.find((u) => u.id === m.user_id)!
                const otherTeams = db.team_memberships.filter(
                  (x) => x.user_id === user.id && x.left_at === null,
                ).length
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <UserChip user={user} size={26} />
                    <RoleBadge role={user.role} />
                    {m.is_primary ? (
                      <Badge tone="brand">Primary — numbers roll up here</Badge>
                    ) : (
                      <Button size="sm" onClick={() => setPrimaryTeam(user.id, team.id)}>
                        Make primary
                      </Button>
                    )}
                    {otherTeams > 1 && <Badge tone="gold">On {otherTeams} teams</Badge>}
                    <span className="ml-auto text-[11.5px] text-ink-400">
                      {db.contacts.filter((c) => c.owner_user_id === user.id).length} contacts
                    </span>
                  </li>
                )
              })}
            </ul>

            {db.settings.allow_multi_team && (
              <div className="mt-3 border-t border-ink-100 pt-3">
                <div className="mb-1.5 text-[12px] font-medium text-ink-600">Add someone to this team</div>
                <div className="flex flex-wrap gap-1.5">
                  {db.users
                    .filter(
                      (u) =>
                        u.role === 'salesperson' &&
                        !memberships.some((m) => m.user_id === u.id),
                    )
                    .map((u) => (
                      <Button key={u.id} size="sm" onClick={() => toggleMembership(u.id, team.id)}>
                        + {u.full_name}
                      </Button>
                    ))}
                </div>
              </div>
            )}
          </Card>
        )
      })}

      <Card>
        <SectionHeading title="All users" subtitle="Everyone with access, and what they can see." />
        <ul className="divide-y divide-ink-100">
          {db.users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <UserChip user={u} size={26} />
              <span className="text-[12.5px] text-ink-400">{u.title}</span>
              <RoleBadge role={u.role} />
              <span className="ml-auto font-mono text-[11.5px] text-ink-400">{u.email}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

/* ---------------------------------- plans ---------------------------------- */

function PlansSettings() {
  const { db } = useScopedData()
  return (
    <>
      <Note tone="gold">
        The payment plans offered to buyers. Add or adjust them as the terms you sell on change.
      </Note>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {db.payment_plans.map((p) => {
          const used = db.deals.filter((d) => d.payment_plan_id === p.id).length
          return (
            <Card key={p.id}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-ink-900">{p.name}</h3>
                <Badge tone="neutral">{pluralize(used, 'deal')}</Badge>
              </div>
              <dl className="mt-2.5 grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-[11px] text-ink-400">Deposit</dt>
                  <dd className="tnum text-[16px] font-semibold text-ink-900">{p.deposit_percent}%</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-ink-400">Instalments</dt>
                  <dd className="tnum text-[16px] font-semibold text-ink-900">{p.instalment_count}</dd>
                </div>
              </dl>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-400">
                On a {formatMoneyWhole(6_000_000_000)} unit: {formatMoneyWhole((6_000_000_000 * p.deposit_percent) / 100)}{' '}
                up front
                {p.instalment_count > 1 &&
                  `, then ${p.instalment_count - 1} × ${formatMoneyWhole(
                    (6_000_000_000 * (100 - p.deposit_percent)) / 100 / (p.instalment_count - 1),
                  )}`}
                .
              </p>
            </Card>
          )
        })}
      </div>
    </>
  )
}

/* --------------------------------- company --------------------------------- */

function CompanySettingsTab() {
  const { db } = useScopedData()
  const updateSettings = useStore((s) => s.updateSettings)
  const usdDeals = db.deals.filter((d) => d.currency === 'USD')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <SectionHeading title="Currency" subtitle="Naira is the reporting base; deals may transact in either." />
        <div className="space-y-3">
          <Field
            label="Default USD → NGN rate offered when closing"
            hint="Only a default for the close form. Every deal keeps the rate it was closed at."
          >
            <Input
              type="number"
              value={db.settings.default_usd_ngn_rate}
              onChange={(e) => updateSettings({ default_usd_ngn_rate: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Note tone="info">
            Changing this does not affect deals that have already closed.{' '}
            {usdDeals.length > 0 && (
              <>
                The {pluralize(usdDeals.length, 'USD deal')} on file{' '}
                {usdDeals.length === 1 ? 'keeps the rate' : 'keep the rates'} recorded at close
                {usdDeals.length <= 3 && ` (${usdDeals.map((d) => `₦${d.fx_rate_to_ngn}`).join(', ')})`}.
              </>
            )}
          </Note>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatTile label="Deals in NGN" value={db.deals.filter((d) => d.currency === 'NGN').length} />
          <StatTile label="Deals in USD" value={usdDeals.length} />
        </div>
      </Card>

      <Card>
        <SectionHeading
          title="Modules"
          subtitle="Turn a module off to hide it from everyone in the workspace."
        />
        <div className="space-y-4">
          <Toggle
            label="Payments"
            description="Collections, outstanding balances, ageing and expected monthly inflow."
            checked={db.settings.payment_ledger_enabled}
            onChange={(v) => updateSettings({ payment_ledger_enabled: v })}
          />
          <Toggle
            label="Website enquiries"
            description="Enquiries from the website arriving as routed leads, with campaign attribution and response timing."
            checked={db.settings.website_integration_enabled}
            onChange={(v) => updateSettings({ website_integration_enabled: v })}
          />
        </div>
        <div className="mt-4">
          <Note tone="gold">
            Turning a module off removes it from the navigation for everyone straight away.
          </Note>
        </div>
      </Card>

    </div>
  )
}
