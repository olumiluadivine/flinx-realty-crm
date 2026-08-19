/**
 * The application store.
 *
 * Stands in for the API. Every mutation the real backend would own lives here as an
 * action, which is what keeps the rules in one place: a screen cannot log an activity
 * with a forged entry timestamp, or move a deal into Closed without a value, because
 * neither screen is where those decisions are made.
 *
 * Swapping this for a real API later is a change to this file and `selectors.ts`,
 * not to the screens.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildSeed } from './seed'
import { recomputeContactStatuses } from './derive'
import { normalizeChannel } from './phone'
import { toNgnMinor } from './money'
import type { ImportPlan } from './import/dedupe'
import type {
  Activity,
  ActivityType,
  ChannelKind,
  Contact,
  ContactSource,
  Currency,
  Database,
  Deal,
  DealPayment,
  Id,
  PaymentMethod,
  PipelineStage,
  PipelineSubStatus,
  User,
  WebLead,
} from './schema'

/** Bump to invalidate persisted demo data after a schema change. */
const STORE_VERSION = 5
const STORAGE_KEY = 'flinx-crm-demo'

function nextId(prefix: string, existing: { id: Id }[]): Id {
  let n = existing.length + 1
  const taken = new Set(existing.map((e) => e.id))
  while (taken.has(`${prefix}-${n}`)) n++
  return `${prefix}-${n}`
}

export interface NewContactInput {
  first_name: string
  last_name: string
  company: string | null
  owner_user_id: Id
  source: ContactSource
  source_detail: string | null
  notes: string | null
  channels: { kind: ChannelKind; value: string; label: string | null }[]
}

export interface NewActivityInput {
  type: ActivityType
  contact_id: Id
  deal_id: Id | null
  property_id: Id | null
  user_id: Id
  /** When it happened — the only timestamp the person logging controls. */
  occurred_at: string
  duration_minutes: number | null
  outcome: string | null
  notes: string
}

export interface CloseDealInput {
  amount_minor: number
  currency: Currency
  fx_rate_to_ngn: number | null
}

interface AppState {
  db: Database
  /** Who the app believes you are. In production this comes from the session, not a switcher. */
  viewerId: Id
  signedIn: boolean
  /** Guided pitch mode — null when off, otherwise the current step index. */
  tourStep: number | null

  signIn: (userId: Id) => void
  signOut: () => void
  setViewer: (userId: Id) => void
  resetDemo: () => void

  setTourStep: (step: number | null) => void

  createContact: (input: NewContactInput) => Id
  updateContact: (id: Id, patch: Partial<Contact>) => void
  setStatusOverride: (id: Id, value: string | null) => void

  commitImport: (
    plan: ImportPlan,
    meta: {
      filename: string
      format: 'csv' | 'vcard'
      uploaded_by: Id
      source: ContactSource
      source_detail: string | null
      owner_user_id: Id
    },
  ) => Id
  revertImportBatch: (batchId: Id) => void

  /** Entry timestamp is stamped here, server-side, and never accepted from the caller (R-ACT-7). */
  logActivity: (input: NewActivityInput) => Id

  createDeal: (input: {
    contact_id: Id
    property_id: Id | null
    owner_user_id: Id
    stage_id: Id
    title: string
    amount_minor: number
    currency: Currency
    fx_rate_to_ngn: number | null
    expected_close_on: string | null
  }) => Id
  moveDealStage: (dealId: Id, stageId: Id, changedBy: Id, close?: CloseDealInput) => void
  setDealSubStatus: (dealId: Id, subStatusId: Id | null) => void

  addStage: (stage: Omit<PipelineStage, 'id'>) => void
  updateStage: (id: Id, patch: Partial<PipelineStage>) => void
  deleteStage: (id: Id) => { ok: boolean; reason?: string }
  moveStage: (id: Id, direction: -1 | 1) => void
  addSubStatus: (sub: Omit<PipelineSubStatus, 'id'>) => void
  deleteSubStatus: (id: Id) => void

