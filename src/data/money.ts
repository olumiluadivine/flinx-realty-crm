/**
 * Money handling. Two rules, and everything else follows from them:
 *
 *  1. Amounts are integer minor units — kobo and cents. No floating-point money (R-CUR-4).
 *  2. A USD figure converts to NGN at the rate frozen on the record that earned it,
 *     never at a rate looked up now (R-CUR-3). Last quarter's totals must not move
 *     when the naira does.
 */
import type { Currency } from './schema'

export const MINOR_UNITS_PER_MAJOR = 100

export function toMinor(major: number): number {
  return Math.round(major * MINOR_UNITS_PER_MAJOR)
}

export function toMajor(minor: number): number {
  return minor / MINOR_UNITS_PER_MAJOR
}

/**
 * Convert to the NGN reporting base (R-CUR-2) using a frozen rate.
 * NGN passes through untouched; USD without a captured rate is a data error, so it
 * converts to zero rather than silently inventing a rate.
 */
export function toNgnMinor(
  amountMinor: number,
  currency: Currency,
  frozenRate: number | null,
): number {
  if (currency === 'NGN') return amountMinor
  if (frozenRate == null) return 0
  return Math.round(amountMinor * frozenRate)
}

const SYMBOL: Record<Currency, string> = { NGN: '₦', USD: '$' }

/** Full precision: ₦118,000,000.00 */
export function formatMoney(minor: number, currency: Currency = 'NGN'): string {
  const negative = minor < 0
  const abs = Math.abs(minor)
  const body = (abs / MINOR_UNITS_PER_MAJOR).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${negative ? '−' : ''}${SYMBOL[currency]}${body}`
}

/** Whole units, for table cells: ₦118,000,000 */
export function formatMoneyWhole(minor: number, currency: Currency = 'NGN'): string {
  const negative = minor < 0
  const abs = Math.abs(minor)
  const body = Math.round(abs / MINOR_UNITS_PER_MAJOR).toLocaleString('en-NG')
  return `${negative ? '−' : ''}${SYMBOL[currency]}${body}`
}

/**
 * Compact, for stat tiles and chart axes: ₦118.0m, ₦1.24bn.
 * Naira figures in this business run to hundreds of millions — full digits in a
 * headline number are unreadable at a glance.
 */
export function formatMoneyCompact(minor: number, currency: Currency = 'NGN'): string {
  const negative = minor < 0
  const major = Math.abs(minor) / MINOR_UNITS_PER_MAJOR
  const sign = negative ? '−' : ''
  const sym = SYMBOL[currency]
  if (major >= 1_000_000_000) return `${sign}${sym}${trim(major / 1_000_000_000)}bn`
  if (major >= 1_000_000) return `${sign}${sym}${trim(major / 1_000_000)}m`
  if (major >= 1_000) return `${sign}${sym}${trim(major / 1_000)}k`
  return `${sign}${sym}${Math.round(major).toLocaleString('en-NG')}`
}

function trim(n: number): string {
  // 118.0m reads worse than 118m; 1.24bn needs the decimals.
  const decimals = n >= 100 ? 0 : n >= 10 ? 1 : 2
  return n.toFixed(decimals).replace(/\.0+$/, '')
}

/** Parse "60,000,000" / "₦60m" / "60000000.50" into minor units. Returns null if unparseable. */
export function parseMoneyToMinor(input: string): number | null {
  const cleaned = input.trim().replace(/[₦$,\s]/g, '')
  if (!cleaned) return null
  const suffixMatch = /^(-?[\d.]+)(m|bn|k)$/i.exec(cleaned)
  if (suffixMatch) {
    const base = Number(suffixMatch[1])
    if (!Number.isFinite(base)) return null
    const mult = { k: 1_000, m: 1_000_000, bn: 1_000_000_000 }[suffixMatch[2].toLowerCase() as 'k' | 'm' | 'bn']
    return toMinor(base * mult)
  }
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return toMinor(n)
}
