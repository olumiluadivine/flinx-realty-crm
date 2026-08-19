/**
 * Demonstration import files.
 *
 * Generated from the live data rather than hardcoded, so the dedupe preview always
 * has something real to catch: four people already on file — with their numbers
 * rewritten in the formats they genuinely arrive in — mixed with genuinely new
 * leads and two rows that cannot be used at all.
 */
import { formatPhone } from '../phone'
import type { Database } from '../schema'

interface Existing {
  first: string
  last: string
  phone: string
  email: string | null
}

function existingContacts(db: Database, count: number): Existing[] {
  const out: Existing[] = []
  for (const contact of db.contacts) {
    const phone = db.contact_channels.find((c) => c.contact_id === contact.id && c.kind === 'phone')
    if (!phone) continue
    const email = db.contact_channels.find((c) => c.contact_id === contact.id && c.kind === 'email')
    out.push({
      first: contact.first_name,
      last: contact.last_name,
      phone: phone.value_normalized,
      email: email?.value ?? null,
    })
    if (out.length === count) break
  }
  return out
}

/** +2348031234567 → 0803 123 4567 — the form an agency spreadsheet actually uses. */
function toLocalSpaced(e164: string): string {
  const digits = e164.replace(/^\+234/, '0').replace(/\D/g, '')
  return digits.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')
}

function toIntlSpaced(e164: string): string {
  return formatPhone(e164)
}

const NEW_LEADS = [
  ['Oluwatobi', 'Ajayi', '0803 771 4402', 'tobi.ajayi@gmail.com', 'Sterling Bank', 'Asked about the 6-month plan'],
  ['Rukayat', 'Salami', '08125590183', 'rukayat.salami@yahoo.com', '', 'Wants a studio, budget ₦55m'],
  ['Chukwuemeka', 'Obiora', '+234 706 118 2244', 'c.obiora@outlook.com', 'Seplat Energy', 'Diaspora buyer, currently in Houston'],
  ['Fatima', 'Abubakar', '0809 334 7761', 'fatima.a@gmail.com', 'Access Bank', ''],
  ['Ayodeji', 'Fashola', '07033882910', '', 'Interswitch', 'Referred by a Leeds 1 owner'],
  ['Nneka', 'Anyanwu', '0814 002 9931', 'nneka.anyanwu@gmail.com', '', 'Co-ownership enquiry'],
  ['Ibrahim', 'Danjuma', '0802 447 1120', 'i.danjuma@company-mail.com', 'Julius Berger', ''],
  ['Simisola', 'Odunsi', '09022114488', 'simi.odunsi@gmail.com', '', 'Second unit — already owns at Chester 2'],
]

/**
 * A CSV in the shape an ad agency hands over: mixed header spellings, a couple of
 * unusable rows, the same person twice, and four people already in the database.
 */
export function makeSampleCsv(db: Database): string {
  const existing = existingContacts(db, 4)
  const rows: string[] = ['First name,Last name,Mobile,Email address,Company,Notes']

  // Already on file, written the way a spreadsheet writes them.
  existing.forEach((e, i) => {
    const phone = i % 2 === 0 ? toLocalSpaced(e.phone) : toIntlSpaced(e.phone)
    rows.push(`${e.first},${e.last},${phone},${e.email ?? ''},,Re-submitted through the August campaign`)
  })

  for (const [first, last, phone, email, company, note] of NEW_LEADS) {
    rows.push(`${first},${last},${phone},${email},${company},${note ? `"${note}"` : ''}`)
  }

  // The same new person a second time, written differently — a file can duplicate itself.
  rows.push('Oluwatobi,Ajayi,+2348037714402,tobi.ajayi@gmail.com,Sterling Bank,Duplicate row')
  // Two that cannot be used.
  rows.push('Walk-in enquiry,,,,,No contact details captured')
  rows.push(',,08066554433,,,Number with no name against it')

  return rows.join('\n')
}

/**
 * A vCard export off a phone: several numbers per card, TYPE parameters, a
 * quoted-printable name with a diacritic, and folded lines — all of which real
 * exports contain and most import tools mangle.
 */
export function makeSampleVcf(db: Database): string {
  const existing = existingContacts(db, 3)
  const cards: string[] = []

  const card = (lines: string[]) => cards.push(['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\n'))

  existing.forEach((e, i) => {
    card([
      `N:${e.last};${e.first};;;`,
      `FN:${e.first} ${e.last}`,
      `TEL;TYPE=CELL:${i === 0 ? toLocalSpaced(e.phone) : e.phone}`,
      // A second number the CRM does not yet hold — the reason merging is worth doing.
      `TEL;TYPE=WORK:0701 55${String(20 + i)} 118${i}`,
      ...(e.email ? [`EMAIL;TYPE=INTERNET:${e.email}`] : []),
      'NOTE:Saved on my phone since the Bristol open day',
    ])
  })

  card([
    'N:Adéwálé;Olúwaseun;;;',
    'FN:Olúwaseun Adéwálé',
    'ORG:Chevron Nigeria',
    'TEL;TYPE=CELL:+234 805 991 4477',
    'TEL;TYPE=HOME:01 271 4408',
    'EMAIL;TYPE=INTERNET:seun.adewale@gmail.com',
    'NOTE:Met at the Alagomeji office',
  ])

  // Quoted-printable, folded across two lines — exactly how Android exports accented names.
  cards.push(
    [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ok=C3=A1for;Chidinma;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Chidinma Ok=C3=A1for',
      'TEL;CELL:08034471193',
      'EMAIL:chidinma.okafor@yahoo.com',
      'END:VCARD',
    ].join('\n'),
  )

  card([
    'N:Yusuf;Halima;;;',
    'FN:Halima Yusuf',
    'TEL;TYPE=CELL:0812 665 0091',
    'TEL;TYPE=CELL:0906 774 1120',
    'EMAIL;TYPE=INTERNET:halima.yusuf.buyer@gmail.com',
  ])

  // A card with nothing usable on it.
  card(['N:;;;;', 'FN:Unknown caller', 'NOTE:No number saved'])

  return cards.join('\n')
}
