import type { Database, Role } from './data/schema'

export interface NavItem {
  to: string
  label: string
  short: string
  icon: string
  roles?: Role[]
  /** Hidden when the module is switched off in settings. */
  requires?: (settings: Database['settings']) => boolean
  group: 'work' | 'insight' | 'admin'
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', short: 'Home', icon: '◈', group: 'work' },
  { to: '/contacts', label: 'Contacts', short: 'Contacts', icon: '👤', group: 'work' },
  { to: '/deals', label: 'Deals', short: 'Deals', icon: '◑', group: 'work' },
  { to: '/activities', label: 'Activity', short: 'Activity', icon: '≡', group: 'work' },
  { to: '/properties', label: 'Properties', short: 'Property', icon: '⌂', group: 'work' },

  { to: '/reports', label: 'Reports', short: 'Reports', icon: '▤', group: 'insight' },
  {
    to: '/team',
    label: 'My team',
    short: 'Team',
    icon: '⚇',
    group: 'insight',
    roles: ['team_lead', 'super_admin'],
  },

  {
    to: '/payments',
    label: 'Payments',
    short: 'Payments',
    icon: '₦',
    group: 'insight',
    requires: (s) => s.payment_ledger_enabled,
  },
  {
    to: '/web-leads',
    label: 'Web enquiries',
    short: 'Web',
    icon: '◍',
    group: 'work',
    requires: (s) => s.website_integration_enabled,
  },

  { to: '/settings', label: 'Settings', short: 'Settings', icon: '⚙', group: 'admin', roles: ['super_admin'] },
]

export function visibleNav(role: Role, settings: Database['settings']): NavItem[] {
  return NAV.filter((item) => {
    if (item.roles && !item.roles.includes(role)) return false
    if (item.requires && !item.requires(settings)) return false
    return true
  })
}

export const GROUP_LABEL: Record<NavItem['group'], string> = {
  work: 'Day to day',
  insight: 'Insight',
  admin: 'Administration',
}
