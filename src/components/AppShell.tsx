/**
 * The application frame: brand rail on desktop, bottom tab bar on a phone.
 *
 * The account switcher in the header exists because this is a shared demo workspace —
 * changing who you are signed in as re-scopes every screen at once, which is the
 * quickest way to see how role-based access behaves.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useDb, useStore, useViewer } from '@/data/store'
import { useScope } from '@/data/selectors'
import { GROUP_LABEL, visibleNav, type NavItem } from '@/nav'
import { Avatar, Badge, Button, cx } from './ui'
import { ROLE_LABEL } from './domain'

export function AppShell({ children }: { children: ReactNode }) {
  const db = useDb()
  const viewer = useViewer()
  const scope = useScope()
  const items = visibleNav(viewer.role, db.settings)
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMenuOpen(false), [location.pathname])

  const grouped = (['work', 'insight', 'admin'] as const)
    .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:flex-row">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-brand-900/40 bg-brand-900 lg:flex xl:w-64">
        <Brandmark />
        <nav className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
          {grouped.map(({ group, items: groupItems }) => (
            <div key={group} className="mb-5">
              <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.13em] text-brand-300/70 uppercase">
                {GROUP_LABEL[group]}
              </div>
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <RailLink key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <DemoDataFooter />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <ScopeBanner label={scope.label} role={viewer.role} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
        <MobileTabBar items={items} onMore={() => setMenuOpen(true)} />
      </div>

      {menuOpen && <MobileMenu items={grouped} onClose={() => setMenuOpen(false)} />}
    </div>
  )
}

function Brandmark() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400 font-display text-lg font-semibold text-brand-900">
        F
      </span>
      <div className="min-w-0 leading-tight">
        <div className="font-display text-[15px] font-semibold text-white">Flinx Realty</div>
        <div className="text-[11px] text-brand-300">Sales CRM</div>
      </div>
    </div>
  )
}

function RailLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cx(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
          isActive
            ? 'bg-brand-700/70 font-medium text-white'
            : 'text-brand-100/80 hover:bg-brand-800/60 hover:text-white',
        )
      }
    >
      <span aria-hidden className="w-4 text-center text-[13px] opacity-80">
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </NavLink>
  )
}

function DemoDataFooter() {
  const resetDemo = useStore((s) => s.resetDemo)
  return (
    <div className="border-t border-brand-800/70 px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-brand-200">
        <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-hidden />
        Demo workspace
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-brand-300/70">
        Sample data. Anything you change here is yours alone.
      </p>
      <button
        onClick={() => {
          if (confirm('Reset this workspace to its original sample data? Your changes will be discarded.')) {
            resetDemo()
          }
        }}
        className="mt-2 text-[11.5px] font-medium text-gold-300 hover:text-gold-200"
      >
        Reset workspace
      </button>
    </div>
  )
}

/* ---------------------------------- header --------------------------------- */

function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 border-b border-ink-100 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <button
          onClick={onOpenMenu}
          className="flex items-center gap-2 lg:hidden"
          aria-label="Open menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-800 font-display text-sm font-semibold text-gold-300">
            F
          </span>
          <span className="font-display text-[15px] font-semibold text-ink-900">Flinx CRM</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Badge tone="gold" title="A shared demonstration workspace populated with sample data">
            Demo
          </Badge>
          <TourButton />
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/activities?log=1')}
            className="hidden sm:inline-flex"
          >
            + Log activity
          </Button>
          <ViewingAs />
        </div>
      </div>
    </header>
  )
}

/** Starts the product tour. On phones the floating launcher in `Tour` does this instead. */
function TourButton() {
  const setTourStep = useStore((s) => s.setTourStep)
  const active = useStore((s) => s.tourStep) !== null
  if (active) return null
  return (
    <Button size="sm" onClick={() => setTourStep(0)} className="hidden lg:inline-flex">
      <span aria-hidden className="text-gold-500">
        ▶
      </span>
      Take a tour
    </Button>
  )
}

