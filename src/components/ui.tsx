/** Shared presentation primitives. Everything visual is built from these. */
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* --------------------------------- surfaces -------------------------------- */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={cx(
        // min-w-0 matters: a grid or flex item defaults to min-width:auto, so a card
        // holding a wide table would otherwise force its whole track wider than the
        // phone screen. Every horizontal-overflow bug in this app traced back to it.
        'min-w-0 rounded-[--radius-card] border border-ink-100 bg-surface shadow-[0_1px_2px_rgba(22,21,15,0.04)]',
        padded && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-2xl leading-tight font-semibold text-ink-900 sm:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* --------------------------------- controls -------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: {
  children: ReactNode
  variant?: ButtonVariant
  size?: 'sm' | 'md'
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-brand-700 text-white hover:bg-brand-800 border-brand-700',
    secondary: 'bg-surface text-ink-800 hover:bg-ink-50 border-ink-200',
    ghost: 'bg-transparent text-ink-600 hover:bg-ink-50 border-transparent',
    danger: 'bg-lost-soft text-lost hover:bg-[#f6dcd9] border-[#f0cdc9]',
  }
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3.5 py-2 text-sm',
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink-700">
        {label}
        {required && <span className="text-lost">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-lost">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-ink-400">{hint}</span>
      ) : null}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 ' +
  'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-ink-50 disabled:text-ink-400'

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, 'min-h-24 resize-y', props.className)} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(inputClass, 'appearance-none bg-[length:16px] pr-9', props.className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b6960' stroke-width='1.6'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        ...props.style,
      }}
    />
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-800">{label}</div>
        {description && <div className="mt-0.5 text-[13px] text-ink-500">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
          checked ? 'border-brand-700 bg-brand-700' : 'border-ink-200 bg-ink-100',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
          style={{ height: 18, width: 18 }}
        />
      </button>
    </div>
  )
}

/* ---------------------------------- badges --------------------------------- */

type Tone = 'neutral' | 'brand' | 'won' | 'lost' | 'warn' | 'info' | 'gold'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-ink-50 text-ink-600 ring-ink-200/70',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  won: 'bg-won-soft text-won ring-[#bfe3d1]',
  lost: 'bg-lost-soft text-lost ring-[#f0cdc9]',
  warn: 'bg-warn-soft text-warn ring-[#f2ddb9]',
  info: 'bg-info-soft text-info ring-[#c9daef]',
  gold: 'bg-gold-50 text-gold-700 ring-gold-200',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/* --------------------------------- avatars --------------------------------- */

export function Avatar({
  name,
  hue = 160,
  size = 32,
  ring,
}: {
  name: string
  hue?: number
  size?: number
  ring?: boolean
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        ring && 'ring-2 ring-white',
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hue} 34% 90%)`,
        color: `hsl(${hue} 45% 26%)`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

/* ------------------------------- stat display ------------------------------ */

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  icon?: ReactNode
}) {
  const accent: Record<Tone, string> = {
    neutral: 'text-ink-900',
    brand: 'text-brand-700',
    won: 'text-won',
    lost: 'text-lost',
    warn: 'text-warn',
    info: 'text-info',
    gold: 'text-gold-600',
  }
  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-medium text-ink-500">{label}</div>
        {icon}
      </div>
      <div className={cx('tnum mt-1.5 font-display text-[26px] leading-none font-semibold', accent[tone])}>
        {value}
      </div>
      {sub && <div className="mt-2 text-[12.5px] leading-snug text-ink-500">{sub}</div>}
    </Card>
  )
}

/* ---------------------------------- layout --------------------------------- */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[--radius-card] border border-dashed border-ink-200 bg-surface/60 px-6 py-12 text-center">
      <div className="text-sm font-medium text-ink-700">{title}</div>
      {description && <div className="mt-1 max-w-sm text-[13px] text-ink-500">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Slides in from the right on desktop, up from the bottom on a phone. */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/25 backdrop-blur-[1px]"
      />
      <div
        className={cx(
          'relative flex h-full w-full flex-col bg-paper shadow-2xl',
          'sm:max-w-xl md:max-w-2xl',
          'animate-[drawerIn_180ms_ease-out]',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 bg-surface px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <div className="truncate font-display text-lg font-semibold text-ink-900">{title}</div>
            {subtitle && <div className="mt-0.5 truncate text-[13px] text-ink-500">{subtitle}</div>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
            ✕
          </Button>
        </div>
        <div className="scroll-slim flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && (
          <div className="border-t border-ink-100 bg-surface px-4 py-3 sm:px-6">{footer}</div>
        )}
      </div>
      <style>{`@keyframes drawerIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}`}</style>
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink-900/30" />
      <div
        className={cx(
          'relative w-full rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl',
          width,
        )}
      >
        <div className="border-b border-ink-100 px-5 py-3.5">
          <div className="font-display text-lg font-semibold text-ink-900">{title}</div>
        </div>
        <div className="scroll-slim max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="scroll-slim overflow-x-auto">
      <div className="flex min-w-max gap-1 border-b border-ink-100">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium whitespace-nowrap transition-colors',
              active === tab.id
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-ink-500 hover:text-ink-800',
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="tnum ml-1.5 text-[12px] text-ink-400">{tab.count}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Small inline explainer — used to tie UI back to the requirement it satisfies. */
export function Note({ children, tone = 'brand' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: 'border-ink-200 bg-ink-50 text-ink-600',
    brand: 'border-brand-100 bg-brand-50 text-brand-800',
    won: 'border-[#bfe3d1] bg-won-soft text-won',
    lost: 'border-[#f0cdc9] bg-lost-soft text-lost',
    warn: 'border-[#f2ddb9] bg-warn-soft text-warn',
    info: 'border-[#c9daef] bg-info-soft text-info',
    gold: 'border-gold-200 bg-gold-50 text-gold-700',
  }
  return (
    <div className={cx('rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed', tones[tone])}>
      {children}
    </div>
  )
}

/** Copy-to-clipboard text, used for phone numbers and emails. */
export function CopyText({ value, children }: { value: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setCopied(true)
        timer.current = window.setTimeout(() => setCopied(false), 1400)
      }}
      className="group inline-flex items-center gap-1.5 text-left hover:text-brand-700"
      title="Copy"
    >
      <span>{children ?? value}</span>
      <span className={cx('text-[10px] transition-opacity', copied ? 'text-won opacity-100' : 'opacity-0 group-hover:opacity-60')}>
        {copied ? 'copied' : '⧉'}
      </span>
    </button>
  )
}
