/**
 * Sign-in.
 *
 * A shared demo workspace, so the account list is the sign-in method: pick who you
 * are and the whole application re-scopes to that person's access level.
 */
import { useState } from 'react'
import { useDb, useStore } from '@/data/store'
import { Avatar, Badge, Button, cx } from '@/components/ui'
import { ROLE_LABEL } from '@/components/domain'
import { pluralize } from '@/lib/format'

export default function SignIn() {
  const db = useDb()
  const signIn = useStore((s) => s.signIn)
  const [selected, setSelected] = useState<string>('u-lead-1')

  const groups = [
    {
      role: 'super_admin' as const,
      blurb: 'Company-wide visibility across every team, plus settings.',
      users: db.users.filter((u) => u.role === 'super_admin'),
    },
    {
      role: 'team_lead' as const,
      blurb: 'Their own team’s contacts, deals and activity.',
      users: db.users.filter((u) => u.role === 'team_lead'),
    },
    {
      role: 'salesperson' as const,
      blurb: 'Only what they own.',
      users: db.users.filter((u) => u.role === 'salesperson'),
    },
  ]

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-brand-900 px-6 py-10 text-white sm:px-10 lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 h-96 w-96 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #c8a44d 0%, transparent 70%)' }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-400 font-display text-xl font-semibold text-brand-900">
              F
            </span>
            <div className="leading-tight">
              <div className="font-display text-lg font-semibold">Flinx Realty Ltd</div>
              <div className="text-[12px] text-brand-300">294 Borno Way, Alagomeji-Yaba, Lagos</div>
            </div>
          </div>

          <h1 className="mt-10 max-w-lg font-display text-3xl leading-[1.15] font-semibold sm:text-[38px]">
            One place for every contact, every inspection and every sale.
          </h1>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-brand-100/85">
            The sales system for Flinx Realty — built around how residential units are actually
            sold in Lagos.
          </p>

          <ul className="mt-8 max-w-md space-y-3.5">
            {[
              [
                'Contacts owned by the company',
                'Bulk import from vCard and CSV, de-duplicated on the phone number, each contact assigned to a named salesperson.',
              ],
              [
                'Activity you can look back on',
                'Every meeting and inspection recorded against a client, with the discussion notes and when it took place.',
              ],
              [
                'Numbers you can rely on',
                'Sales, team rollups and conversion, scoped automatically to whoever is signed in.',
              ],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                <span>
                  <span className="block text-[14px] font-medium">{title}</span>
                  <span className="block text-[13px] leading-relaxed text-brand-200/80">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 max-w-md text-[11.5px] leading-relaxed text-brand-300/70">
          Demo workspace · populated with sample data
        </p>
      </div>

      {/* Account picker */}
      <div className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-semibold text-ink-900">Sign in</h2>
            <Badge tone="gold">Demo</Badge>
          </div>
          <p className="mt-1.5 text-[13.5px] text-ink-500">
            Choose an account to explore the system as that person. What you can see depends on your
            role — you can switch at any time from the header.
          </p>

          <div className="mt-6 space-y-5">
            {groups.map((group) => (
              <div key={group.role}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-semibold tracking-wide text-ink-700 uppercase">
                    {ROLE_LABEL[group.role]}
                  </span>
                  <span className="text-[11px] text-ink-400">
                    {pluralize(group.users.length, 'account')}
                  </span>
                </div>
                <p className="mb-2 text-[12px] leading-snug text-ink-400">{group.blurb}</p>
                <div className="grid gap-1.5">
                  {group.users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelected(u.id)}
                      className={cx(
                        'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                        selected === u.id
                          ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                          : 'border-ink-200 bg-surface hover:bg-ink-50',
                      )}
                    >
                      <Avatar name={u.full_name} hue={u.hue} size={34} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[13.5px] font-medium text-ink-900">
                          {u.full_name}
                        </span>
                        <span className="block truncate text-[11.5px] text-ink-400">{u.title}</span>
                      </span>
                      {u.id === 'u-lead-1' && <Badge tone="brand">Start here</Badge>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Button variant="primary" className="mt-6 w-full" onClick={() => signIn(selected)}>
            Continue as {db.users.find((u) => u.id === selected)?.full_name}
          </Button>
          <p className="mt-3 text-center text-[11.5px] text-ink-400">
            Sample data. Anything you change stays in your browser.
          </p>
        </div>
      </div>
    </div>
  )
}
