/**
 * A visual representation of where someone sits in the sales lifecycle.
 *
 * The stage list is configurable, so nothing here is hardcoded: the track is built
 * from `pipeline_stages` in sort order, and a stage added in Settings appears as a
 * new segment without a code change. Lost stages are deliberately left out of the
 * run — losing a deal is a diversion off the path, not progress along it, so it is
 * drawn as a terminal marker instead of a step.
 */
import { daysInCurrentStage } from '@/data/derive'
import { formatDate } from '@/lib/format'
import type { Database, Deal, Id } from '@/data/schema'
import { Badge, cx } from './ui'
import { userName } from '@/data/selectors'

/** The stages that form the linear path, in order. */
export function lifecyclePath(db: Database) {
  return [...db.pipeline_stages].filter((s) => !s.is_lost).sort((a, b) => a.sort_order - b.sort_order)
}

interface TrackProps {
  db: Database
  /** The stage the record currently sits in. */
  stageId: Id
  /** Optional — enables the "N days in this stage" caption. */
  deal?: Deal
  className?: string
}

export function LifecycleTrack({ db, stageId, deal, className }: TrackProps) {
  const path = lifecyclePath(db)
  const current = db.pipeline_stages.find((s) => s.id === stageId)
  if (!current) return null

  const isLost = current.is_lost
  const isWon = current.is_won
  // A lost record still shows how far it travelled before it stopped.
  const reachedIndex = isLost
    ? Math.max(0, path.findIndex((s) => s.sort_order >= (lastOpenSortOrder(db, deal) ?? 0)) - 1)
    : path.findIndex((s) => s.id === stageId)
  const position = reachedIndex < 0 ? 0 : reachedIndex

  return (
    <div className={className}>
      <div className="flex items-center gap-1" role="img"
        aria-label={`Lifecycle: ${current.name}, step ${position + 1} of ${path.length}`}>
        {path.map((stage, i) => {
          const done = i < position
          const here = i === position && !isLost
          const fill = isLost
            ? i <= position ? 'bg-ink-300' : 'bg-ink-100'
            : isWon
              ? 'bg-won'
              : done ? 'bg-brand-600' : here ? 'bg-brand-500' : 'bg-ink-100'
          return (
            <div key={stage.id} className="group relative min-w-0 flex-1" title={stage.name}>
              <div
                className={cx(
                  'h-2 rounded-full transition-colors',
                  fill,
                  here && 'ring-2 ring-brand-200',
                )}
              />
            </div>
          )
        })}
        {/* Terminal outcome, shown only once the record has actually reached one. */}
        {(isWon || isLost) && (
          <div
            className={cx(
              'ml-1 h-2.5 w-2.5 shrink-0 rounded-full',
              isWon ? 'bg-won ring-2 ring-won-soft' : 'bg-lost ring-2 ring-lost-soft',
            )}
            title={current.name}
          />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={cx(
            'text-[13.5px] font-semibold',
            isWon ? 'text-won' : isLost ? 'text-lost' : 'text-ink-900',
          )}
        >
          {current.name}
        </span>
        {!isWon && !isLost && (
          <span className="text-[12px] text-ink-500">
            step {position + 1} of {path.length}
          </span>
        )}
        {deal && (
          <span className="text-[12px] text-ink-400">
            · {Math.round(daysInCurrentStage(db, deal))} days at this stage
          </span>
        )}
      </div>
      {current.description && (
        <p className="mt-1 text-[12px] leading-snug text-ink-400">{current.description}</p>
      )}
    </div>
  )
}

/** Where a lost deal had got to before it stopped, from its stage history. */
function lastOpenSortOrder(db: Database, deal?: Deal): number | null {
  if (!deal) return null
  const history = db.deal_stage_history
    .filter((h) => h.deal_id === deal.id)
    .map((h) => db.pipeline_stages.find((s) => s.id === h.to_stage_id))
    .filter((s): s is NonNullable<typeof s> => !!s && !s.is_lost)
  if (history.length === 0) return null
  return Math.max(...history.map((s) => s.sort_order))
}

/**
 * The dated journey behind the track — every stage change with who made it and how
 * long the record sat there.
 */
export function LifecycleJourney({ db, deal }: { db: Database; deal: Deal }) {
  const history = db.deal_stage_history
    .filter((h) => h.deal_id === deal.id)
    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())

  if (history.length === 0) {
    return <p className="text-[12.5px] text-ink-400">No stage changes recorded yet.</p>
  }

  return (
    <ol className="relative border-l border-ink-100 pl-4">
      {history.map((h, i) => {
        const stage = db.pipeline_stages.find((s) => s.id === h.to_stage_id)
        const next = history[i + 1]
        const days = Math.round(
          (new Date(next?.changed_at ?? Date.now()).getTime() - new Date(h.changed_at).getTime()) / 864e5,
        )
        const isLast = i === history.length - 1
        return (
          <li key={h.id} className="relative pb-3 last:pb-0">
            <span
              className={cx(
                'absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-surface',
                stage?.is_won ? 'bg-won' : stage?.is_lost ? 'bg-lost' : isLast ? 'bg-brand-500' : 'bg-brand-600',
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-ink-800">{stage?.name ?? 'Unknown stage'}</span>
              <span className="text-[11.5px] text-ink-400">
                {formatDate(h.changed_at)} · {userName(db, h.changed_by)}
              </span>
              <Badge tone="neutral">{days}d</Badge>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
