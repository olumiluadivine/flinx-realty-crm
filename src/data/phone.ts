import { isSocialKind, type ChannelKind } from './schema'
import { normalizeHandle } from './social'

/**
 * Phone and email normalisation — the dedupe key (R-CON-4).
 *
 * The whole import story rests on this. The same Lagos number arrives as
 * "0803 123 4567", "+2348031234567", "234 803 123 4567" and "08031234567" across a
 * vCard export, a CSV from an ad agency and a salesperson typing it in by hand. All
 * four have to collapse to one value or the CRM fills up with duplicates.
 */

const NG_COUNTRY_CODE = '234'

/**
 * Normalise to E.164 where we can. Nigerian mobile numbers are the common case, so
 * local 0-prefixed forms are promoted to +234; anything already international is kept.
 * Unrecognisable input returns digits-only rather than throwing — a weird number should
 * still dedupe against an identical weird number.
 */
export function normalizePhone(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const hadPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  // Already +234...
  if (hadPlus) return `+${stripLeadingZeros(digits)}`

  // 234803... written without the plus
  if (digits.startsWith(NG_COUNTRY_CODE) && digits.length >= 13) return `+${digits}`

  // 0803... — the local form
  if (digits.startsWith('0') && digits.length === 11) return `+${NG_COUNTRY_CODE}${digits.slice(1)}`

  // 803... — the local form with the trunk 0 dropped
  if (digits.length === 10 && /^[789]/.test(digits)) return `+${NG_COUNTRY_CODE}${digits}`

  // 00234... — international prefix
  if (digits.startsWith('00')) return `+${digits.slice(2)}`

  return `+${digits}`
}

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, '') || digits
}

/** Display form for a stored E.164 Nigerian number: +234 803 123 4567 */
export function formatPhone(e164: string): string {
  const m = /^\+234(\d{3})(\d{3})(\d{4})$/.exec(e164)
  if (m) return `+234 ${m[1]} ${m[2]} ${m[3]}`
  return e164
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isProbablyEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())
}

/** Normalise whichever kind it is — used by the import dedupe engine. */
export function normalizeChannel(kind: ChannelKind, value: string): string {
  if (kind === 'email') return normalizeEmail(value)
  if (isSocialKind(kind)) return normalizeHandle(kind, value)
  return normalizePhone(value)
}
