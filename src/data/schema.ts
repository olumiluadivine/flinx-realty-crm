/**
 * Types mirroring Part II of CRM-PROTOTYPE-SPEC.md, table for table.
 *
 * The prototype keeps every one of these in memory rather than in Postgres, but the
 * shapes are the shapes the real build will have — so replacing `store.ts` with an API
 * client later is a data-layer change, not a rewrite of the screens.
 *
 * Money is always integer minor units (kobo/cents) — never a float (R-CUR-4).
 * Timestamps are ISO-8601 strings.
 */

export type Id = string
export type Iso = string
export type Currency = 'NGN' | 'USD'

export type Role = 'super_admin' | 'team_lead' | 'salesperson'

/** `users` */
export interface User {
  id: Id
  full_name: string
  email: string
  phone: string
  role: Role
  title: string
  is_active: boolean
  /** Deterministic avatar tint; presentation only. */
  hue: number
}

/** `teams` */
export interface Team {
  id: Id
  name: string
  lead_user_id: Id
}

/** `team_memberships` — a join table, so a salesperson *can* sit on more than one team (R-ACC-7). */
export interface TeamMembership {
  id: Id
  team_id: Id
  user_id: Id
  /** Exactly one true per user — the team their numbers roll up into (R-REP-5). */
  is_primary: boolean
  joined_at: Iso
  left_at: Iso | null
}

export type ContactSource = 'ad_campaign' | 'referral' | 'walk_in' | 'phone_import' | 'website'

/** `contacts` */
export interface Contact {
  id: Id
  first_name: string
  last_name: string
  company: string | null
  owner_user_id: Id
  /** Derived from the most advanced open deal; recomputed on deal change (R-PIP-6). */
  lifecycle_status: string
  /** When set this wins and the recompute leaves it alone. */
  lifecycle_status_override: string | null
  source: ContactSource
  source_detail: string | null
  do_not_contact: boolean
  import_batch_id: Id | null
  notes: string | null
  created_at: Iso
  updated_at: Iso
}

export type ChannelKind = 'phone' | 'email' | 'whatsapp' | SocialKind

/**
 * Social profiles live in the same child table as phones and emails — they are just
 * another way to reach the person. They are deliberately *not* used for
 * de-duplication: two people can share a work email, but a handle is weaker still,
 * and matching on it would merge records that only look related.
 */
export type SocialKind = 'instagram' | 'linkedin' | 'facebook' | 'x'

export const SOCIAL_KINDS: SocialKind[] = ['instagram', 'linkedin', 'facebook', 'x']

export function isSocialKind(kind: ChannelKind): kind is SocialKind {
  return (SOCIAL_KINDS as string[]).includes(kind)
}

/** `contact_channels` — vCard routinely carries several numbers per person (R-CON-5). */
export interface ContactChannel {
  id: Id
  contact_id: Id
  kind: ChannelKind
  value: string
  /** E.164 for phones, lowercased for email — this is the dedupe key (R-CON-4). */
  value_normalized: string
  is_primary: boolean
  label: string | null
}

/** `import_batches` — import is recurring, so batches are first-class (R-CON-2/3). */
export interface ImportBatch {
  id: Id
  format: 'vcard' | 'csv'
  filename: string
  uploaded_by: Id
  uploaded_at: Iso
  rows_total: number
  rows_created: number
  rows_merged: number
  rows_failed: number
  /** Campaign these leads came from, stamped onto every contact created. */
  source: ContactSource
  source_detail: string | null
  reverted_at: Iso | null
}

export type PropertyStatus = 'available' | 'reserved' | 'sold'

/** `properties` — thin by design (R-PRP-3). */
export interface Property {
  id: Id
  title: string
  estate: string
  location: string
  address: string
  property_type: string
  list_price_minor: number
  list_currency: Currency
  status: PropertyStatus
  units_total: number
  units_available: number
  /** Presentation only — abstract tile, not a photograph. */
  tint: number
}

/** `pipeline_stages` — rows, not an enum, so the list stays editable at runtime (R-PIP-1). */
export interface PipelineStage {
  id: Id
  name: string
  sort_order: number
  /** Reporting keys off these flags, never off the name (R-PIP-9). */
  is_won: boolean
  is_lost: boolean
  /** True on Closed — forces a deal value before the stage can be set (R-PIP-4). */
  requires_amount: boolean
  description: string | null
}

/** `pipeline_sub_statuses` — hang off *any* stage, not just Closed (R-PIP-3). */
export interface PipelineSubStatus {
  id: Id
  stage_id: Id
  name: string
  sort_order: number
}