  updateSettings: (patch: Partial<Database['settings']>) => void
  setPrimaryTeam: (userId: Id, teamId: Id) => void
  toggleMembership: (userId: Id, teamId: Id) => void

  recordPayment: (input: {
    deal_id: Id
    amount_minor: number
    currency: Currency
    fx_rate_to_ngn: number | null
    received_on: string
    method: PaymentMethod
    reference: string
    recorded_by: Id
  }) => void
  reversePayment: (paymentId: Id, recordedBy: Id) => void

  routeWebLead: (leadId: Id, userId: Id) => void
  convertWebLead: (leadId: Id) => Id | null
  simulateWebLead: () => Id
}

/** Clone, mutate, replace — keeps every action a single atomic state transition. */
function mutate(db: Database, fn: (draft: Database) => void): Database {
  const draft: Database = structuredClone(db)
  fn(draft)
  return draft
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      db: buildSeed(),
      viewerId: 'u-lead-1',
      signedIn: false,
      tourStep: null,

      signIn: (userId) => set({ viewerId: userId, signedIn: true }),
      signOut: () => set({ signedIn: false }),
      setViewer: (userId) => set({ viewerId: userId }),
      resetDemo: () => set({ db: buildSeed(), tourStep: null }),
      setTourStep: (step) => set({ tourStep: step }),

      createContact: (input) => {
        const id = nextId('c', get().db.contacts)
        set({
          db: mutate(get().db, (db) => {
            const now = new Date().toISOString()
            db.contacts.push({
              id,
              first_name: input.first_name,
              last_name: input.last_name,
              company: input.company,
              owner_user_id: input.owner_user_id,
              lifecycle_status: '',
              lifecycle_status_override: null,
              source: input.source,
              source_detail: input.source_detail,
              do_not_contact: false,
              import_batch_id: null,
              notes: input.notes,
              created_at: now,
              updated_at: now,
            })
            for (const ch of input.channels) {
              if (!ch.value.trim()) continue
              db.contact_channels.push({
                id: nextId('ch', db.contact_channels),
                contact_id: id,
                kind: ch.kind,
                value: ch.value.trim(),
                value_normalized: normalizeChannel(ch.kind, ch.value),
                is_primary: db.contact_channels.filter((c) => c.contact_id === id && c.kind === ch.kind).length === 0,
                label: ch.label,
              })
            }
            recomputeContactStatuses(db, [id])
          }),
        })
        return id
      },

      updateContact: (id, patch) =>
        set({
          db: mutate(get().db, (db) => {
            const c = db.contacts.find((x) => x.id === id)
            if (!c) return
            Object.assign(c, patch, { updated_at: new Date().toISOString() })
          }),
        }),

      setStatusOverride: (id, value) =>
        set({
          db: mutate(get().db, (db) => {
            const c = db.contacts.find((x) => x.id === id)
            if (!c) return
            c.lifecycle_status_override = value
            c.updated_at = new Date().toISOString()
            recomputeContactStatuses(db, [id])
          }),
        }),

      commitImport: (plan, meta) => {
        const batchId = nextId('ib', get().db.import_batches)
        set({
          db: mutate(get().db, (db) => {
            const now = new Date().toISOString()
            db.import_batches.push({
              id: batchId,
              format: meta.format,
              filename: meta.filename,
              uploaded_by: meta.uploaded_by,
              uploaded_at: now,
              rows_total: plan.rows.length,
              rows_created: plan.created,
              rows_merged: plan.merged,
              rows_failed: plan.failed,
              source: meta.source,
              source_detail: meta.source_detail,
              reverted_at: null,
            })

            const touched: Id[] = []
            for (const planned of plan.rows) {
              if (planned.outcome === 'fail') continue

              if (planned.outcome === 'merge' && planned.match) {
                // Merging adds the channels we did not already hold. Ownership is
                // deliberately left untouched when the match belongs to someone else —
                // that is an ownership dispute, not an import decision (open item 3).
                for (const ch of planned.newChannels) {
                  db.contact_channels.push({
                    id: nextId('ch', db.contact_channels),
                    contact_id: planned.match.contactId,
                    kind: ch.kind,
                    value: ch.value,
                    value_normalized: ch.normalized,
                    is_primary: false,
                    label: ch.label,
                  })
                }
                const existing = db.contacts.find((c) => c.id === planned.match!.contactId)
                if (existing) existing.updated_at = now
                continue
              }

              if (planned.outcome === 'create') {
                const id = nextId('c', db.contacts)
                db.contacts.push({
                  id,
                  first_name: planned.row.first_name,
                  last_name: planned.row.last_name,
                  company: planned.row.company,
                  owner_user_id: meta.owner_user_id,
                  lifecycle_status: '',
                  lifecycle_status_override: null,
                  source: meta.source,
                  source_detail: meta.source_detail,
                  do_not_contact: false,
                  import_batch_id: batchId,
                  notes: planned.row.notes,
                  created_at: now,
                  updated_at: now,
                })
                planned.row.channels.forEach((ch, i) => {
                  db.contact_channels.push({
                    id: nextId('ch', db.contact_channels),
                    contact_id: id,
                    kind: ch.kind,
                    value: ch.value,
                    value_normalized: ch.normalized,
                    is_primary: i === 0,
                    label: ch.label,
                  })
                })
                touched.push(id)
              }
            }
            recomputeContactStatuses(db, touched)
          }),
        })
        return batchId
      },

      /**
       * Undo a bad upload (R-CON-3). Only contacts this batch *created* are removed —
       * channels merged into contacts that already existed are left alone, because
       * deleting them would destroy data the batch did not create.
       */
      revertImportBatch: (batchId) =>
        set({
          db: mutate(get().db, (db) => {
            const batch = db.import_batches.find((b) => b.id === batchId)
            if (!batch || batch.reverted_at) return
            const created = db.contacts.filter((c) => c.import_batch_id === batchId).map((c) => c.id)
            const createdSet = new Set(created)
            db.contacts = db.contacts.filter((c) => !createdSet.has(c.id))
            db.contact_channels = db.contact_channels.filter((ch) => !createdSet.has(ch.contact_id))
            db.deals = db.deals.filter((d) => !createdSet.has(d.contact_id))
            db.activities = db.activities.filter((a) => !createdSet.has(a.contact_id))
            batch.reverted_at = new Date().toISOString()
          }),
        }),

      logActivity: (input) => {
        const id = nextId('a', get().db.activities)
        set({
          db: mutate(get().db, (db) => {
            db.activities.push({
              id,
              type: input.type,
              contact_id: input.contact_id,
              deal_id: input.deal_id,
              property_id: input.property_id,
              user_id: input.user_id,
              occurred_at: input.occurred_at,
              // Stamped here. The form has no field for it and the API would ignore
              // one if it were sent — without that, R-ACT-4 is decorative.
              logged_at: new Date().toISOString(),
              duration_minutes: input.duration_minutes,
              outcome: input.outcome,
              notes: input.notes,
            })
            // A web lead's first response is measured from submission to the first
            // logged activity against the contact it became (R-WEB-3).
            const lead = db.web_leads.find((l) => l.contact_id === input.contact_id && !l.first_response_at)
            if (lead) lead.first_response_at = new Date().toISOString()
          }),
        })
        return id
      },

      createDeal: (input) => {
        const id = nextId('d', get().db.deals)
        set({
          db: mutate(get().db, (db) => {
            const now = new Date().toISOString()
            const membership = db.team_memberships.find(
              (m) => m.user_id === input.owner_user_id && m.is_primary && m.left_at === null,
            )
            const stage = db.pipeline_stages.find((s) => s.id === input.stage_id)
            db.deals.push({
              id,
              contact_id: input.contact_id,
              property_id: input.property_id,
              owner_user_id: input.owner_user_id,
              // Snapshotted at creation so past numbers don't move on a transfer (R-PIP-8).
              team_id: membership?.team_id ?? db.teams[0].id,
              stage_id: input.stage_id,
              sub_status_id: null,
              amount_minor: input.amount_minor,
              currency: input.currency,
              fx_rate_to_ngn: input.fx_rate_to_ngn,
              amount_ngn_minor: toNgnMinor(input.amount_minor, input.currency, input.fx_rate_to_ngn),
              title: input.title,
              expected_close_on: input.expected_close_on,
              closed_at: stage?.is_won ? now : null,
              created_at: now,
              updated_at: now,
              payment_plan_id: null,
            })
            db.deal_stage_history.push({
              id: nextId('dh', db.deal_stage_history),
              deal_id: id,
              from_stage_id: null,
              to_stage_id: input.stage_id,
              changed_by: input.owner_user_id,
              changed_at: now,
            })
            recomputeContactStatuses(db, [input.contact_id])
          }),
        })
        return id
      },

      moveDealStage: (dealId, stageId, changedBy, close) =>
        set({
          db: mutate(get().db, (db) => {
            const deal = db.deals.find((d) => d.id === dealId)
            const stage = db.pipeline_stages.find((s) => s.id === stageId)
            if (!deal || !stage || deal.stage_id === stageId) return

            // A stage that requires an amount cannot be entered without one (R-PIP-4).
            if (stage.requires_amount) {
              const amount = close?.amount_minor ?? deal.amount_minor
              if (!amount || amount <= 0) return
              if (close) {
                deal.amount_minor = close.amount_minor
                deal.currency = close.currency
                // Frozen at close. Historical totals must not shift as the rate moves (R-CUR-3).
                deal.fx_rate_to_ngn = close.currency === 'USD' ? close.fx_rate_to_ngn : null
              }
              deal.amount_ngn_minor = toNgnMinor(deal.amount_minor, deal.currency, deal.fx_rate_to_ngn)
            }

            const now = new Date().toISOString()
            db.deal_stage_history.push({
              id: nextId('dh', db.deal_stage_history),
              deal_id: dealId,
              from_stage_id: deal.stage_id,
              to_stage_id: stageId,
              changed_by: changedBy,
              changed_at: now,
            })
            deal.stage_id = stageId
            deal.updated_at = now
            deal.closed_at = stage.is_won ? (deal.closed_at ?? now) : null
            // Sub-statuses belong to a stage, so they don't survive the move.
            const subs = db.pipeline_sub_statuses.filter((s) => s.stage_id === stageId)
            deal.sub_status_id = subs.length > 0 && stage.is_won ? subs[0].id : null
            recomputeContactStatuses(db, [deal.contact_id])
          }),
        }),

      setDealSubStatus: (dealId, subStatusId) =>
        set({
          db: mutate(get().db, (db) => {
            const deal = db.deals.find((d) => d.id === dealId)
            if (!deal) return
            deal.sub_status_id = subStatusId
            deal.updated_at = new Date().toISOString()
          }),
        }),

      addStage: (stage) =>
        set({
          db: mutate(get().db, (db) => {
            db.pipeline_stages.push({ ...stage, id: nextId('s', db.pipeline_stages) })
            db.pipeline_stages.sort((a, b) => a.sort_order - b.sort_order)
          }),
        }),

      updateStage: (id, patch) =>
        set({
          db: mutate(get().db, (db) => {
            const stage = db.pipeline_stages.find((s) => s.id === id)
            if (!stage) return
            Object.assign(stage, patch)
            // Renaming is data entry. Reporting reads the won/lost flags, so nothing
            // downstream cares what this stage is called (R-PIP-9).
            recomputeContactStatuses(db, db.contacts.map((c) => c.id))
          }),
        }),

      deleteStage: (id) => {
        const db = get().db
        const held = db.deals.filter((d) => d.stage_id === id).length
        if (held > 0) {
          // A stage that still holds deals cannot be deleted (R-PIP-10).
          return { ok: false, reason: `${held} ${held === 1 ? 'deal is' : 'deals are'} still in this stage. Move them first.` }
        }
        if (db.pipeline_stages.length <= 1) return { ok: false, reason: 'The pipeline needs at least one stage.' }
        set({
          db: mutate(db, (draft) => {
            draft.pipeline_stages = draft.pipeline_stages.filter((s) => s.id !== id)
            draft.pipeline_sub_statuses = draft.pipeline_sub_statuses.filter((s) => s.stage_id !== id)
          }),
        })
        return { ok: true }
      },

      moveStage: (id, direction) =>
        set({
          db: mutate(get().db, (db) => {
            const sorted = [...db.pipeline_stages].sort((a, b) => a.sort_order - b.sort_order)
            const i = sorted.findIndex((s) => s.id === id)
            const j = i + direction
            if (i < 0 || j < 0 || j >= sorted.length) return
            const a = sorted[i]
            const b = sorted[j]
            const tmp = a.sort_order
            a.sort_order = b.sort_order
            b.sort_order = tmp
            db.pipeline_stages.sort((x, y) => x.sort_order - y.sort_order)
          }),
        }),

      addSubStatus: (sub) =>
        set({
          db: mutate(get().db, (db) => {
            db.pipeline_sub_statuses.push({ ...sub, id: nextId('ss', db.pipeline_sub_statuses) })
          }),
        }),

      deleteSubStatus: (id) =>
        set({
          db: mutate(get().db, (db) => {
            db.pipeline_sub_statuses = db.pipeline_sub_statuses.filter((s) => s.id !== id)
            for (const deal of db.deals) if (deal.sub_status_id === id) deal.sub_status_id = null
          }),
        }),

      updateSettings: (patch) =>
        set({ db: mutate(get().db, (db) => Object.assign(db.settings, patch)) }),

      setPrimaryTeam: (userId, teamId) =>
        set({
          db: mutate(get().db, (db) => {
            for (const m of db.team_memberships) {
              if (m.user_id !== userId) continue
              m.is_primary = m.team_id === teamId
            }
          }),
        }),

      toggleMembership: (userId, teamId) =>
        set({
          db: mutate(get().db, (db) => {
            const existing = db.team_memberships.find(
              (m) => m.user_id === userId && m.team_id === teamId && m.left_at === null,
            )
            if (existing) {
              if (existing.is_primary) return // never leave a user without a primary team
              existing.left_at = new Date().toISOString()
              return
            }
            const hasPrimary = db.team_memberships.some(
              (m) => m.user_id === userId && m.is_primary && m.left_at === null,
            )
            db.team_memberships.push({
              id: nextId('tm', db.team_memberships),
              team_id: teamId,
              user_id: userId,
              is_primary: !hasPrimary,
              joined_at: new Date().toISOString(),
              left_at: null,
            })
          }),
        }),

      recordPayment: (input) =>
        set({
          db: mutate(get().db, (db) => {
            const payment: DealPayment = {
              id: nextId('dp', db.deal_payments),
              deal_id: input.deal_id,
              amount_minor: input.amount_minor,
              currency: input.currency,
              fx_rate_to_ngn: input.currency === 'USD' ? input.fx_rate_to_ngn : null,
              amount_ngn_minor: toNgnMinor(
                input.amount_minor,
                input.currency,
                input.currency === 'USD' ? input.fx_rate_to_ngn : null,
              ),
              received_on: input.received_on,
              method: input.method,
              reference: input.reference,
              reverses_payment_id: null,
              recorded_by: input.recorded_by,
              recorded_at: new Date().toISOString(),
            }
            db.deal_payments.push(payment)
          }),
        }),

      /** Corrections are reversals, never silent edits (R-PAY-11). */
      reversePayment: (paymentId, recordedBy) =>
        set({
          db: mutate(get().db, (db) => {
            const original = db.deal_payments.find((p) => p.id === paymentId)
            if (!original) return
            db.deal_payments.push({
              ...original,
              id: nextId('dp', db.deal_payments),
              amount_minor: -original.amount_minor,
              amount_ngn_minor: -original.amount_ngn_minor,
              reference: `REVERSAL of ${original.reference}`,
              reverses_payment_id: original.id,
              recorded_by: recordedBy,
              recorded_at: new Date().toISOString(),
            })
          }),
        }),

      routeWebLead: (leadId, userId) =>
        set({
          db: mutate(get().db, (db) => {
            const lead = db.web_leads.find((l) => l.id === leadId)
            if (!lead) return
            lead.routed_to_user_id = userId
            lead.routed_at = new Date().toISOString()
          }),
        }),

      /** Turn a web lead into a contact, running the same dedupe as every other path. */
      convertWebLead: (leadId) => {
        const db = get().db
        const lead = db.web_leads.find((l) => l.id === leadId)
        if (!lead || lead.contact_id) return null
        const owner = lead.routed_to_user_id ?? db.users.find((u) => u.role === 'salesperson')!.id
        const [first, ...rest] = lead.full_name.split(' ')
        const contactId = get().createContact({
          first_name: first,
          last_name: rest.join(' '),
          company: null,
          owner_user_id: owner,
          source: 'website',
          source_detail: lead.campaign ?? `flinxrealtyltd.com — ${lead.page}`,
          notes: [
            lead.project_interest ? `Interested in ${lead.project_interest}` : null,
            lead.apartment_type ? `Unit type: ${lead.apartment_type}` : null,
            lead.budget_band ? `Budget: ${lead.budget_band}` : null,
            lead.timeline ? `Timeline: ${lead.timeline}` : null,
            lead.message,
          ]
            .filter(Boolean)
            .join(' · '),
          channels: [
            { kind: 'phone', value: lead.phone, label: 'Mobile' },
            { kind: 'email', value: lead.email, label: 'Email' },
          ],
        })
        set({
          db: mutate(get().db, (draft) => {
            const l = draft.web_leads.find((x) => x.id === leadId)
            if (l) l.contact_id = contactId
          }),
        })
        return contactId
      },

      /** Demo affordance: pretend someone just filled in the form on the website. */
      simulateWebLead: () => {
        const id = nextId('wl', get().db.web_leads)
        set({
          db: mutate(get().db, (db) => {
            const property = db.properties.find((p) => p.status === 'available')!
            const lead: WebLead = {
              id,
              full_name: 'Adaeze Nwachukwu',
              phone: '+2348037714520',
              email: 'adaeze.nwachukwu@gmail.com',
              form: 'apartment_availability',
              page: `/properties/${property.estate.toLowerCase().replace(/\s+/g, '-')}`,
              campaign: 'Meta — Wells IV Aug 2026',
              apartment_type: '2 bedroom',
              budget_band: '₦60m – ₦90m',
              project_interest: property.title,
              timeline: 'Within 3 months',
              preferred_channel: 'whatsapp',
              preferred_dates: null,
              submitted_at: new Date().toISOString(),
              routed_to_user_id: null,
              routed_at: null,
              first_response_at: null,
              contact_id: null,
              message: 'Saw the advert on Instagram. Please send details of available units.',
            }
            db.web_leads.unshift(lead)
          }),
        })
        return id
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      // A schema change invalidates the persisted demo rather than half-migrating it.
      migrate: () => ({ db: buildSeed(), viewerId: 'u-lead-1', signedIn: false, tourStep: null }) as never,
      partialize: (state) => ({
        db: state.db,
        viewerId: state.viewerId,
        signedIn: state.signedIn,
      }) as never,
    },
  ),
)

/** Convenience hooks used across the screens. */
export function useDb(): Database {
  return useStore((s) => s.db)
}

export function useViewer(): User {
  const db = useStore((s) => s.db)
  const viewerId = useStore((s) => s.viewerId)
  return db.users.find((u) => u.id === viewerId) ?? db.users[0]
}

export type { Activity, Contact, Deal }
