/**
 * Tests for the rules that would be embarrassing to get wrong in front of the client:
 * who can see what, whether a duplicate slips through, and whether the money adds up.
 */
import { describe, expect, it } from 'vitest'
import { buildSeed } from './seed'
import { buildScope, scopeActivities, scopeContacts, scopeDeals, primaryTeamId } from './scope'
import { normalizeEmail, normalizePhone } from './phone'
import { formatMoneyCompact, parseMoneyToMinor, toMinor, toNgnMinor } from './money'
import {
  averageLoggingDelayDays,
  deriveContactStatus,
  detectBackfillBursts,
  effectivePayments,
  isWon,
  loggingDelayDays,
  outstandingNgnMinor,
  overdueSchedule,
  totalSoldNgnMinor,
} from './derive'
import { parseCsv, parseVCard, splitCsvLine } from './import/parse'
import { normalizeHandle, socialUrl, socialDisplay } from './social'
import { isSocialKind } from './schema'
import { buildChannelIndex, checkManualDuplicate, planImport } from './import/dedupe'
import type { Database } from './schema'

const db: Database = buildSeed(new Date('2026-08-19T10:00:00Z'))
const userOf = (id: string) => db.users.find((u) => u.id === id)!

describe('phone normalisation — the dedupe key', () => {
  it('collapses every way a Lagos mobile is written into one value', () => {
    const forms = ['0803 123 4567', '+2348031234567', '234 803 123 4567', '08031234567', '8031234567']
    const normalized = new Set(forms.map(normalizePhone))
    expect(normalized.size).toBe(1)
    expect([...normalized][0]).toBe('+2348031234567')
  })

  it('handles the 00 international prefix and keeps foreign numbers intact', () => {
    expect(normalizePhone('002348031234567')).toBe('+2348031234567')
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123')
  })

  it('returns empty for junk rather than a bare plus', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('n/a')).toBe('')
  })

  it('lowercases and trims emails', () => {
    expect(normalizeEmail('  Ade.Bayo@Gmail.COM ')).toBe('ade.bayo@gmail.com')
  })
})

describe('visibility — one rule, three roles (R-ACC-3/4/8)', () => {
  it('a salesperson sees only their own records', () => {
    const scope = buildScope(db, userOf('u-sp-1'))
    expect([...scope.userIds]).toEqual(['u-sp-1'])
    expect(scopeContacts(scope, db.contacts).every((c) => c.owner_user_id === 'u-sp-1')).toBe(true)
    expect(scopeDeals(scope, db.deals).every((d) => d.owner_user_id === 'u-sp-1')).toBe(true)
    expect(scopeActivities(scope, db.activities).every((a) => a.user_id === 'u-sp-1')).toBe(true)
  })

  it('a team lead sees their own team and nothing from the other one', () => {
    const scope = buildScope(db, userOf('u-lead-1'))
    expect(scope.userIds.has('u-sp-1')).toBe(true)
    expect(scope.userIds.has('u-sp-6')).toBe(false) // Diaspora team
    expect(scope.userIds.has('u-lead-2')).toBe(false)
    const otherTeamContacts = scopeContacts(scope, db.contacts).filter((c) => c.owner_user_id === 'u-sp-6')
    expect(otherTeamContacts).toHaveLength(0)
  })

  it('a multi-team salesperson is visible to both leads but rolls up under one team only', () => {
    const mainland = buildScope(db, userOf('u-lead-1'))
    const diaspora = buildScope(db, userOf('u-lead-2'))
    expect(mainland.userIds.has('u-sp-5')).toBe(true)
    expect(diaspora.userIds.has('u-sp-5')).toBe(true)
    // Counted once, under the primary team (R-REP-5).
    expect(primaryTeamId(db, 'u-sp-5')).toBe('t-mainland')
  })

  it('a super admin sees everything', () => {
    const scope = buildScope(db, userOf('u-admin-1'))
    expect(scopeContacts(scope, db.contacts)).toHaveLength(db.contacts.length)
    expect(scope.isCompanyWide).toBe(true)
  })

  it('a membership that has ended stops granting sight', () => {
    const withLeaver: Database = structuredClone(db)
    const membership = withLeaver.team_memberships.find((m) => m.user_id === 'u-sp-1')!
    membership.left_at = new Date('2026-01-01').toISOString()
    const scope = buildScope(withLeaver, userOf('u-lead-1'))
    expect(scope.userIds.has('u-sp-1')).toBe(false)
  })
})

