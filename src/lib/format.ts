/** Date and duration formatting. Nigerian/UK conventions — day before month. */

const DAY = 24 * 60 * 60 * 1000

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/** "3 days ago", "in 2 weeks" — relative to now. */
export function relativeTime(iso: string, now = new Date()): string {
  const delta = new Date(iso).getTime() - now.getTime()
  const abs = Math.abs(delta)
  const future = delta > 0

  const mins = Math.round(abs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`
  const days = Math.round(abs / DAY)
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`
  const weeks = Math.round(days / 7)
  if (weeks < 5) return future ? `in ${weeks}w` : `${weeks}w ago`
  const months = Math.round(days / 30)
  if (months < 12) return future ? `in ${months}mo` : `${months}mo ago`
  return future ? `in ${Math.round(months / 12)}y` : `${Math.round(months / 12)}y ago`
}

/** Phrases a logging gap the way a person would say it. */
export function formatDelay(days: number): string {
  if (days < 1 / 24) return 'logged immediately'
  if (days < 1) return `logged ${Math.max(1, Math.round(days * 24))}h later`
  if (days < 2) return 'logged next day'
  return `logged ${Math.round(days)} days later`
}

export function formatDelayShort(days: number): string {
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`
  return `${days < 10 ? days.toFixed(1) : Math.round(days)}d`
}

export function formatDuration(minutes: number | null): string | null {
  if (minutes == null) return null
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** For a <input type="datetime-local"> value. */
export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString()
}

export function todayIsoDate(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString('en-NG')} ${n === 1 ? singular : plural}`
}
