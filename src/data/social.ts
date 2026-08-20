/**
 * Social profiles on a contact.
 *
 * People paste these in every imaginable form — a full URL, an @handle, or the bare
 * username. All three are stored as the bare handle so the record stays tidy and the
 * link can be rebuilt reliably.
 */
import type { SocialKind } from './schema'

export const SOCIAL_META: Record<SocialKind, { label: string; base: string; prefix: string }> = {
  instagram: { label: 'Instagram', base: 'https://instagram.com/', prefix: '@' },
  x: { label: 'X', base: 'https://x.com/', prefix: '@' },
  linkedin: { label: 'LinkedIn', base: 'https://linkedin.com/in/', prefix: '' },
  facebook: { label: 'Facebook', base: 'https://facebook.com/', prefix: '' },
}

/** Strip a pasted URL, an @, and any trailing slash or query down to the handle. */
export function normalizeHandle(kind: SocialKind, raw: string): string {
  let v = raw.trim()
  if (!v) return ''
  v = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  // Drop the host and any leading path segment the platform uses ("in/" on LinkedIn).
  v = v.replace(/^(?:instagram|x|twitter|linkedin|facebook|fb)\.com\//i, '')
  if (kind === 'linkedin') v = v.replace(/^(?:in|pub|company)\//i, '')
  v = v.replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^@+/, '')
  return v.toLowerCase()
}

/** The full profile URL for a stored handle. */
export function socialUrl(kind: SocialKind, handle: string): string {
  return SOCIAL_META[kind].base + handle
}

/** How the handle reads on screen — "@ada.okeke" on Instagram, "ada-okeke" on LinkedIn. */
export function socialDisplay(kind: SocialKind, handle: string): string {
  return SOCIAL_META[kind].prefix + handle
}