/** `deals` */
export interface Deal {
  id: Id
  contact_id: Id
  property_id: Id | null
  owner_user_id: Id
  /** Snapshotted at creation so past numbers don't move on a team transfer (R-PIP-8). */
  team_id: Id
  stage_id: Id
  sub_status_id: Id | null
  amount_minor: number
  currency: Currency
  /** Captured at close, never looked up live (R-CUR-3). */
  fx_rate_to_ngn: number | null
  /** Denormalised reporting figure. */
  amount_ngn_minor: number
  title: string
  expected_close_on: string | null
  closed_at: Iso | null
  created_at: Iso
  updated_at: Iso
  payment_plan_id: Id | null
}

/** `deal_stage_history` — who moved what, and when (R-PIP-7). */
export interface DealStageHistory {
  id: Id
  deal_id: Id
  from_stage_id: Id | null
  to_stage_id: Id
  changed_by: Id
  changed_at: Iso
}

export type ActivityType = 'inspection' | 'meeting' | 'call' | 'whatsapp' | 'note'

/** `activities` — the table that answers "you said five meetings, show me". */
export interface Activity {
  id: Id
  type: ActivityType
  /** Required — every activity names a client (R-ACT-2). */
  contact_id: Id
  deal_id: Id | null
  /** Expected on inspections (R-ACT-5). */
  property_id: Id | null
  user_id: Id
  /** When it happened. */
  occurred_at: Iso
  /** When it was entered. Server-stamped, never supplied by the client (R-ACT-7). */
  logged_at: Iso
  duration_minutes: number | null
  outcome: string | null
  /** The substance of the discussion, not just that it happened (R-ACT-3). */
  notes: string
}

/* ---------------------------------------------------------------------------
 * Optional add-on — payment ledger (§9). Purely additive: nothing above changes.
 * ------------------------------------------------------------------------- */

export type PaymentMethod = 'transfer' | 'cash' | 'cheque'

/** `deal_payments` — money that actually arrived. */
export interface DealPayment {
  id: Id
  deal_id: Id
  amount_minor: number
  currency: Currency
  /** The rate on the day this tranche landed, not the deal's rate (R-PAY-6). */
  fx_rate_to_ngn: number | null
  amount_ngn_minor: number
  received_on: string
  method: PaymentMethod
  reference: string
  /** Corrections are reversals, never edits (R-PAY-11). */
  reverses_payment_id: Id | null
  recorded_by: Id
  recorded_at: Iso
}

/** `deal_schedule` — money that is supposed to arrive. */
export interface DealScheduleItem {
  id: Id
  deal_id: Id
  due_on: string
  amount_minor: number
  currency: Currency
  /** 0 = commitment fee, then 1..n. */
  sequence: number
}

/** `payment_plans` — the plans the company actually sells (R-PAY-4). */
export interface PaymentPlan {
  id: Id
  name: string
  instalment_count: number
  deposit_percent: number
}

/* ---------------------------------------------------------------------------
 * Optional add-on — website integration (§10).
 * ------------------------------------------------------------------------- */

export interface WebLead {
  id: Id
  full_name: string
  phone: string
  email: string
  /** Which form on the site produced this. */
  form: 'apartment_availability' | 'unit_availability' | 'inspection_booking' | 'contact'
  page: string
  campaign: string | null
  apartment_type: string | null
  budget_band: string | null
  project_interest: string | null
  timeline: string | null
  preferred_channel: 'call' | 'whatsapp' | 'email'
  preferred_dates: string | null
  submitted_at: Iso
  /** Null until routed to a salesperson (R-WEB-3). */
  routed_to_user_id: Id | null
  routed_at: Iso | null
  /** Null until someone logs the first activity against the resulting contact. */
  first_response_at: Iso | null
  contact_id: Id | null
  message: string | null
}

/* ------------------------------------------------------------------------- */

export interface CompanySettings {
  company_name: string
  /** Governs whether the UI permits a second team membership (R-ACC-7). */
  allow_multi_team: boolean
  /** Default rate offered when closing a USD deal. Historical deals keep their own. */
  default_usd_ngn_rate: number
  reporting_currency: Currency
  payment_ledger_enabled: boolean
  website_integration_enabled: boolean
}

/** The whole database, as one object. */
export interface Database {
  users: User[]
  teams: Team[]
  team_memberships: TeamMembership[]
  contacts: Contact[]
  contact_channels: ContactChannel[]
  import_batches: ImportBatch[]
  properties: Property[]
  pipeline_stages: PipelineStage[]
  pipeline_sub_statuses: PipelineSubStatus[]
  deals: Deal[]
  deal_stage_history: DealStageHistory[]
  activities: Activity[]
  deal_payments: DealPayment[]
  deal_schedule: DealScheduleItem[]
  payment_plans: PaymentPlan[]
  web_leads: WebLead[]
  settings: CompanySettings
}
