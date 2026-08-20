/**
 * Charts.
 *
 * Hand-rolled rather than pulled from a library: the set of forms this app needs is
 * small, and building them here keeps the marks consistent and the bundle light.
 *
 * The categorical palette below was checked for colour-vision separation against a
 * white chart surface. Two slots sit under 3:1 contrast, so every chart here carries
 * a legend and direct value labels — identity is never colour alone.
 */
import { useState, type ReactNode } from 'react'
import { cx } from './ui'

/**
 * Fixed order, led by the brand azure. Never cycled — a fifth series folds into
 * "Other" instead.
 *
 * The brand's own #29ABE2 and #FBB03B are too light to carry data on white (the
 * amber sits at OKLab L 0.81 against a 0.77 ceiling, and 1.85:1 contrast), so the
 * series use darker steps of the same hues. Adjacent-pair separation: worst CVD
 * ΔE 11.3, normal-vision ΔE 22.9.
 */
export const CATEGORICAL = ['#1b8fc0', '#eda100', '#1baf7a', '#e34948'] as const

/** Single hue for magnitude — one series needs no palette, just the brand azure. */
export const MAGNITUDE = '#1b8fc0'

/** Reserved for state. Never reused as "series 4". */
export const STATUS = {
  good: '#1a7f5a',
  warning: '#b56218',
  serious: '#c2521c',
  critical: '#c0392b',
} as const

/** Ordinal severity ramp, one hue, light → dark. */
export const AGEING_RAMP = ['#f3c98f', '#e39a58', '#cf6b34', '#a8412a'] as const

/* --------------------------------- tooltip -------------------------------- */

function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  const bind = (content: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const box = e.currentTarget.closest('[data-chart-root]')?.getBoundingClientRect()
      if (!box) return
      setTip({ x: e.clientX - box.left, y: e.clientY - box.top, content })
    },
    onMouseLeave: () => setTip(null),
  })
  const node = tip ? (
    <div
      className="pointer-events-none absolute z-20 max-w-[220px] rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-[12px] leading-snug text-ink-700 shadow-lg"
      style={{
        left: Math.max(4, tip.x - 60),
        top: Math.max(4, tip.y - 56),
      }}
    >
      {tip.content}
    </div>
  ) : null
  return { bind, node }
}

/* --------------------------------- legend --------------------------------- */

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[12px] text-ink-600">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------ horizontal bars ---------------------------- */

export interface HBarDatum {
  key: string
  label: ReactNode
  /** Plain-text label, used in the accessible table fallback. */
  labelText: string
  value: number
  /** Formatted for display beside the bar. */
  display: string
  color?: string
  meta?: ReactNode
  tooltip?: ReactNode
  onClick?: () => void
}

/**
 * Ranked magnitude. Direct-labelled on every row, which is what makes the light
 * palette slots legible regardless of contrast.
 */