describe('money (R-CUR-3/4)', () => {
  it('stores minor units as integers', () => {
    expect(toMinor(60_000_000)).toBe(6_000_000_000)
    expect(Number.isInteger(toMinor(118_000_000.55))).toBe(true)
  })

  it('converts USD at the frozen rate, not a live one', () => {
    const usdMinor = toMinor(50_000) // $50,000.00
    expect(toNgnMinor(usdMinor, 'USD', 1_580)).toBe(usdMinor * 1_580)
    // The same amount at a later rate must not change a historical figure — the caller
    // passes the deal's own rate, so nothing here reads a global.
    expect(toNgnMinor(usdMinor, 'USD', 1_580)).not.toBe(toNgnMinor(usdMinor, 'USD', 1_700))
  })

  it('passes NGN straight through', () => {
    expect(toNgnMinor(500, 'NGN', null)).toBe(500)
  })

  it('formats naira compactly for headline figures', () => {
    expect(formatMoneyCompact(toMinor(118_000_000))).toBe('₦118m')
    expect(formatMoneyCompact(toMinor(1_240_000_000))).toBe('₦1.24bn')
    expect(formatMoneyCompact(toMinor(60_000))).toBe('₦60k')
  })

  it('parses the shorthand a salesperson would actually type', () => {
    expect(parseMoneyToMinor('60,000,000')).toBe(toMinor(60_000_000))
    expect(parseMoneyToMinor('₦60m')).toBe(toMinor(60_000_000))
    expect(parseMoneyToMinor('not a number')).toBeNull()
  })
})

describe('reporting reads flags, never names (R-PIP-9)', () => {
  it('renaming the won stage leaves the sales total untouched', () => {
    const before = totalSoldNgnMinor(db, db.deals)
    const renamed: Database = structuredClone(db)
    renamed.pipeline_stages.find((s) => s.id === 's-closed')!.name = 'Purchase complete'
    expect(totalSoldNgnMinor(renamed, renamed.deals)).toBe(before)
    expect(before).toBeGreaterThan(0)
  })

  it('a deal in a won stage counts, one in a lost stage does not', () => {
    const won = db.deals.find((d) => d.stage_id === 's-closed')!
    const lost = db.deals.find((d) => d.stage_id === 's-notinterested')
    expect(isWon(db, won)).toBe(true)
    if (lost) expect(isWon(db, lost)).toBe(false)
  })
})

describe('contact status is derived (R-PIP-6)', () => {
  it('takes the most advanced open deal', () => {
    const contactId = db.deals.find((d) => d.stage_id === 's-negotiating')!.contact_id
    expect(deriveContactStatus(db, contactId)).toBe('Negotiating')
  })

  it('a manual override wins and survives recomputation', () => {
    const overridden: Database = structuredClone(db)
    const contactId = overridden.deals.find((d) => d.stage_id === 's-negotiating')!.contact_id
    overridden.contacts.find((c) => c.id === contactId)!.lifecycle_status_override = 'Not interested'
    expect(deriveContactStatus(overridden, contactId)).toBe('Not interested')
  })

  it('a contact with no deals falls back rather than blowing up', () => {
    const orphan = db.contacts.find((c) => !db.deals.some((d) => d.contact_id === c.id))!
    expect(deriveContactStatus(db, orphan.id)).toBeTruthy()
  })
})

describe('logging delay — the accountability measure (R-ACT-4/R-REP-6)', () => {
  it('measures the gap between happening and being typed in', () => {
    const activity = {
      occurred_at: '2026-08-01T10:00:00Z',
      logged_at: '2026-08-06T10:00:00Z',
    } as never as Parameters<typeof loggingDelayDays>[0]
    expect(loggingDelayDays(activity)).toBe(5)
  })

  it('the seeded diligent salesperson logs faster than the seeded lax one', () => {
    const diligent = db.activities.filter((a) => a.user_id === 'u-sp-1')
    const lax = db.activities.filter((a) => a.user_id === 'u-sp-3')
    expect(averageLoggingDelayDays(diligent)).toBeLessThan(averageLoggingDelayDays(lax))
  })

  it('finds the back-fill burst — many late records typed in one session', () => {
    const bursts = detectBackfillBursts(db.activities.filter((a) => a.user_id === 'u-sp-3'))
    expect(bursts.length).toBeGreaterThan(0)
    expect(Math.max(...bursts.map((b) => b.count))).toBeGreaterThanOrEqual(10)
  })

  it('never reports a negative delay', () => {
    expect(db.activities.every((a) => loggingDelayDays(a) >= 0)).toBe(true)
  })

  it('nothing in the seed is logged in the future', () => {
    const now = Date.now()
    expect(db.activities.every((a) => new Date(a.logged_at).getTime() <= now)).toBe(true)
  })
})

