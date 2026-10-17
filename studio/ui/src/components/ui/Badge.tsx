import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-ink-2',
  accent: 'border-focus text-accent-ink',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
  danger: 'border-danger text-danger'
}

export function Badge({
  tone = 'neutral',
  dot = true,
  children
}: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border bg-subtle px-2 text-label whitespace-nowrap ${TONES[tone]}`}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
