/**
 * The dedupe engine (R-CON-4, R-CON-10).
 *
 * Match on normalised phone first, then email. The same engine serves the bulk import
 * and the "add contact" form — a single manual entry must not create a duplicate the
 * bulk path would have caught, and the only way to guarantee that is to have one
 * implementation rather than two.
 *
 * Nothing here mutates the database. It produces a *plan* the user reviews before
 * committing, which is what makes an import reversible in practice as well as on
 * paper (R-CON-3).
 */
import { normalizeChannel } from '../phone'
import type { ChannelKind, Contact, Database, Id } from '../schema'
import type { ParsedRow } from './parse'

export type RowOutcome = 'create' | 'merge' | 'fail'

export interface DedupeMatch {
  contactId: Id
  contactName: string
  /** Which channel value made the match — shown in the preview so the decision is auditable. */
  matchedOn: ChannelKind
  matchedValue: string
  ownerUserId: Id
}

export interface PlannedRow {
  row: ParsedRow
  outcome: RowOutcome
  match: DedupeMatch | null
  /** Channels that would be added to the matched contact — the reason merging is worth doing. */
  newChannels: ParsedRow['channels']
  reason: string
}

export interface ImportPlan {
  rows: PlannedRow[]
  created: number
  merged: number
  failed: number
  /** Merges landing on a contact owned by someone else — an ownership question, not a technical one. */
  crossOwnerMerges: number
}

/** normalised channel value → contact, built once per plan rather than per row. */
export function buildChannelIndex(db: Database): Map<string, Contact> {
  const contactById = new Map(db.contacts.map((c) => [c.id, c]))
  const index = new Map<string, Contact>()
  for (const channel of db.contact_channels) {
    const contact = contactById.get(channel.contact_id)
    if (!contact) continue
    if (!index.has(channel.value_normalized)) index.set(channel.value_normalized, contact)
  }
  return index
}

/**
 * Find an existing contact for a set of channels. Phones are checked before emails —
 * a shared family email address is a far weaker signal of identity than a mobile number.
 */
export function findMatch(
  index: Map<string, Contact>,
  channels: { kind: ChannelKind; normalized: string; value: string }[],
): DedupeMatch | null {
  const phones = channels.filter((c) => c.kind === 'phone' || c.kind === 'whatsapp')
  const emails = channels.filter((c) => c.kind === 'email')

  for (const c of [...phones, ...emails]) {
    const hit = index.get(c.normalized)
    if (hit) {
      return {
        contactId: hit.id,
        contactName: `${hit.first_name} ${hit.last_name}`.trim(),
        matchedOn: c.kind,
        matchedValue: c.value,
        ownerUserId: hit.owner_user_id,
      }
    }
  }
  return null
}

/**
 * Build the plan for a parsed file. Rows are matched against the database *and*
 * against each other, so a file containing the same person twice creates one contact
 * rather than two.
 */
export function planImport(db: Database, rows: ParsedRow[]): ImportPlan {
  const index = buildChannelIndex(db)
  const contactChannels = new Map<Id, Set<string>>()
  for (const ch of db.contact_channels) {
    if (!contactChannels.has(ch.contact_id)) contactChannels.set(ch.contact_id, new Set())
    contactChannels.get(ch.contact_id)!.add(ch.value_normalized)
  }

  // Channels claimed by earlier rows in this same file.
  const withinFile = new Map<string, { name: string; rowIndex: number }>()

  const planned: PlannedRow[] = rows.map((row) => {
    if (row.error) {
      return { row, outcome: 'fail', match: null, newChannels: [], reason: row.error }
    }

    const match = findMatch(index, row.channels)
    if (match) {
      const known = contactChannels.get(match.contactId) ?? new Set()
      const newChannels = row.channels.filter((c) => !known.has(c.normalized))
      const owner = db.users.find((u) => u.id === match.ownerUserId)
      return {
        row,
        outcome: 'merge',
        match,
        newChannels,
        reason: newChannels.length
          ? `Matches ${match.contactName} on ${match.matchedValue} — adds ${newChannels.length} new ${newChannels.length === 1 ? 'channel' : 'channels'}${owner ? `, owned by ${owner.full_name}` : ''}`
          : `Already on file as ${match.contactName} — nothing new to add`,
      }
    }

    const dupInFile = row.channels
      .map((c) => withinFile.get(c.normalized))
      .find((v): v is { name: string; rowIndex: number } => !!v)
    if (dupInFile) {
      return {
        row,
        outcome: 'merge',
        match: null,
        newChannels: [],
        reason: `Duplicate of row ${dupInFile.rowIndex} in this same file (${dupInFile.name})`,
      }
    }

    const name = `${row.first_name} ${row.last_name}`.trim()
    for (const c of row.channels) withinFile.set(c.normalized, { name, rowIndex: row.index })
    return { row, outcome: 'create', match: null, newChannels: row.channels, reason: 'New contact' }
  })

  return {
    rows: planned,
    created: planned.filter((p) => p.outcome === 'create').length,
    merged: planned.filter((p) => p.outcome === 'merge').length,
    failed: planned.filter((p) => p.outcome === 'fail').length,
    crossOwnerMerges: 0, // filled in by the caller, which knows the importing user
  }
}

/** Count merges that would land on a contact owned by someone other than `importerId`. */
export function countCrossOwnerMerges(plan: ImportPlan, importerId: Id): number {
  return plan.rows.filter((p) => p.outcome === 'merge' && p.match && p.match.ownerUserId !== importerId)
    .length
}

/**
 * Same check, for the manual "add contact" form (R-CON-10). Returns the contact that
 * would be duplicated, if any.
 */
export function checkManualDuplicate(
  db: Database,
  channels: { kind: ChannelKind; value: string }[],
): DedupeMatch | null {
  const index = buildChannelIndex(db)
  const normalized = channels
    .filter((c) => c.value.trim())
    .map((c) => ({ kind: c.kind, value: c.value, normalized: normalizeChannel(c.kind, c.value) }))
  return findMatch(index, normalized)
}
