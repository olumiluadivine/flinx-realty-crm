/**
 * Product tour — a short guided path through the main areas of the system.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useViewer } from '@/data/store'
import { Button, cx } from './ui'

interface Step {
  route: string
  title: string
  body: string
  /** Switch identity before showing the step — some points only land from one seat. */
  viewAs?: string
  say?: string
}

export const TOUR: Step[] = [
  {
    route: '/dashboard',
    viewAs: 'u-lead-1',
    title: 'Your dashboard',
    body: 'Whatever you are responsible for, gathered in one place — what has sold, what is still open, and what your team has been doing. A sales manager sees their team; a salesperson sees their own work.',
  },
  {
    route: '/contacts',
    title: 'Contacts',
    body: 'Everyone the company is talking to. Each contact keeps every number and address they can be reached on, who owns the relationship, and where they came from. Nobody is deleted — people who said no stay on record.',
  },
  {
    route: '/contacts/import',
    title: 'Bringing in new leads',
    body: 'Drop in a spreadsheet from a campaign or a contacts export from a phone. You see exactly what will be created and what will merge into people you already have, before anything is saved — and a batch can be undone afterwards.',
    say: 'Try it with one of the sample files.',
  },
  {
    route: '/activities',
    title: 'Logging the work',
    body: 'Inspections, meetings and calls, each recorded against a named client with what was discussed. You set when it happened; the system records when it was entered.',
  },
  {
    route: '/reports',
    title: 'Reports',
    body: 'Sales per person, team rollups, activity volume, and how promptly work is being recorded. Every report shows exactly what your access level covers.',
  },
  {
    route: '/deals',
    title: 'The pipeline',
    body: 'Drag a deal between stages as it progresses. Closing one asks for the sale value, and deals in dollars keep the exchange rate from the day they closed.',
    say: 'Try dragging a card into Closed.',
  },
  {
    route: '/payments',
    title: 'Collections',
    body: 'What has been paid against each sale, what is still owed and how overdue it is, plus what the agreed payment plans say should arrive over the coming months.',
  },
  {
    route: '/web-leads',
    title: 'Website enquiries',
    body: 'Enquiries from the website arrive here with the budget, project and timeline the enquirer gave. Route one to a salesperson and response time is measured from the moment it came in.',
    say: 'Press "Simulate an enquiry" to watch one arrive.',
  },
  {
    route: '/dashboard',
    viewAs: 'u-sp-3',
    title: 'Access follows your role',
    body: 'This is the same dashboard signed in as a salesperson — his own work and nothing else. Switch to a manager or a director from the header and it opens up accordingly.',
    say: 'Use the account menu, top right.',
  },
  {
    route: '/settings',
    viewAs: 'u-ceo',
    title: 'Settings',
    body: 'Pipeline stages, teams, payment plans and currency, all editable without a developer. Rename or reorder a stage and the deal board and reports follow immediately.',
  },
]

export function Tour() {
  const step = useStore((s) => s.tourStep)
  const setTourStep = useStore((s) => s.setTourStep)
  const setViewer = useStore((s) => s.setViewer)
  const viewer = useViewer()
  const navigate = useNavigate()

  const current = step === null ? null : TOUR[step]

  useEffect(() => {
    if (!current) return
    navigate(current.route)
    if (current.viewAs) setViewer(current.viewAs)
    // Only react to the step changing, not to navigation identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === null) return
      if (e.key === 'ArrowRight') setTourStep(Math.min(TOUR.length - 1, step + 1))
      if (e.key === 'ArrowLeft') setTourStep(Math.max(0, step - 1))
      if (e.key === 'Escape') setTourStep(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, setTourStep])

  if (step === null) {
    return (
      <button
        onClick={() => setTourStep(0)}
        className={cx(
          'fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full bg-brand-600 py-2.5 pr-4 pl-3.5 text-[13px] font-medium text-white shadow-lg',
          'transition-transform hover:scale-[1.02] hover:bg-brand-700',
          // Only on small screens. On desktop the launcher lives in the header, where
          // it cannot sit on top of a row action or a card heading.
          'lg:hidden',
        )}
        title="Take a short tour of the system"
      >
        <span aria-hidden className="text-white/80">
          ▶
        </span>
        Take a tour
      </button>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 lg:right-6 lg:bottom-6 lg:left-auto lg:w-[400px] lg:px-0 lg:pb-0">
      <div className="rounded-2xl border border-ink-800 bg-ink-900 p-4 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-500 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-900">
              {step + 1}/{TOUR.length}
            </span>
            <span className="text-[11px] text-ink-400">Product tour</span>
          </div>
          <button
            onClick={() => setTourStep(null)}
            className="text-[12px] text-ink-400 hover:text-white"
            aria-label="End tour"
          >
            End ✕
          </button>
        </div>

        <h3 className="mt-2.5 font-display text-[17px] leading-snug font-semibold">{current!.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-200">{current!.body}</p>
        {current!.say && (
          <p className="mt-2.5 border-l-2 border-brand-500 pl-2.5 text-[12px] leading-relaxed text-brand-200 italic">
            {current!.say}
          </p>
        )}
        {current!.viewAs && (
          <p className="mt-2.5 text-[11.5px] text-ink-400">
            Signed in as <span className="font-medium text-white">{viewer.full_name}</span>
          </p>
        )}

        <div className="mt-3.5 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-white"
            onClick={() => setTourStep(Math.max(0, step - 1))}
            disabled={step === 0}
          >
            ← Back
          </Button>
          {step < TOUR.length - 1 ? (
            <Button
              size="sm"
              className="ml-auto border-brand-500 bg-brand-500 text-white hover:bg-brand-400"
              onClick={() => setTourStep(step + 1)}
            >
              Next →
            </Button>
          ) : (
            <Button
              size="sm"
              className="ml-auto border-brand-500 bg-brand-500 text-white hover:bg-brand-400"
              onClick={() => setTourStep(null)}
            >
              Finish
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
