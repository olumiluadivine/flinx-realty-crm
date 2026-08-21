/**
 * The demonstration dataset.
 *
 * Developments, locations, price points and payment plans are Flinx Realty's own,
 * taken from flinxrealtyltd.com. Everything else — staff, buyers, deal values,
 * activity — is fictional and generated here. No figure in this file is a real
 * Flinx sales number.
 *
 * Generation is deterministic (fixed PRNG seed) so every run of the demo is
 * identical, but dates are anchored to *today* so the pipeline never looks stale
 * and "42 days overdue" stays true whenever the pitch happens.
 */
import { toMinor, toNgnMinor } from './money'
import { normalizeEmail, normalizePhone } from './phone'
import { normalizeHandle } from './social'
import type {
  Activity,
  ActivityType,
  Contact,
  ContactChannel,
  ContactSource,
  Database,
  Deal,
  DealPayment,
  DealScheduleItem,
  DealStageHistory,
  ImportBatch,
  PaymentPlan,
  PipelineStage,
  PipelineSubStatus,
  Property,
  Team,
  TeamMembership,
  User,
  WebLead,
} from './schema'

/* ----------------------------- deterministic rng ----------------------------- */

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 20260819

/* --------------------------------- helpers ---------------------------------- */

const DAY = 24 * 60 * 60 * 1000

function iso(d: Date): string {
  return d.toISOString()
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY)
}

/** Same day, a specific clock time — so seeded timestamps don't all share a minute. */
function atTime(d: Date, hours: number, minutes: number): Date {
  const out = new Date(d)
  out.setHours(hours, minutes, 0, 0)
  return out
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d)
  out.setMonth(out.getMonth() + months)
  return out
}

/* ------------------------------- source data -------------------------------- */

const FIRST_NAMES = [
  'Adebayo', 'Chiamaka', 'Olumide', 'Ngozi', 'Emeka', 'Folake', 'Ibrahim', 'Yetunde',
  'Chukwudi', 'Amina', 'Tunde', 'Blessing', 'Segun', 'Halima', 'Ifeanyi', 'Damilola',
  'Zainab', 'Kelechi', 'Bukola', 'Nnamdi', 'Aisha', 'Gbenga', 'Chidinma', 'Musa',
  'Temitope', 'Uchenna', 'Fatima', 'Bolaji', 'Adaeze', 'Yusuf', 'Simisola', 'Obinna',
  'Hauwa', 'Kunle', 'Oluchi', 'Sadiq', 'Morayo', 'Chinelo', 'Babatunde', 'Rukayat',
  'Ekene', 'Titilayo', 'Abdullahi', 'Nkiru', 'Seyi', 'Maryam', 'Chibuzo', 'Omolara',
  'Danladi', 'Ifeoma', 'Ayodeji', 'Zara', 'Chinonso', 'Abiola', 'Suleiman', 'Nneka',
]

const LAST_NAMES = [
  'Okonkwo', 'Adeyemi', 'Balogun', 'Adeleke', 'Eze', 'Bakare', 'Mohammed', 'Nwosu',
  'Achebe', 'Oladipo', 'Yusuf', 'Obi', 'Sanni', 'Bello', 'Okafor', 'Ogundele',
  'Abubakar', 'Chukwu', 'Ademola', 'Nwachukwu', 'Salami', 'Igwe', 'Oyelaran', 'Danjuma',
  'Afolabi', 'Onyeka', 'Lawal', 'Ezeh', 'Adewale', 'Musa', 'Okoro', 'Aliyu',
  'Adebisi', 'Nnaji', 'Ojo', 'Garba', 'Uzoma', 'Fashola', 'Anyanwu', 'Ibrahim',
  'Olaniyi', 'Madu', 'Shittu', 'Okeke', 'Alabi', 'Umar', 'Nwankwo', 'Odunsi',
]

const COMPANIES = [
  'Zenith Bank Plc', 'MTN Nigeria', 'Chevron Nigeria', 'Guaranty Trust Bank', 'Dangote Group',
  'Flour Mills of Nigeria', 'Access Bank', 'Seplat Energy', 'Nigerian Breweries',
  'PwC Nigeria', 'Andela', 'Interswitch', 'Lagos State Civil Service', 'Shell Nigeria',
  'Sterling Bank', 'Paystack', 'Julius Berger', 'Total Energies', 'Airtel Nigeria',
]

/** Ad campaigns — the recurring import source (R-CON-2/7). */
const CAMPAIGNS = [
  'Meta — Wells IV Aug 2026',
  'Meta — Bristol 2 Jul 2026',
  'Google Ads — Lagos Apartments Jun 2026',
  'Instagram — Buckingham Co-ownership',
  'Cool FM — Drive-time Jul 2026',
  'Meta — Diaspora Investor May 2026',
]

/* --------------------------------- builder ---------------------------------- */