/** Account switcher for the shared demo workspace. */
function ViewingAs() {
  const db = useDb()
  const viewer = useViewer()
  const setViewer = useStore((s) => s.setViewer)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const byRole = [
    { role: 'super_admin' as const, users: db.users.filter((u) => u.role === 'super_admin') },
    { role: 'team_lead' as const, users: db.users.filter((u) => u.role === 'team_lead') },
    { role: 'salesperson' as const, users: db.users.filter((u) => u.role === 'salesperson') },
  ]

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-ink-200 bg-surface py-1.5 pr-2 pl-2 transition-colors hover:bg-ink-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Avatar name={viewer.full_name} hue={viewer.hue} size={26} />
        <span className="hidden min-w-0 text-left leading-tight sm:block">
          <span className="block truncate text-[12.5px] font-medium text-ink-800">{viewer.full_name}</span>
          <span className="block text-[10.5px] text-ink-400">{ROLE_LABEL[viewer.role]}</span>
        </span>
        <span aria-hidden className="text-[10px] text-ink-400">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-xl">
          <div className="border-b border-ink-100 bg-ink-50/70 px-3 py-2">
            <div className="text-[11px] font-semibold tracking-wide text-ink-600 uppercase">
              Switch account
            </div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-500">
              Every screen re-scopes to whoever you sign in as.
            </div>
          </div>
          <div className="scroll-slim max-h-[60vh] overflow-y-auto py-1">
            {byRole.map(({ role, users }) => (
              <div key={role}>
                <div className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-ink-400 uppercase">
                  {ROLE_LABEL[role]}
                </div>
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setViewer(u.id)
                      setOpen(false)
                    }}
                    className={cx(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-ink-50',
                      u.id === viewer.id && 'bg-brand-50',
                    )}
                  >
                    <Avatar name={u.full_name} hue={u.hue} size={26} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-medium text-ink-800">{u.full_name}</span>
                      <span className="block truncate text-[11px] text-ink-400">{u.title}</span>
                    </span>
                    {u.id === viewer.id && <span className="text-[11px] text-brand-600">●</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** States, on every screen, exactly whose records are on it (R-REP-7). */
function ScopeBanner({ label, role }: { label: string; role: 'super_admin' | 'team_lead' | 'salesperson' }) {
  const tone =
    role === 'super_admin'
      ? 'border-gold-200 bg-gold-50 text-gold-700'
      : role === 'team_lead'
        ? 'border-brand-100 bg-brand-50 text-brand-800'
        : 'border-ink-100 bg-ink-50 text-ink-600'
  return (
    <div className={cx('border-b px-4 py-1.5 text-[11.5px] sm:px-6 lg:px-8', tone)}>
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2">
        <span aria-hidden>◎</span>
        <span className="truncate">
          <span className="font-medium">Your access:</span> {label}
        </span>
      </div>
    </div>
  )
}

/* ---------------------------------- mobile --------------------------------- */

function MobileTabBar({ items, onMore }: { items: NavItem[]; onMore: () => void }) {
  const primary = items.filter((i) => ['/dashboard', '/contacts', '/deals', '/activities'].includes(i.to))
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-surface/97 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="grid grid-cols-5">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cx(
                'flex flex-col items-center gap-0.5 py-2 text-[10.5px] transition-colors',
                isActive ? 'text-brand-700' : 'text-ink-400',
              )
            }
          >
            <span aria-hidden className="text-[15px] leading-none">
              {item.icon}
            </span>
            {item.short}
          </NavLink>
        ))}
        <button onClick={onMore} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] text-ink-400">
          <span aria-hidden className="text-[15px] leading-none">
            ⋯
          </span>
          More
        </button>
      </div>
    </nav>
  )
}

function MobileMenu({
  items,
  onClose,
}: {
  items: { group: NavItem['group']; items: NavItem[] }[]
  onClose: () => void
}) {
  const viewer = useViewer()
  const resetDemo = useStore((s) => s.resetDemo)
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-ink-900/40" />
      <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-brand-900">
        <Brandmark />
        <div className="mx-4 mb-3 flex items-center gap-2.5 rounded-lg bg-brand-800/70 px-3 py-2.5">
          <Avatar name={viewer.full_name} hue={viewer.hue} size={30} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-medium text-white">{viewer.full_name}</div>
            <div className="text-[11px] text-brand-300">{ROLE_LABEL[viewer.role]}</div>
          </div>
        </div>
        <nav className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
          {items.map(({ group, items: groupItems }) => (
            <div key={group} className="mb-4">
              <div className="mb-1.5 px-2.5 text-[10.5px] font-semibold tracking-[0.13em] text-brand-300/70 uppercase">
                {GROUP_LABEL[group]}
              </div>
              <div className="flex flex-col gap-0.5">
                {groupItems.map((item) => (
                  <RailLink key={item.to} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-brand-800 px-4 py-3">
          <button
            onClick={() => {
              if (confirm('Reset this workspace to its original sample data?')) resetDemo()
              onClose()
            }}
            className="text-[12px] font-medium text-gold-300"
          >
            Reset workspace
          </button>
        </div>
      </div>
    </div>
  )
}

/** Used by screens that a salesperson has no business opening. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div className="rounded-[--radius-card] border border-dashed border-ink-200 bg-surface px-6 py-12 text-center">
      <Badge tone="lost">Not available at your access level</Badge>
      <p className="mx-auto mt-3 max-w-sm text-[13px] text-ink-500">
        {what} is restricted to a higher access level. Speak to a company administrator if you need
        it.
      </p>
    </div>
  )
}