describe('CSV parsing', () => {
  it('handles quoted fields with embedded commas', () => {
    expect(splitCsvLine('a,"b, still b",c')).toEqual(['a', 'b, still b', 'c'])
    expect(splitCsvLine('a,"he said ""hi""",c')).toEqual(['a', 'he said "hi"', 'c'])
  })

  it('reads alternate header spellings and splits a single Name column', () => {
    const result = parseCsv('Name,Mobile,Email Address\nAdebayo Okoro,0803 111 2222,ade@example.com')
    expect(result.rows[0].first_name).toBe('Adebayo')
    expect(result.rows[0].last_name).toBe('Okoro')
    expect(result.rows[0].channels[0].normalized).toBe('+2348031112222')
  })

  it('marks a row with no usable contact detail as failed rather than importing it', () => {
    const result = parseCsv('First name,Last name,Phone\nNo,Number,')
    expect(result.rows[0].error).toBeTruthy()
  })
})

describe('vCard parsing', () => {
  const vcf = `BEGIN:VCARD
VERSION:3.0
N:Adeyemi;Ngozi;;;
FN:Ngozi Adeyemi
ORG:Zenith Bank Plc
TEL;TYPE=CELL:+234 803 444 5555
TEL;TYPE=WORK:0701 222 3333
EMAIL;TYPE=INTERNET:ngozi@example.com
NOTE:Met at the Lekki open day
END:VCARD`

  it('reads name, org, several numbers and the note', () => {
    const result = parseVCard(vcf)
    expect(result.rows).toHaveLength(1)
    const row = result.rows[0]
    expect(row.first_name).toBe('Ngozi')
    expect(row.last_name).toBe('Adeyemi')
    expect(row.company).toBe('Zenith Bank Plc')
    expect(row.channels.filter((c) => c.kind === 'phone')).toHaveLength(2)
    expect(row.notes).toBe('Met at the Lekki open day')
  })

  it('unfolds wrapped lines and decodes quoted-printable', () => {
    const folded = `BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ok=C3=A1for;Chi\n ma;;;\nTEL;CELL:08033334444\nEND:VCARD`
    const row = parseVCard(folded).rows[0]
    expect(row.last_name).toBe('Okáfor')
    expect(row.first_name).toBe('Chima')
  })
})

describe('dedupe (R-CON-4/10)', () => {
  it('matches an existing contact on a differently formatted phone number', () => {
    const existing = db.contact_channels.find((c) => c.kind === 'phone')!
    const local = `0${existing.value_normalized.slice(4)}` // +234803... → 0803...
    const csv = `First name,Last name,Phone\nDuplicate,Person,${local}`
    const plan = planImport(db, parseCsv(csv).rows)
    expect(plan.merged).toBe(1)
    expect(plan.created).toBe(0)
    expect(plan.rows[0].match?.contactId).toBe(existing.contact_id)
  })

  it('matches on email when no phone matches', () => {
    const existing = db.contact_channels.find((c) => c.kind === 'email')!
    const csv = `First name,Last name,Phone,Email\nDuplicate,Person,08099998888,${existing.value}`
    const plan = planImport(db, parseCsv(csv).rows)
    expect(plan.merged).toBe(1)
    expect(plan.rows[0].match?.matchedOn).toBe('email')
  })

  it('creates a genuinely new contact', () => {
    const csv = `First name,Last name,Phone\nBrand,New,07011112222`
    const plan = planImport(db, parseCsv(csv).rows)
    expect(plan.created).toBe(1)
    expect(plan.merged).toBe(0)
  })

  it('collapses the same person appearing twice within one file', () => {
    const csv = `First name,Last name,Phone\nSame,Person,07011113333\nSame,Person,0701 111 3333`
    const plan = planImport(db, parseCsv(csv).rows)
    expect(plan.created).toBe(1)
    expect(plan.merged).toBe(1)
  })

  it('the manual form runs the same check the bulk path runs (R-CON-10)', () => {
    const existing = db.contact_channels.find((c) => c.kind === 'phone')!
    const local = `0${existing.value_normalized.slice(4)}`
    const match = checkManualDuplicate(db, [{ kind: 'phone', value: local }])
    expect(match?.contactId).toBe(existing.contact_id)
    expect(checkManualDuplicate(db, [{ kind: 'phone', value: '07000000001' }])).toBeNull()
  })

  it('a merge lists only the channels the existing contact does not already hold', () => {
    const existing = db.contact_channels.find((c) => c.kind === 'phone')!
    const csv = `First name,Last name,Phone,Phone 2\nDup,Person,${existing.value_normalized},08055556666`
    const plan = planImport(db, parseCsv(csv).rows)
    expect(plan.rows[0].newChannels.map((c) => c.normalized)).toEqual(['+2348055556666'])
  })
})