export function buildSeed(now = new Date()): Database {
  const rng = mulberry32(SEED)
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]
  const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
  const chance = (p: number) => rng() < p

  /* ------------------------------ users & teams ----------------------------- */

  let hue = 0
  const mkUser = (
    id: string,
    full_name: string,
    role: User['role'],
    title: string,
    phoneTail: string,
  ): User => ({
    id,
    full_name,
    email: normalizeEmail(
      `${full_name.split(' ')[0].toLowerCase()}.${full_name.split(' ')[1].toLowerCase()}@flinxrealtyltd.com`,
    ),
    phone: normalizePhone(`080${phoneTail}`),
    role,
    title,
    is_active: true,
    hue: (hue += 47) % 360,
  })

  const users: User[] = [
    mkUser('u-admin-1', 'Adebayo Okonkwo', 'super_admin', 'Managing Director', '31000001'),
    mkUser('u-admin-2', 'Ngozi Adeyemi', 'super_admin', 'Finance Director', '31000002'),
    mkUser('u-admin-3', 'Emeka Balogun', 'super_admin', 'Head of Sales', '31000003'),
    mkUser('u-lead-1', 'Funmilayo Adeleke', 'team_lead', 'Sales Manager — Mainland', '31000004'),
    mkUser('u-lead-2', 'Chinedu Eze', 'team_lead', 'Sales Manager — Diaspora & Island', '31000005'),
    mkUser('u-sp-1', 'Tunde Bakare', 'salesperson', 'Sales Executive', '31000006'),
    mkUser('u-sp-2', 'Aisha Mohammed', 'salesperson', 'Sales Executive', '31000007'),
    mkUser('u-sp-3', 'Kelechi Nwosu', 'salesperson', 'Sales Executive', '31000008'),
    mkUser('u-sp-4', 'Blessing Achebe', 'salesperson', 'Sales Executive', '31000009'),
    mkUser('u-sp-5', 'Segun Oladipo', 'salesperson', 'Senior Sales Executive', '31000010'),
    mkUser('u-sp-6', 'Halima Yusuf', 'salesperson', 'Sales Executive', '31000011'),
    mkUser('u-sp-7', 'Ifeanyi Obi', 'salesperson', 'Sales Executive', '31000012'),
    mkUser('u-sp-8', 'Damilola Sanni', 'salesperson', 'Sales Executive', '31000013'),
    mkUser('u-sp-9', 'Zainab Bello', 'salesperson', 'Sales Executive', '31000014'),
  ]

  const teams: Team[] = [
    { id: 't-mainland', name: 'Mainland Sales', lead_user_id: 'u-lead-1' },
    { id: 't-diaspora', name: 'Diaspora & Island', lead_user_id: 'u-lead-2' },
  ]

  const joined = iso(addDays(now, -400))
  const team_memberships: TeamMembership[] = [
    { id: 'tm-1', team_id: 't-mainland', user_id: 'u-lead-1', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-2', team_id: 't-mainland', user_id: 'u-sp-1', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-3', team_id: 't-mainland', user_id: 'u-sp-2', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-4', team_id: 't-mainland', user_id: 'u-sp-3', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-5', team_id: 't-mainland', user_id: 'u-sp-4', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-6', team_id: 't-mainland', user_id: 'u-sp-5', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-7', team_id: 't-diaspora', user_id: 'u-lead-2', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-8', team_id: 't-diaspora', user_id: 'u-sp-6', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-9', team_id: 't-diaspora', user_id: 'u-sp-7', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-10', team_id: 't-diaspora', user_id: 'u-sp-8', is_primary: true, joined_at: joined, left_at: null },
    { id: 'tm-11', team_id: 't-diaspora', user_id: 'u-sp-9', is_primary: true, joined_at: joined, left_at: null },
    // Segun sits on both teams — the multi-team case (R-ACC-7). His numbers roll up
    // into Mainland only, because that is where is_primary is true (R-REP-5).
    {
      id: 'tm-12',
      team_id: 't-diaspora',
      user_id: 'u-sp-5',
      is_primary: false,
      joined_at: iso(addDays(now, -120)),
      left_at: null,
    },
  ]

  const salespeople = users.filter((u) => u.role === 'salesperson')
  const mainlandSp = ['u-sp-1', 'u-sp-2', 'u-sp-3', 'u-sp-4', 'u-sp-5']
  const diasporaSp = ['u-sp-6', 'u-sp-7', 'u-sp-8', 'u-sp-9']
  const teamOf = (userId: string) => (mainlandSp.includes(userId) ? 't-mainland' : 't-diaspora')

  /* ------------------------------- properties ------------------------------- */
  // Real developments from flinxrealtyltd.com.

  const properties: Property[] = [
    {
      id: 'p-wells-4', title: 'Wells IV Apartment', estate: 'Wells IV',
      location: 'Surulere, Lagos', address: 'Adeniran Ogunsanya axis, Surulere',
      property_type: 'Studio & 1-bedroom apartments', list_price_minor: toMinor(60_000_000),
      list_currency: 'NGN', status: 'available', units_total: 24, units_available: 9, tint: 158,
    },
    {
      id: 'p-bristol-2', title: 'Bristol Apartments 2', estate: 'Bristol 2',
      location: 'Surulere, Lagos', address: 'Bode Thomas, Surulere',
      property_type: '2 & 3-bedroom apartments', list_price_minor: toMinor(118_000_000),
      list_currency: 'NGN', status: 'available', units_total: 18, units_available: 6, tint: 42,
    },
    {
      id: 'p-bradford-2', title: 'Bradford Suites II', estate: 'Bradford Suites',
      location: 'Akoka, Yaba, Lagos', address: 'Akoka, Yaba',
      property_type: 'Studio & 1-bedroom suites', list_price_minor: toMinor(72_500_000),
      list_currency: 'NGN', status: 'available', units_total: 30, units_available: 14, tint: 196,
    },
    {
      id: 'p-buckingham', title: 'Buckingham Estate Co-ownership', estate: 'Buckingham Estate',
      location: 'Adekunle, Yaba, Lagos', address: 'Adekunle, Yaba',
      property_type: 'Co-ownership plots', list_price_minor: toMinor(47_000_000),
      list_currency: 'NGN', status: 'available', units_total: 40, units_available: 22, tint: 88,
    },
    {
      id: 'p-sheffield', title: 'Sheffield Residence', estate: 'Sheffield',
      location: 'Yaba, Lagos', address: 'Alagomeji, Yaba',
      property_type: '2-bedroom apartments & duplexes', list_price_minor: toMinor(148_000_000),
      list_currency: 'NGN', status: 'available', units_total: 12, units_available: 4, tint: 12,
    },
    // Sold out — kept on record because past deals still point at them.
    ...(
      [
        ['p-bristol-1', 'Bristol Apartments', 'Surulere, Lagos', 96_000_000, 14],
        ['p-wells-3', 'Wells III Apartment', 'Surulere, Lagos', 55_000_000, 16],
        ['p-wells-2', 'Wells II Apartment', 'Surulere, Lagos', 48_000_000, 12],
        ['p-leeds-2p', 'Leeds 2 Prime Apartments', 'Yaba, Lagos', 88_000_000, 10],
        ['p-leeds-1', 'Leeds 1 Apartment', 'Yaba, Lagos', 42_000_000, 12],
        ['p-leeds-2', 'Leeds 2 Apartment', 'Yaba, Lagos', 45_000_000, 12],
        ['p-bradford-1', 'Bradford Apartments', 'Akoka, Yaba, Lagos', 65_000_000, 20],
        ['p-chester-1', 'Chester 1 Apartment', 'Yaba, Lagos', 38_000_000, 8],
        ['p-chester-2', 'Chester 2 Apartments', 'Yaba, Lagos', 52_000_000, 10],
      ] as const
    ).map(([id, title, location, price, units], i) => ({
      id, title, estate: title.replace(/ (Apartments?|Prime Apartments)$/, ''), location,
      address: location, property_type: 'Apartments',
      list_price_minor: toMinor(price), list_currency: 'NGN' as const,
      status: 'sold' as const, units_total: units, units_available: 0, tint: (i * 37 + 210) % 360,
    })),
  ]

  const sellingProperties = properties.filter((p) => p.status === 'available')

  /* --------------------------- pipeline configuration ----------------------- */
  // Rows, not an enum — the client said the list is still under discussion (R-PIP-1).

  const pipeline_stages: PipelineStage[] = [
    { id: 's-new', name: 'New lead', sort_order: 10, is_won: false, is_lost: false, requires_amount: false, description: 'Imported or captured, not yet spoken to' },
    { id: 's-contacted', name: 'Contacted', sort_order: 20, is_won: false, is_lost: false, requires_amount: false, description: 'First conversation has happened' },
    { id: 's-inspection', name: 'Inspection booked', sort_order: 30, is_won: false, is_lost: false, requires_amount: false, description: 'A viewing is in the diary' },
    { id: 's-inspected', name: 'Inspected', sort_order: 40, is_won: false, is_lost: false, requires_amount: false, description: 'Has seen the unit' },
    { id: 's-notready', name: 'Interested but not ready', sort_order: 50, is_won: false, is_lost: false, requires_amount: false, description: 'Wants it, cannot act yet' },
    { id: 's-negotiating', name: 'Negotiating', sort_order: 60, is_won: false, is_lost: false, requires_amount: false, description: 'Price or payment plan under discussion' },
    { id: 's-closed', name: 'Closed', sort_order: 70, is_won: true, is_lost: false, requires_amount: true, description: 'The client bought — a deal value is required' },
    { id: 's-notinterested', name: 'Not interested', sort_order: 80, is_won: false, is_lost: true, requires_amount: false, description: 'Declined — kept on record, never deleted' },
  ]

  const pipeline_sub_statuses: PipelineSubStatus[] = [
    // The post-handshake money trail.
    { id: 'ss-part', stage_id: 's-closed', name: 'Part payment', sort_order: 10 },
    { id: 'ss-full', stage_id: 's-closed', name: 'Fully paid', sort_order: 20 },
    { id: 'ss-docs', stage_id: 's-closed', name: 'Documentation', sort_order: 30 },
    { id: 'ss-alloc', stage_id: 's-closed', name: 'Allocation', sort_order: 40 },
    { id: 'ss-handover', stage_id: 's-closed', name: 'Handover', sort_order: 50 },
    // Sub-statuses generalise to any stage, so this one already has its own.
    { id: 'ss-budget', stage_id: 's-notready', name: 'Budget not ready', sort_order: 10 },
    { id: 'ss-family', stage_id: 's-notready', name: 'Awaiting family decision', sort_order: 20 },
    { id: 'ss-timing', stage_id: 's-notready', name: 'Buying next year', sort_order: 30 },
    { id: 'ss-price', stage_id: 's-negotiating', name: 'Price negotiation', sort_order: 10 },
    { id: 'ss-plan', stage_id: 's-negotiating', name: 'Payment plan discussion', sort_order: 20 },
  ]

  // The plans Flinx actually publishes.
  const payment_plans: PaymentPlan[] = [
    { id: 'pp-outright', name: 'Outright', instalment_count: 1, deposit_percent: 100 },
    { id: 'pp-60day', name: '60 days', instalment_count: 2, deposit_percent: 40 },
    { id: 'pp-3mo', name: '3 months', instalment_count: 3, deposit_percent: 30 },
    { id: 'pp-4mo', name: '4 months', instalment_count: 4, deposit_percent: 25 },
    { id: 'pp-6mo', name: '6 months', instalment_count: 6, deposit_percent: 20 },
  ]

  /* ------------------------------ import batches ---------------------------- */

  const import_batches: ImportBatch[] = [
    {
      id: 'ib-1', format: 'csv', filename: 'meta-leads-wells-iv-aug.csv',
      uploaded_by: 'u-lead-1', uploaded_at: iso(atTime(addDays(now, -12), 9, 24)),
      rows_total: 64, rows_created: 51, rows_merged: 11, rows_failed: 2,
      source: 'ad_campaign', source_detail: 'Meta — Wells IV Aug 2026', reverted_at: null,
    },
    {
      id: 'ib-2', format: 'vcard', filename: 'segun-phone-export.vcf',
      uploaded_by: 'u-sp-5', uploaded_at: iso(atTime(addDays(now, -34), 18, 47)),
      rows_total: 38, rows_created: 29, rows_merged: 9, rows_failed: 0,
      source: 'phone_import', source_detail: 'Personal phone — Segun Oladipo', reverted_at: null,
    },
    {
      id: 'ib-3', format: 'csv', filename: 'coolfm-drivetime-jul.csv',
      uploaded_by: 'u-admin-3', uploaded_at: iso(atTime(addDays(now, -58), 11, 6)),
      rows_total: 41, rows_created: 33, rows_merged: 5, rows_failed: 3,
      source: 'ad_campaign', source_detail: 'Cool FM — Drive-time Jul 2026', reverted_at: null,
    },
  ]

  /* --------------------------------- contacts ------------------------------- */

  const contacts: Contact[] = []
  const contact_channels: ContactChannel[] = []
  const usedNames = new Set<string>()
  let phoneSerial = 4100000

  const CONTACT_COUNT = 142

  for (let i = 0; i < CONTACT_COUNT; i++) {
    let first = pick(FIRST_NAMES)
    let last = pick(LAST_NAMES)
    let guard = 0
    while (usedNames.has(`${first} ${last}`) && guard++ < 40) {
      first = pick(FIRST_NAMES)
      last = pick(LAST_NAMES)
    }
    usedNames.add(`${first} ${last}`)

    const owner = pick(salespeople).id
    const createdDaysAgo = randInt(2, 210)
    const created = addDays(now, -createdDaysAgo)

    let source: ContactSource
    let source_detail: string | null
    let import_batch_id: string | null = null
    const roll = rng()
    if (roll < 0.5) {
      source = 'ad_campaign'
      source_detail = pick(CAMPAIGNS)
      if (createdDaysAgo < 14) import_batch_id = 'ib-1'
      else if (createdDaysAgo < 62) import_batch_id = 'ib-3'
    } else if (roll < 0.68) {
      source = 'referral'
      source_detail = `Referred by an existing ${pick(properties).estate} owner`
    } else if (roll < 0.78) {
      source = 'walk_in'
      source_detail = '294 Borno Way office'
    } else if (roll < 0.92) {
      source = 'phone_import'
      source_detail = 'Personal phone contacts'
      if (createdDaysAgo < 40) import_batch_id = 'ib-2'
    } else {
      source = 'website'
      source_detail = 'flinxrealtyltd.com — Apartment Availability form'
    }

    const id = `c-${i + 1}`
    contacts.push({
      id,
      first_name: first,
      last_name: last,
      company: chance(0.55) ? pick(COMPANIES) : null,
      owner_user_id: owner,
      lifecycle_status: 'New lead',
      lifecycle_status_override: null,
      source,
      source_detail,
      do_not_contact: chance(0.04),
      import_batch_id,
      notes: chance(0.3)
        ? pick([
            'Buying for rental income — wants yield projections before committing.',
            'Based in Houston, will inspect by video call. Family member can attend in person.',
            'Second-time buyer, already owns a unit in one of the earlier developments.',
            'Prefers WhatsApp. Do not call before 6pm.',
            'Wants a corner unit specifically. Will wait for one to free up.',
          ])
        : null,
      created_at: iso(created),
      updated_at: iso(addDays(created, randInt(0, Math.min(createdDaysAgo, 30)))),
    })

    // Multiple phones and emails per person — the vCard reality (R-CON-5).
    const phoneCount = chance(0.42) ? (chance(0.25) ? 3 : 2) : 1
    for (let p = 0; p < phoneCount; p++) {
      const raw = `0${pick(['803', '806', '813', '703', '805', '815', '909', '812'])}${String(phoneSerial++).slice(-7)}`
      contact_channels.push({
        id: `ch-${contact_channels.length + 1}`,
        contact_id: id,
        kind: p === 1 && chance(0.4) ? 'whatsapp' : 'phone',
        value: raw,
        value_normalized: normalizePhone(raw),
        is_primary: p === 0,
        label: p === 0 ? 'Mobile' : p === 1 ? 'Alternate' : 'Work',
      })
    }
    const emailCount = chance(0.75) ? (chance(0.2) ? 2 : 1) : 0
    for (let e = 0; e < emailCount; e++) {
      const domain = e === 0 ? pick(['gmail.com', 'yahoo.com', 'outlook.com']) : 'company-mail.com'
      const value = normalizeEmail(`${first}.${last}${e === 0 ? '' : e + 1}@${domain}`)
      contact_channels.push({
        id: `ch-${contact_channels.length + 1}`,
        contact_id: id,
        kind: 'email',
        value,
        value_normalized: value,
        is_primary: e === 0,
        label: e === 0 ? 'Personal' : 'Work',
      })
    }

    // Social profiles. Plenty of Lagos buyers are reached on Instagram or WhatsApp
    // long before anyone has their email, so a good share of the book carries one.
    const handleBase = `${first}.${last}`.toLowerCase()
    if (chance(0.42)) {
      const handle = chance(0.5) ? handleBase : `${first.toLowerCase()}_${last.toLowerCase()}`
      contact_channels.push({
        id: `ch-${contact_channels.length + 1}`,
        contact_id: id,
        kind: 'instagram',
        value: `@${handle}`,
        value_normalized: normalizeHandle('instagram', handle),
        is_primary: true,
        label: null,
      })
    }
    if (chance(0.3)) {
      const handle = `${first.toLowerCase()}-${last.toLowerCase()}`
      contact_channels.push({
        id: `ch-${contact_channels.length + 1}`,
        contact_id: id,
        kind: 'linkedin',
        value: `https://linkedin.com/in/${handle}`,
        value_normalized: normalizeHandle('linkedin', handle),
        is_primary: true,
        label: null,
      })
    }
    if (chance(0.14)) {
      contact_channels.push({
        id: `ch-${contact_channels.length + 1}`,
        contact_id: id,
        kind: 'x',
        value: `@${first.toLowerCase()}${randInt(10, 99)}`,
        value_normalized: normalizeHandle('x', `${first.toLowerCase()}${randInt(10, 99)}`),
        is_primary: true,
        label: null,
      })
    }
  }

  /* ---------------------------------- deals --------------------------------- */

  const deals: Deal[] = []
  const deal_stage_history: DealStageHistory[] = []
  const deal_payments: DealPayment[] = []
  const deal_schedule: DealScheduleItem[] = []

  const OPEN_STAGE_WEIGHTS: [string, number][] = [
    ['s-new', 0.18],
    ['s-contacted', 0.2],
    ['s-inspection', 0.12],
    ['s-inspected', 0.14],
    ['s-notready', 0.16],
    ['s-negotiating', 0.1],
    ['s-notinterested', 0.1],
  ]

  function pickOpenStage(): string {
    const r = rng()
    let acc = 0
    for (const [id, w] of OPEN_STAGE_WEIGHTS) {
      acc += w
      if (r < acc) return id
    }
    return 's-contacted'
  }

  const stageById = new Map(pipeline_stages.map((s) => [s.id, s]))
  const USD_RATE_AT_CLOSE = [1_580, 1_612, 1_534]

  // Contacts that get a deal: roughly half the book, weighted toward older contacts.
  const dealContacts = contacts.filter(() => chance(0.5))
  let dealSerial = 0
  let closedCount = 0
  const TARGET_CLOSED = 14

  for (const contact of dealContacts) {
    const createdDaysAgo = Math.round((now.getTime() - new Date(contact.created_at).getTime()) / DAY)
    // Closes are drawn from older contacts so their instalment schedules have had
    // time to run — a book where every sale closed last week has no collections
    // story to tell.
    const willClose = closedCount < TARGET_CLOSED && createdDaysAgo > 95 && chance(0.5)
    const stageId = willClose ? 's-closed' : pickOpenStage()
    if (willClose) closedCount++

    const property = chance(0.78) ? pick(willClose ? sellingProperties.concat(properties.filter((p) => p.status === 'sold')) : sellingProperties) : null
    const dealStart = addDays(new Date(contact.created_at), randInt(1, 10))
    const id = `d-${++dealSerial}`

    // USD only for a couple of diaspora deals, so the frozen-FX story has something to stand on.
    const isUsd = willClose && diasporaSp.includes(contact.owner_user_id) && chance(0.35)
    const baseNgn = property ? property.list_price_minor : toMinor(randInt(45, 130) * 1_000_000)
    const variance = 0.92 + rng() * 0.16
    const amountNgn = Math.round(baseNgn * variance)

    let amount_minor = amountNgn
    let currency: Deal['currency'] = 'NGN'
    let fx: number | null = null
    if (isUsd) {
      currency = 'USD'
      fx = pick(USD_RATE_AT_CLOSE)
      amount_minor = Math.round(amountNgn / fx)
    }

    const closed_at = willClose ? iso(addDays(dealStart, randInt(20, 90))) : null
    const subStatus = willClose
      ? pick(['ss-part', 'ss-part', 'ss-full', 'ss-docs', 'ss-alloc', 'ss-handover'])
      : stageId === 's-notready'
        ? pick(['ss-budget', 'ss-family', 'ss-timing'])
        : stageId === 's-negotiating'
          ? pick(['ss-price', 'ss-plan'])
          : null

    // Weighted toward the instalment plans, which is what Flinx actually sells —
    // outright is the minority case in their published schedules.
    const plan = willClose
      ? pick([
          'pp-outright',
          'pp-60day',
          'pp-3mo', 'pp-3mo',
          'pp-4mo', 'pp-4mo',
          'pp-6mo', 'pp-6mo', 'pp-6mo',
        ].map((planId) => payment_plans.find((p) => p.id === planId)!))
      : null

    deals.push({
      id,
      contact_id: contact.id,
      property_id: property?.id ?? null,
      owner_user_id: contact.owner_user_id,
      team_id: teamOf(contact.owner_user_id),
      stage_id: stageId,
      sub_status_id: subStatus,
      amount_minor: stageById.get(stageId)!.requires_amount || chance(0.7) ? amount_minor : 0,
      currency,
      fx_rate_to_ngn: fx,
      amount_ngn_minor: toNgnMinor(amount_minor, currency, fx),
      title: property ? `${property.estate} — ${contact.first_name} ${contact.last_name}` : `Enquiry — ${contact.first_name} ${contact.last_name}`,
      expected_close_on: closed_at ? null : dateOnly(addDays(now, randInt(-20, 90))),
      closed_at,
      created_at: iso(dealStart),
      updated_at: iso(addDays(dealStart, randInt(1, 40))),
      payment_plan_id: plan?.id ?? null,
    })

    // Stage history — the path this deal actually walked (R-PIP-7).
    const target = stageById.get(stageId)!
    const path = pipeline_stages
      .filter((s) => !s.is_lost && s.sort_order <= target.sort_order)
      .sort((a, b) => a.sort_order - b.sort_order)
    const walk = target.is_lost ? [...path.slice(0, randInt(1, 3)), target] : path
    let cursor = dealStart
    let prev: string | null = null
    for (const stage of walk) {
      deal_stage_history.push({
        id: `dh-${deal_stage_history.length + 1}`,
        deal_id: id,
        from_stage_id: prev,
        to_stage_id: stage.id,
        changed_by: contact.owner_user_id,
        changed_at: iso(cursor),
      })
      prev = stage.id
      cursor = addDays(cursor, randInt(3, 22))
      if (cursor > now) cursor = addDays(now, -randInt(0, 3))
    }

    // Payments and schedule — add-on §9 data, sitting alongside without touching the deal value.
    if (willClose && plan) {
      const closeDate = new Date(closed_at!)
      const depositMinor = Math.round((amount_minor * plan.deposit_percent) / 100)
      const remainder = amount_minor - depositMinor
      const instalments = Math.max(0, plan.instalment_count - 1)
      const perInstalment = instalments > 0 ? Math.round(remainder / instalments) : 0

      deal_schedule.push({
        id: `ds-${deal_schedule.length + 1}`,
        deal_id: id,
        due_on: dateOnly(closeDate),
        amount_minor: depositMinor,
        currency,
        sequence: 0,
      })
      for (let k = 1; k <= instalments; k++) {
        deal_schedule.push({
          id: `ds-${deal_schedule.length + 1}`,
          deal_id: id,
          due_on: dateOnly(addMonths(closeDate, k)),
          amount_minor: k === instalments ? remainder - perInstalment * (instalments - 1) : perInstalment,
          currency,
          sequence: k,
        })
      }

      /*
       * How much has actually landed.
       *
       * Deliberately varied, and deliberately including buyers who have fallen
       * behind — a collections report on a book where everyone pays on time shows
       * nothing, and instalment buyers falling behind is the situation the ledger
       * exists for. Roughly half stay current; the rest are one to four instalments
       * short, which spreads the ageing across all four buckets.
       */
      const dueItems = deal_schedule.filter((s) => s.deal_id === id)
      const pastDue = dueItems.filter((s) => new Date(`${s.due_on}T00:00:00`) <= now).length
      const fullyPaid = subStatus === 'ss-full' || subStatus === 'ss-handover' || subStatus === 'ss-alloc'

      let behind = 0
      if (!fullyPaid) {
        const roll = rng()
        behind = roll < 0.45 ? 0 : roll < 0.7 ? 1 : roll < 0.85 ? 2 : randInt(3, 4)
      }
      const paidThrough = fullyPaid
        ? dueItems.length
        : Math.max(1, Math.min(pastDue, dueItems.length) - behind)

      for (let k = 0; k < paidThrough; k++) {
        const item = dueItems[k]
        const receivedOn = addDays(new Date(`${item.due_on}T00:00:00`), randInt(-3, 9))
        if (receivedOn > now) break
        // A USD tranche converts at the rate on the day it landed, not the deal's rate (R-PAY-6).
        const trancheFx = currency === 'USD' ? fx! + randInt(-60, 90) : null
        deal_payments.push({
          id: `dp-${deal_payments.length + 1}`,
          deal_id: id,
          amount_minor: item.amount_minor,
          currency,
          fx_rate_to_ngn: trancheFx,
          amount_ngn_minor: toNgnMinor(item.amount_minor, currency, trancheFx),
          received_on: dateOnly(receivedOn),
          method: pick<DealPayment['method']>(['transfer', 'transfer', 'transfer', 'cheque', 'cash']),
          reference: `FLX/${dateOnly(receivedOn).replace(/-/g, '')}/${String(deal_payments.length + 1).padStart(4, '0')}`,
          reverses_payment_id: null,
          recorded_by: contact.owner_user_id,
          recorded_at: iso(addDays(receivedOn, randInt(0, 2))),
        })
      }
    }
  }

  // A repeat buyer — one contact, two purchases (R-PIP-5). Reporting has to represent this.
  const repeatBuyer = contacts.find((c) => deals.some((d) => d.contact_id === c.id && d.stage_id === 's-closed'))
  if (repeatBuyer) {
    const firstPurchase = deals.find((d) => d.contact_id === repeatBuyer.id && d.stage_id === 's-closed')!
    const secondStart = addDays(now, -randInt(25, 70))
    const secondProperty = sellingProperties[0]
    const id = `d-${++dealSerial}`
    deals.push({
      id,
      contact_id: repeatBuyer.id,
      property_id: secondProperty.id,
      owner_user_id: firstPurchase.owner_user_id,
      team_id: firstPurchase.team_id,
      stage_id: 's-negotiating',
      sub_status_id: 'ss-plan',
      amount_minor: toMinor(64_500_000),
      currency: 'NGN',
      fx_rate_to_ngn: null,
      amount_ngn_minor: toMinor(64_500_000),
      title: `${secondProperty.estate} — second purchase, ${repeatBuyer.first_name} ${repeatBuyer.last_name}`,
      expected_close_on: dateOnly(addDays(now, 24)),
      closed_at: null,
      created_at: iso(secondStart),
      updated_at: iso(addDays(secondStart, 8)),
      payment_plan_id: null,
    })
    deal_stage_history.push({
      id: `dh-${deal_stage_history.length + 1}`,
      deal_id: id,
      from_stage_id: null,
      to_stage_id: 's-negotiating',
      changed_by: firstPurchase.owner_user_id,
      changed_at: iso(secondStart),
    })
  }

  /* ------------------------------- activities ------------------------------- */
  /*
   * Logging discipline varies by person on purpose. This is the whole reason the
   * client wants the system: one salesperson's records are kept as the work happens
   * and another's are back-filled in a single session before a review, and until now
   * there has been no way to tell the two apart.
   */
  const DISCIPLINE: Record<string, { mean: number; spread: number }> = {
    'u-sp-1': { mean: 0.2, spread: 0.4 }, // Tunde — logs same day
    'u-sp-2': { mean: 0.9, spread: 1.2 },
    'u-sp-3': { mean: 6.5, spread: 5.0 }, // Kelechi — the problem case
    'u-sp-4': { mean: 1.1, spread: 1.4 },
    'u-sp-5': { mean: 2.6, spread: 3.0 },
    'u-sp-6': { mean: 0.3, spread: 0.5 }, // Halima — logs same day
    'u-sp-7': { mean: 3.2, spread: 3.4 },
    'u-sp-8': { mean: 4.4, spread: 3.8 },
    'u-sp-9': { mean: 1.4, spread: 1.6 },
    'u-lead-1': { mean: 0.6, spread: 0.8 },
    'u-lead-2': { mean: 0.7, spread: 0.9 },
  }

  const INSPECTION_NOTES = [
    'Walked {name} through the {type} at {estate}. Spent most of the time on finishing quality and the parking allocation. Asked what the service charge covers — quoted the standard schedule. Wants to bring a spouse back at the weekend.',
    'Inspection at {estate}. {name} liked the unit but felt the {type} was tight for a family. Showed the larger layout on the next floor; asked for the price difference in writing.',
    'Second viewing at {estate} with {name} and their surveyor. Surveyor asked about the title documents and the completion date. Promised to send the C of O reference and the build schedule.',
    '{name} came to {estate} with two family members. Positive throughout. Main question was whether the 6-month plan is available on this unit — confirmed it is.',
    'Site visit to {estate}. Roads were the first thing {name} raised. Explained the estate infrastructure plan. Asked to see a completed development before deciding.',
  ]
  const MEETING_NOTES = [
    'Met {name} at the Borno Way office. Went through the payment plans side by side — outright versus 6 months. Their concern is committing before the next school fees cycle. Agreed to revisit in three weeks.',
    'Office meeting with {name}. Wants the unit as a rental investment, so most of the conversation was yield: expected rent, occupancy in the area, and service charge. Sent the projection sheet after.',
    'Sat with {name} and their partner. Partner is the decision-maker and had not seen the unit. Booked an inspection for Saturday.',
    'Meeting to review the offer. {name} pushed for a discount on the outright plan. Explained the published pricing. They asked for time to think.',
    'Met {name} at their office in Victoria Island. Brought the brochure and the plan breakdown. They are comparing us with two other developments — asked what our completion track record looks like.',
  ]
  const CALL_NOTES = [
    'Called {name} to follow up on the inspection. They are still interested but waiting on funds from a property sale. Asked to be called back at the end of the month.',
    'Follow-up call. {name} said the price is above what they had budgeted. Suggested the {estate} studio units instead — they asked for the price list.',
    'Called {name}. Not reachable on the first number; got through on the alternate. Confirmed they received the payment plan and are reviewing with their spouse.',
    'Spoke to {name} for about ten minutes. They have decided against buying this year — job change. Asked to stay on the list for next year.',
    'Called about the outstanding commitment fee. {name} confirmed transfer will go out on Friday and asked for the account details again.',
  ]
  const WHATSAPP_NOTES = [
    'Sent {name} the {estate} floor plans and the current price list. They replied asking whether the studio units are still available.',
    'WhatsApp exchange with {name} about the 4-month plan. Sent the instalment breakdown. They said they will confirm by the weekend.',
    'Shared the site progress photos for {estate} with {name}. Good response — asked when the next inspection window is.',
    'Messaged {name} the payment schedule. They queried the second instalment date; corrected it and resent.',
  ]
  const NOTE_NOTES = [
    'Client called the office directly asking for a callback. Passed to me by reception. Logging so it is on record.',
    'Referred to us by an existing owner. Warm lead — worth prioritising.',
    'Left a voicemail. No answer on either number for a week now.',
    'Client asked to be removed from the campaign list but happy to be contacted about future developments.',
  ]

  const activities: Activity[] = []
  const dealByContact = new Map<string, Deal>()
  for (const d of deals) if (!dealByContact.has(d.contact_id)) dealByContact.set(d.contact_id, d)

  const activeContacts = contacts.filter((c) => !c.do_not_contact)

  function noteFor(type: ActivityType, name: string, estate: string, unitType: string): string {
    const pool =
      type === 'inspection' ? INSPECTION_NOTES
      : type === 'meeting' ? MEETING_NOTES
      : type === 'call' ? CALL_NOTES
      : type === 'whatsapp' ? WHATSAPP_NOTES
      : NOTE_NOTES
    return pick(pool).replace(/\{name\}/g, name).replace(/\{estate\}/g, estate).replace(/\{type\}/g, unitType)
  }

  function pushActivity(
    contact: Contact,
    type: ActivityType,
    occurredAt: Date,
    loggedAt: Date,
    property: Property | null,
  ) {
    const deal = dealByContact.get(contact.id) ?? null
    const prop = property ?? (deal?.property_id ? properties.find((p) => p.id === deal.property_id) ?? null : null)
    activities.push({
      id: `a-${activities.length + 1}`,
      type,
      contact_id: contact.id,
      deal_id: deal?.id ?? null,
      property_id: type === 'inspection' ? (prop ?? sellingProperties[0]).id : chance(0.3) ? (prop?.id ?? null) : null,
      user_id: contact.owner_user_id,
      occurred_at: iso(occurredAt),
      logged_at: iso(loggedAt),
      duration_minutes:
        type === 'inspection' ? randInt(45, 120)
        : type === 'meeting' ? randInt(25, 75)
        : type === 'call' ? randInt(3, 18)
        : null,
      outcome:
        type === 'inspection' ? pick(['Interested', 'Wants a second viewing', 'Too small', 'Comparing options'])
        : type === 'meeting' ? pick(['Positive', 'Needs time', 'Price objection', 'Ready to proceed'])
        : type === 'call' ? pick(['Reached', 'No answer', 'Call back requested', 'Left voicemail'])
        : null,
      notes: noteFor(
        type,
        `${contact.first_name} ${contact.last_name}`,
        (prop ?? sellingProperties[0]).estate,
        (prop ?? sellingProperties[0]).property_type.split(' ')[0],
      ),
    })
  }

  for (const contact of activeContacts) {
    const owner = contact.owner_user_id
    const discipline = DISCIPLINE[owner] ?? { mean: 1.5, spread: 2 }
    const ageDays = Math.round((now.getTime() - new Date(contact.created_at).getTime()) / DAY)
    const count = Math.min(randInt(1, 6), Math.max(1, Math.floor(ageDays / 14) + 1))

    for (let k = 0; k < count; k++) {
      const daysAgo = randInt(1, Math.max(2, Math.min(ageDays, 175)))
      const occurred = addDays(now, -daysAgo)
      occurred.setHours(randInt(9, 18), pick([0, 15, 30, 45]), 0, 0)

      const type = pick<ActivityType>([
        'call', 'call', 'call', 'whatsapp', 'whatsapp', 'meeting', 'meeting', 'inspection', 'note',
      ])

      const delayDays = Math.max(0, discipline.mean + (rng() - 0.5) * 2 * discipline.spread)
      let logged = new Date(occurred.getTime() + delayDays * DAY)
      if (logged > now) logged = new Date(now.getTime() - randInt(1, 60) * 60 * 1000)

      pushActivity(
        contact,
        type,
        occurred,
        logged,
        type === 'inspection' ? pick(sellingProperties) : null,
      )
    }
  }

  /*
   * The back-fill. Kelechi's last review was a fortnight ago; the eighteen records
   * below all went in during one two-hour session the night before it, covering work
   * spread across the previous five weeks. Two timestamps make that visible. One
   * would not.
   */
  const reviewEve = addDays(now, -15)
  reviewEve.setHours(21, 40, 0, 0)
  const kelechiContacts = activeContacts.filter((c) => c.owner_user_id === 'u-sp-3').slice(0, 18)
  kelechiContacts.forEach((contact, k) => {
    const occurred = addDays(reviewEve, -randInt(6, 36))
    occurred.setHours(randInt(9, 17), pick([0, 30]), 0, 0)
    const logged = new Date(reviewEve.getTime() + k * randInt(3, 9) * 60 * 1000)
    pushActivity(
      contact,
      pick<ActivityType>(['meeting', 'meeting', 'inspection', 'call']),
      occurred,
      logged,
      pick(sellingProperties),
    )
  })

  activities.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())

  /* -------------------------------- web leads ------------------------------- */

  const web_leads: WebLead[] = [
    ...Array.from({ length: 6 }, (_, i) => {
      const submitted = addDays(now, -randInt(1, 21))
      submitted.setHours(randInt(8, 23), randInt(0, 59), 0, 0)
      const routed = chance(0.7)
      const first = pick(FIRST_NAMES)
      const last = pick(LAST_NAMES)
      const property = pick(sellingProperties)
      return {
        id: `wl-${i + 1}`,
        full_name: `${first} ${last}`,
        phone: normalizePhone(`080${String(9100000 + i * 137).slice(-8)}`),
        email: normalizeEmail(`${first}.${last}@gmail.com`),
        form: pick<WebLead['form']>(['apartment_availability', 'unit_availability', 'inspection_booking']),
        page: `/properties/${property.estate.toLowerCase().replace(/\s+/g, '-')}`,
        campaign: chance(0.7) ? pick(CAMPAIGNS) : null,
        apartment_type: pick(['Studio', '1 bedroom', '2 bedroom', '3 bedroom']),
        budget_band: pick(['₦40m – ₦60m', '₦60m – ₦90m', '₦90m – ₦120m', '₦120m+']),
        project_interest: property.title,
        timeline: pick(['Immediately', 'Within 3 months', '3 – 6 months', 'Just researching']),
        preferred_channel: pick<WebLead['preferred_channel']>(['whatsapp', 'call', 'email']),
        preferred_dates: chance(0.4) ? `${dateOnly(addDays(now, randInt(1, 12)))} (morning)` : null,
        submitted_at: iso(submitted),
        routed_to_user_id: routed ? pick(salespeople).id : null,
        routed_at: routed ? iso(new Date(submitted.getTime() + randInt(2, 90) * 60 * 1000)) : null,
        first_response_at: routed && chance(0.65)
          ? iso(new Date(submitted.getTime() + randInt(20, 2400) * 60 * 1000))
          : null,
        contact_id: null,
        message: chance(0.5)
          ? pick([
              'Please send me the price list and available units.',
              'I am based in the UK, is a virtual inspection possible?',
              'Interested in the co-ownership option — how does it work?',
              'What is the payment plan for the studio units?',
            ])
          : null,
      }
    }),
    // Two that nobody has picked up. First-response time is measurable from submission (R-WEB-3).
    {
      id: 'wl-7',
      full_name: 'Oluwaseun Adigun',
      phone: normalizePhone('08034471192'),
      email: 'seun.adigun@gmail.com',
      form: 'apartment_availability',
      page: '/properties/bristol-2',
      campaign: 'Meta — Bristol 2 Jul 2026',
      apartment_type: '3 bedroom',
      budget_band: '₦120m+',
      project_interest: 'Bristol Apartments 2',
      timeline: 'Immediately',
      preferred_channel: 'call',
      preferred_dates: null,
      submitted_at: iso(addDays(now, -3)),
      routed_to_user_id: null,
      routed_at: null,
      first_response_at: null,
      contact_id: null,
      message: 'Ready to buy this month. Please call me today.',
    },
    {
      id: 'wl-8',
      full_name: 'Chiagozie Mbah',
      phone: normalizePhone('08129930417'),
      email: 'c.mbah@outlook.com',
      form: 'inspection_booking',
      page: '/properties/wells-iv',
      campaign: 'Meta — Wells IV Aug 2026',
      apartment_type: 'Studio',
      budget_band: '₦40m – ₦60m',
      project_interest: 'Wells IV Apartment',
      timeline: 'Within 3 months',
      preferred_channel: 'whatsapp',
      preferred_dates: `${dateOnly(addDays(now, 4))} (afternoon)`,
      submitted_at: iso(addDays(now, -6)),
      routed_to_user_id: null,
      routed_at: null,
      first_response_at: null,
      contact_id: null,
      message: 'Would like to book an inspection for the studio unit.',
    },
  ]

  const db: Database = {
    users,
    teams,
    team_memberships,
    contacts,
    contact_channels,
    import_batches,
    properties,
    pipeline_stages,
    pipeline_sub_statuses,
    deals,
    deal_stage_history,
    activities,
    deal_payments,
    deal_schedule,
    payment_plans,
    web_leads,
    settings: {
      company_name: 'Flinx Realty Ltd',
      allow_multi_team: true,
      default_usd_ngn_rate: 1_565,
      reporting_currency: 'NGN',
      payment_ledger_enabled: true,
      website_integration_enabled: true,
    },
  }

  // Contact status is derived, so set it from the deals rather than seeding it by hand.
  for (const contact of db.contacts) {
    const contactDeals = db.deals.filter((d) => d.contact_id === contact.id)
    if (contactDeals.length === 0) {
      // People who never reach a deal are exactly the manual-override case (R-PIP-6).
      contact.lifecycle_status_override = chance(0.22) ? 'Not interested' : null
    }
  }

  return db
}
