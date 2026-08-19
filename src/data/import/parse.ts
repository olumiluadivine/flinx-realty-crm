/**
 * Parsers for the two formats the client actually has (R-CON-1): CSV out of an ad
 * agency's spreadsheet, and vCard off a salesperson's phone.
 *
 * Both collapse to the same `ParsedRow`, so the dedupe engine downstream never needs
 * to know which one it came from.
 */
import { isProbablyEmail, normalizeChannel } from '../phone'
import type { ChannelKind } from '../schema'

export interface ParsedChannel {
  kind: ChannelKind
  value: string
  normalized: string
  label: string | null
}

export interface ParsedRow {
  /** 1-based line/card number, for the failure list. */
  index: number
  first_name: string
  last_name: string
  company: string | null
  channels: ParsedChannel[]
  notes: string | null
  /** Populated when the row can't be used at all. */
  error: string | null
}

export interface ParseResult {
  format: 'csv' | 'vcard'
  rows: ParsedRow[]
}

/* ------------------------------- CSV ------------------------------------ */

/** RFC-4180-ish splitter: handles quoted fields, embedded commas and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(field)
      field = ''
    } else {
      field += ch
    }
  }
  out.push(field)
  return out.map((f) => f.trim())
}

const HEADER_ALIASES: Record<string, string> = {
  'first name': 'first_name',
  firstname: 'first_name',
  'given name': 'first_name',
  'last name': 'last_name',
  lastname: 'last_name',
  surname: 'last_name',
  'family name': 'last_name',
  'full name': 'full_name',
  name: 'full_name',
  company: 'company',
  organisation: 'company',
  organization: 'company',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  'mobile number': 'phone',
  msisdn: 'phone',
  telephone: 'phone',
  'phone 2': 'phone2',
  'phone number 2': 'phone2',
  'alt phone': 'phone2',
  whatsapp: 'whatsapp',
  email: 'email',
  'email address': 'email',
  'e-mail': 'email',
  'email 2': 'email2',
  notes: 'notes',
  comment: 'notes',
  message: 'notes',
}

export function parseCsv(text: string): ParseResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { format: 'csv', rows: [] }

  const headers = splitCsvLine(lines[0]).map((h) => HEADER_ALIASES[h.toLowerCase()] ?? h.toLowerCase())
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const get = (key: string) => {
      const idx = headers.indexOf(key)
      return idx >= 0 ? (cells[idx] ?? '') : ''
    }

    let first = get('first_name')
    let last = get('last_name')
    const full = get('full_name')
    if (!first && !last && full) {
      const parts = full.split(/\s+/)
      first = parts[0] ?? ''
      last = parts.slice(1).join(' ')
    }

    const channels: ParsedChannel[] = []
    const pushChannel = (kind: ChannelKind, value: string, label: string | null) => {
      const v = value.trim()
      if (!v) return
      const normalized = normalizeChannel(kind, v)
      if (!normalized || normalized === '+') return
      if (channels.some((c) => c.normalized === normalized)) return
      channels.push({ kind, value: v, normalized, label })
    }
    pushChannel('phone', get('phone'), 'Mobile')
    pushChannel('phone', get('phone2'), 'Alternate')
    pushChannel('whatsapp', get('whatsapp'), 'WhatsApp')
    pushChannel('email', get('email'), 'Email')
    pushChannel('email', get('email2'), 'Alternate')

    const name = `${first} ${last}`.trim()
    let error: string | null = null
    if (!name) error = 'No name in row'
    else if (channels.length === 0) error = 'No usable phone number or email'

    rows.push({
      index: i,
      first_name: first,
      last_name: last,
      company: get('company') || null,
      channels,
      notes: get('notes') || null,
      error,
    })
  }

  return { format: 'csv', rows }
}

/* ------------------------------ vCard ----------------------------------- */

/**
 * vCard 2.1/3.0/4.0. Real phone exports are messy — folded lines, quoted-printable
 * encoding, TYPE parameters in either syntax, several TEL entries per card. All of
 * that shows up in the client's actual data, so all of it is handled here.
 */