describe('payment ledger — add-on §9', () => {
  it('outstanding is deal value minus payments, never stored', () => {
    const deal = db.deals.find((d) => isWon(db, d) && db.deal_payments.some((p) => p.deal_id === d.id))!
    const paid = effectivePayments(db, deal.id).reduce((s, p) => s + p.amount_ngn_minor, 0)
    expect(outstandingNgnMinor(db, deal)).toBe(Math.max(0, deal.amount_ngn_minor - paid))
  })

  it('a reversal cancels the payment it points at', () => {
    const payment = db.deal_payments[0]
    const reversed: Database = structuredClone(db)
    reversed.deal_payments.push({
      ...payment,
      id: 'dp-reversal',
      amount_minor: -payment.amount_minor,
      amount_ngn_minor: -payment.amount_ngn_minor,
      reverses_payment_id: payment.id,
    })
    const effective = effectivePayments(reversed, payment.deal_id)
    expect(effective.some((p) => p.id === payment.id)).toBe(false)
  })

  it('the deal value never moves when payments are recorded (R-PAY-5)', () => {
    const deal = db.deals.find((d) => isWon(db, d))!
    const before = deal.amount_ngn_minor
    const withPayment: Database = structuredClone(db)
    withPayment.deal_payments.push({
      id: 'dp-extra', deal_id: deal.id, amount_minor: toMinor(1_000_000), currency: 'NGN',
      fx_rate_to_ngn: null, amount_ngn_minor: toMinor(1_000_000), received_on: '2026-08-01',
      method: 'transfer', reference: 'X', reverses_payment_id: null,
      recorded_by: 'u-sp-1', recorded_at: new Date().toISOString(),
    })
    expect(withPayment.deals.find((d) => d.id === deal.id)!.amount_ngn_minor).toBe(before)
  })

  it('overdue instalments settle in sequence and are never negative', () => {
    const overdue = overdueSchedule(db, db.deals.filter((d) => isWon(db, d)))
    expect(overdue.every((o) => o.daysOverdue > 0 && o.amountNgnMinor > 0)).toBe(true)
  })
})

describe('the seed itself', () => {
  it('is deterministic', () => {
    const a = buildSeed(new Date('2026-08-19T10:00:00Z'))
    const b = buildSeed(new Date('2026-08-19T10:00:00Z'))
    expect(a.contacts.map((c) => c.id + c.first_name)).toEqual(b.contacts.map((c) => c.id + c.first_name))
    expect(a.deals.length).toBe(b.deals.length)
  })

  it('gives every activity a named client and real notes (R-ACT-2/3)', () => {
    expect(db.activities.every((a) => !!a.contact_id)).toBe(true)
    expect(db.activities.every((a) => a.notes.trim().length > 30)).toBe(true)
  })

  it('gives every inspection a property (R-ACT-5)', () => {
    expect(db.activities.filter((a) => a.type === 'inspection').every((a) => !!a.property_id)).toBe(true)
  })

  it('gives every contact an owner (R-CON-9) and at least one channel', () => {
    expect(db.contacts.every((c) => !!c.owner_user_id)).toBe(true)
    const withChannels = new Set(db.contact_channels.map((c) => c.contact_id))
    expect(db.contacts.every((c) => withChannels.has(c.id))).toBe(true)
  })

  it('has a repeat buyer — one contact, more than one deal (R-PIP-5)', () => {
    const counts = new Map<string, number>()
    for (const d of db.deals) counts.set(d.contact_id, (counts.get(d.contact_id) ?? 0) + 1)
    expect([...counts.values()].some((n) => n > 1)).toBe(true)
  })

  it('has USD deals carrying a frozen rate, and no NGN deal carrying one', () => {
    const usd = db.deals.filter((d) => d.currency === 'USD')
    expect(usd.length).toBeGreaterThan(0)
    expect(usd.every((d) => typeof d.fx_rate_to_ngn === 'number')).toBe(true)
    expect(db.deals.filter((d) => d.currency === 'NGN').every((d) => d.fx_rate_to_ngn === null)).toBe(true)
  })

  it('every closed deal has a value, because the stage requires one (R-PIP-4)', () => {
    expect(db.deals.filter((d) => isWon(db, d)).every((d) => d.amount_minor > 0)).toBe(true)
  })
})

