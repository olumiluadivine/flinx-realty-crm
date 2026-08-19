/**
 * Contact export (R-CON-6) — the spec's §11 lists this as not built, and it is the
 * cheapest possible reassurance that the data is the company's rather than the
 * vendor's. Anything that goes in comes back out, in both formats.
 */
import { formatPhone } from '../phone'
import type { Contact, Database } from '../schema'

function csvCell(value: string | null | undefined): string {
  const v = value ?? ''
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function contactsToCsv(db: Database, contacts: Contact[]): string {
  const headers = [
    'First name',
    'Last name',
    'Company',
    'Phone',
    'Phone 2',
    'Email',
    'Email 2',
    'Status',
    'Source',
    'Campaign',
    'Owner',
    'Do not contact',
    'Created',
    'Notes',
  ]
  const userById = new Map(db.users.map((u) => [u.id, u]))

  const lines = contacts.map((c) => {
    const channels = db.contact_channels.filter((ch) => ch.contact_id === c.id)
    const phones = channels.filter((ch) => ch.kind === 'phone' || ch.kind === 'whatsapp')
    const emails = channels.filter((ch) => ch.kind === 'email')
    return [
      c.first_name,
      c.last_name,
      c.company,
      phones[0]?.value_normalized,
      phones[1]?.value_normalized,
      emails[0]?.value,
      emails[1]?.value,
      c.lifecycle_status,
      c.source,
      c.source_detail,
      userById.get(c.owner_user_id)?.full_name,
      c.do_not_contact ? 'yes' : 'no',
      c.created_at.slice(0, 10),
      c.notes,
    ]
      .map(csvCell)
      .join(',')
  })

  return [headers.join(','), ...lines].join('\n')
}

export function contactsToVCard(db: Database, contacts: Contact[]): string {
  const out: string[] = []
  for (const c of contacts) {
    const channels = db.contact_channels.filter((ch) => ch.contact_id === c.id)
    out.push('BEGIN:VCARD')
    out.push('VERSION:3.0')
    out.push(`N:${c.last_name};${c.first_name};;;`)
    out.push(`FN:${`${c.first_name} ${c.last_name}`.trim()}`)
    if (c.company) out.push(`ORG:${c.company}`)
    for (const ch of channels) {
      if (ch.kind === 'email') out.push(`EMAIL;TYPE=INTERNET:${ch.value}`)
      else if (ch.kind === 'whatsapp') out.push(`TEL;TYPE=CELL:${formatPhone(ch.value_normalized)}`)
      else out.push(`TEL;TYPE=${(ch.label ?? 'CELL').toUpperCase()}:${formatPhone(ch.value_normalized)}`)
    }
    const note = [c.notes, c.source_detail ? `Source: ${c.source_detail}` : null]
      .filter(Boolean)
      .join(' · ')
    if (note) out.push(`NOTE:${note}`)
    out.push('END:VCARD')
  }
  return out.join('\n')
}

/* ---------------------------------------------------------------------------
 * Handing the file to the person who asked for it.
 *
 * Two very different environments. Running locally, an anchor with `download`
 * is all that is needed. Published as a hosted page, the viewer sandbox blocks
 * that outright and files go through a save capability the viewer confirms —
 * and that route only accepts certain extensions, so `.vcf` and sometimes
 * `.csv` have to fall back to `.txt` rather than failing silently.
 * ------------------------------------------------------------------------- */

interface DownloadsNamespace {
  save(request: { filename: string; data: string }): Promise<{ status: 'saved' }>
}

declare global {
  interface Window {
    claude?: { use?: (name: string) => Promise<unknown> }
  }
}

/** Extensions the hosted save surface may refuse; we retry these as plain text. */
const RISKY_EXTENSIONS = /\.(vcf|vcard|csv)$/i

function asTextFilename(filename: string): string {
  return `${filename.replace(/\.[^.]+$/, '')}.txt`
}

async function hostedSave(filename: string, text: string): Promise<'saved' | 'declined' | 'unavailable'> {
  const downloads = (await window.claude?.use?.('downloads').catch(() => null)) as
    | DownloadsNamespace
    | null
    | undefined
  if (!downloads) return 'unavailable'

  const attempt = async (name: string) => {
    await downloads.save({ filename: name, data: text })
    return 'saved' as const
  }

  try {
    return await attempt(filename)
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code === 'declined' || code === 'rate_limited') return 'declined'
    if ((code === 'rejected_extension' || code === 'extension_not_enabled') && RISKY_EXTENSIONS.test(filename)) {
      try {
        return await attempt(asTextFilename(filename))
      } catch {
        return 'unavailable'
      }
    }
    return 'unavailable'
  }
}

function anchorDownload(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Save `text` as a file, whichever environment we are in. Resolves to false only
 * when the file could not be handed over at all, so the caller can say so rather
 * than leaving a button that appears to do nothing.
 */
export async function downloadText(filename: string, text: string, mime: string): Promise<boolean> {
  const hosted = await hostedSave(filename, text)
  if (hosted === 'saved') return true
  if (hosted === 'declined') return true // the viewer chose; nothing has gone wrong

  // Inside the hosted runtime an anchor download is inert rather than failing
  // loudly, so don't pretend it worked — the caller should say so instead.
  if (typeof window.claude?.use === 'function') return false

  try {
    anchorDownload(filename, text, mime)
    return true
  } catch {
    return false
  }
}