export function parseVCard(text: string): ParseResult {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '')
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1)
  const rows: ParsedRow[] = []

  cards.forEach((card, i) => {
    const body = card.split(/END:VCARD/i)[0]
    const lines = body.split('\n').filter((l) => l.trim())

    let first = ''
    let last = ''
    let fullName = ''
    let company: string | null = null
    let notes: string | null = null
    const channels: ParsedChannel[] = []

    for (const line of lines) {
      const sep = line.indexOf(':')
      if (sep < 0) continue
      const rawKey = line.slice(0, sep)
      let value = line.slice(sep + 1).trim()
      const keyParts = rawKey.split(';')
      const name = keyParts[0].split('.').pop()!.toUpperCase()
      const params = keyParts.slice(1).map((p) => p.toUpperCase())

      if (params.some((p) => p.includes('QUOTED-PRINTABLE'))) value = decodeQuotedPrintable(value)

      switch (name) {
        case 'N': {
          const parts = value.split(';')
          last = (parts[0] ?? '').trim()
          first = (parts[1] ?? '').trim()
          break
        }
        case 'FN':
          fullName = value
          break
        case 'ORG':
          company = value.split(';')[0].trim() || null
          break
        case 'NOTE':
          notes = value || null
          break
        case 'TEL': {
          const isWhatsApp = params.some((p) => p.includes('WHATSAPP'))
          pushChannel(channels, isWhatsApp ? 'whatsapp' : 'phone', value, telLabel(params))
          break
        }
        case 'EMAIL':
          pushChannel(channels, 'email', value, emailLabel(params))
          break
      }
    }

    if (!first && !last && fullName) {
      const parts = fullName.split(/\s+/)
      first = parts[0] ?? ''
      last = parts.slice(1).join(' ')
    }

    const display = `${first} ${last}`.trim()
    let error: string | null = null
    if (!display) error = 'Card has no N or FN property'
    else if (channels.length === 0) error = 'Card has no TEL or EMAIL property'

    rows.push({
      index: i + 1,
      first_name: first,
      last_name: last,
      company,
      channels,
      notes,
      error,
    })
  })

  return { format: 'vcard', rows }
}

function pushChannel(
  channels: ParsedChannel[],
  kind: ChannelKind,
  value: string,
  label: string | null,
): void {
  const v = value.trim()
  if (!v) return
  if (kind === 'email' && !isProbablyEmail(v)) return
  const normalized = normalizeChannel(kind, v)
  if (!normalized || normalized === '+') return
  if (channels.some((c) => c.normalized === normalized)) return
  channels.push({ kind, value: v, normalized, label })
}

function telLabel(params: string[]): string {
  if (params.some((p) => p.includes('CELL'))) return 'Mobile'
  if (params.some((p) => p.includes('WORK'))) return 'Work'
  if (params.some((p) => p.includes('HOME'))) return 'Home'
  return 'Phone'
}

function emailLabel(params: string[]): string {
  if (params.some((p) => p.includes('WORK'))) return 'Work'
  if (params.some((p) => p.includes('HOME'))) return 'Personal'
  return 'Email'
}

/**
 * Quoted-printable encodes *bytes*, so `=C3=A1` is two bytes of UTF-8 for "á" — not
 * two characters. Decoding them one at a time turns Adéwálé into AdÃ©wÃ¡lÃ©, which
 * is exactly the mangling people expect from a cheap CRM import.
 */
function decodeQuotedPrintable(input: string): string {
  const withoutSoftBreaks = input.replace(/=\r?\n/g, '')
  const bytes: number[] = []
  for (let i = 0; i < withoutSoftBreaks.length; i++) {
    const ch = withoutSoftBreaks[i]
    const hex = /^=([0-9A-F]{2})$/i.exec(withoutSoftBreaks.slice(i, i + 3))
    if (hex) {
      bytes.push(parseInt(hex[1], 16))
      i += 2
    } else {
      // Anything not hex-escaped is already plain ASCII in this encoding.
      for (const byte of new TextEncoder().encode(ch)) bytes.push(byte)
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
}

/* ------------------------------ entry point ----------------------------- */

export function parseImportFile(filename: string, text: string): ParseResult {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.vcf') || lower.endsWith('.vcard') || /BEGIN:VCARD/i.test(text.slice(0, 400))) {
    return parseVCard(text)
  }
  return parseCsv(text)
}