export function HBarChart({
  data,
  max,
  emptyLabel = 'No data in range',
  barHeight = 8,
}: {
  data: HBarDatum[]
  max?: number
  emptyLabel?: string
  barHeight?: number
}) {
  const { bind, node } = useTooltip()
  const peak = max ?? Math.max(1, ...data.map((d) => Math.abs(d.value)))

  if (data.length === 0) {
    return <div className="py-6 text-center text-[13px] text-ink-400">{emptyLabel}</div>
  }

  return (
    <div className="relative" data-chart-root>
      {node}
      <div className="flex flex-col gap-3">
        {data.map((d) => {
          const pct = peak > 0 ? (Math.abs(d.value) / peak) * 100 : 0
          const Row = d.onClick ? 'button' : 'div'
          return (
            <Row
              key={d.key}
              {...(d.onClick ? { onClick: d.onClick, type: 'button' as const } : {})}
              className={cx(
                'group block w-full text-left',
                d.onClick && 'cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-brand-500',
              )}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13px] text-ink-700 group-hover:text-ink-900">
                  {d.label}
                </span>
                <span className="tnum shrink-0 text-[13px] font-medium text-ink-900">{d.display}</span>
              </div>
              <div
                className="relative w-full overflow-hidden rounded-full bg-ink-100"
                style={{ height: barHeight }}
                {...bind(d.tooltip ?? `${d.labelText}: ${d.display}`)}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(pct, d.value > 0 ? 1.5 : 0)}%`,
                    background: d.color ?? MAGNITUDE,
                  }}
                />
              </div>
              {d.meta && <div className="mt-1 text-[11.5px] text-ink-400">{d.meta}</div>}
            </Row>
          )
        })}
      </div>
    </div>
  )
}

/* -------------------------------- columns --------------------------------- */

export interface ColumnSeries {
  key: string
  label: string
  color: string
}

export interface ColumnDatum {
  label: string
  /** series key → value */
  values: Record<string, number>
  tooltip?: ReactNode
}

/**
 * Vertical columns, optionally stacked. Segments carry a 2px surface gap so adjacent
 * fills never read as one block, and the marks are anchored to the baseline.
 */
export function ColumnChart({
  data,
  series,
  height = 180,
  format,
  showLegend = true,
}: {
  data: ColumnDatum[]
  series: ColumnSeries[]
  height?: number
  format: (n: number) => string
  showLegend?: boolean
}) {
  const { bind, node } = useTooltip()
  const totals = data.map((d) => series.reduce((s, ser) => s + (d.values[ser.key] ?? 0), 0))
  const peak = Math.max(1, ...totals)

  return (
    <div className="relative" data-chart-root>
      {node}
      {showLegend && series.length > 1 && (
        <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      )}
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height }}>
        {data.map((d, i) => {
          const total = totals[i]
          return (
            <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
              <div
                className="relative flex w-full flex-col-reverse justify-start overflow-hidden rounded-t"
                style={{ height: `${(total / peak) * 100}%`, minHeight: total > 0 ? 3 : 0 }}
                {...bind(
                  d.tooltip ?? (
                    <div>
                      <div className="mb-1 font-medium text-ink-900">{d.label}</div>
                      {series.map((s) => (
                        <div key={s.key} className="flex items-center justify-between gap-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="tnum">{format(d.values[s.key] ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  ),
                )}
              >
                {series.map((s) => {
                  const v = d.values[s.key] ?? 0
                  if (v <= 0) return null
                  return (
                    <div
                      key={s.key}
                      className="w-full border-b-2 border-surface first:rounded-t-[3px] last:border-b-0"
                      style={{ height: `${(v / total) * 100}%`, background: s.color }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {data.map((d, i) => (
          <div key={d.label} className="min-w-0 flex-1 text-center">
            <div className="tnum truncate text-[11px] font-medium text-ink-700">{format(totals[i])}</div>
            <div className="truncate text-[10.5px] text-ink-400">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- funnel bars ------------------------------- */

/** Pipeline funnel: count and value per stage, widest at the top. */
export function FunnelChart({
  data,
}: {
  data: { label: string; count: number; display: string; isWon?: boolean; isLost?: boolean }[]
}) {
  const peak = Math.max(1, ...data.map((d) => d.count))
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => {
        const color = d.isWon ? STATUS.good : d.isLost ? '#9b9890' : MAGNITUDE
        return (
          <div key={d.label} className="flex items-center gap-3">
            <div className="w-[38%] shrink-0 truncate text-[13px] text-ink-600 sm:w-[30%]">{d.label}</div>
            <div className="relative h-6 min-w-0 flex-1 overflow-hidden rounded bg-ink-50">
              <div
                className="absolute inset-y-0 left-0 rounded transition-[width] duration-500"
                style={{ width: `${Math.max((d.count / peak) * 100, d.count > 0 ? 2 : 0)}%`, background: color }}
              />
              <div className="tnum absolute inset-y-0 right-2 flex items-center text-[11.5px] font-medium text-ink-600">
                {d.display}
              </div>
            </div>
            <div className="tnum w-8 shrink-0 text-right text-[13px] font-semibold text-ink-900">
              {d.count}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------- sparkline -------------------------------- */

/** Tiny trend line for stat tiles. 2px stroke, no axes — context, not measurement. */
export function Sparkline({
  values,
  width = 88,
  height = 26,
  color = MAGNITUDE,
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 2) + 1
      const y = height - 2 - ((v - min) / span) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
