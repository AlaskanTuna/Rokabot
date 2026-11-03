import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

interface BannerShellProps {
  /** The headline without the `: N errors` suffix, which the shell adds from `count`. */
  title: string
  /** The problems behind the banner; the title gains `: N errors` when there is more than one. */
  count?: number
  children: ReactNode
  /** The banner's buttons, e.g. "Go to field". */
  actions?: ReactNode
}

/** The frame every problem banner shares: the danger border, the warning icon, the titled head and the buttons. */
export function BannerShell({ title, count = 0, children, actions }: BannerShellProps) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-danger bg-surface px-5 py-4">
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body font-medium text-ink">
          {title}
          {count > 1 ? `: ${count} errors` : ''}
        </p>
        {children}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