describe('social profiles', () => {
  it('reduces every form people paste to the bare handle', () => {
    for (const input of [
      'https://instagram.com/ada.okeke',
      'https://www.instagram.com/ada.okeke/',
      'instagram.com/ada.okeke',
      '@ada.okeke',
      'ada.okeke',
      'HTTPS://Instagram.com/Ada.Okeke?igshid=abc',
    ]) {
      expect(normalizeHandle('instagram', input)).toBe('ada.okeke')
    }
  })

  it('strips the platform path segment LinkedIn puts in its URLs', () => {
    expect(normalizeHandle('linkedin', 'https://linkedin.com/in/ada-okeke')).toBe('ada-okeke')
    expect(normalizeHandle('linkedin', 'in/ada-okeke')).toBe('ada-okeke')
  })

  it('rebuilds a working profile link, and displays it the way the platform does', () => {
    expect(socialUrl('instagram', 'ada.okeke')).toBe('https://instagram.com/ada.okeke')
    expect(socialUrl('linkedin', 'ada-okeke')).toBe('https://linkedin.com/in/ada-okeke')
    expect(socialDisplay('instagram', 'ada.okeke')).toBe('@ada.okeke')
    expect(socialDisplay('linkedin', 'ada-okeke')).toBe('ada-okeke')
  })

  it('never lets a social handle cause a merge', () => {
    const social = db.contact_channels.find((c) => isSocialKind(c.kind))
    expect(social).toBeDefined()
    // The same handle arriving as a phone/email value must not find that contact.
    const index = buildChannelIndex(db)
    expect(index.get(social!.value_normalized)).toBeUndefined()
  })

  it('seeds social profiles across a useful share of the book', () => {
    const withSocial = new Set(
      db.contact_channels.filter((c) => isSocialKind(c.kind)).map((c) => c.contact_id),
    )
    expect(withSocial.size).toBeGreaterThan(20)
  })
})

describe('overdue is measured in whole days past the due date', () => {
  it('an instalment due today is not yet overdue', () => {
    const target: Database = structuredClone(db)
    const deal = target.deals.find((d) => isWon(target, d))!
    target.deal_payments = target.deal_payments.filter((p) => p.deal_id !== deal.id)
    target.deal_schedule = target.deal_schedule.filter((s) => s.deal_id !== deal.id)
    const today = new Date('2026-08-19T10:00:00Z')
    target.deal_schedule.push({
      id: 'ds-today', deal_id: deal.id, due_on: '2026-08-19',
      amount_minor: deal.amount_minor, currency: deal.currency, sequence: 0,
    })
    expect(overdueSchedule(target, [deal], today)).toHaveLength(0)
  })

  it('the same instalment one day later is overdue by exactly one day', () => {
    const target: Database = structuredClone(db)
    const deal = target.deals.find((d) => isWon(target, d))!
    target.deal_payments = target.deal_payments.filter((p) => p.deal_id !== deal.id)
    target.deal_schedule = target.deal_schedule.filter((s) => s.deal_id !== deal.id)
    target.deal_schedule.push({
      id: 'ds-yesterday', deal_id: deal.id, due_on: '2026-08-18',
      amount_minor: deal.amount_minor, currency: deal.currency, sequence: 0,
    })
    const out = overdueSchedule(target, [deal], new Date('2026-08-19T10:00:00Z'))
    expect(out).toHaveLength(1)
    expect(out[0].daysOverdue).toBe(1)
  })
})
