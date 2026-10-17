import { Copy, Loader2, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonStyle = 'primary' | 'secondary' | 'ghost' | 'danger'

const STYLES: Record<ButtonStyle, string> = {
  primary:
    'h-[38px] glass-cta !bg-glass-accent text-on-accent hover:!bg-accent-hover hover:!border-transparent active:!bg-accent-hover',
  secondary: 'h-[38px] border border-line-strong bg-surface text-ink hover:bg-subtle active:bg-subtle',
  ghost: 'h-[38px] glass-cta text-ink-2 hover:!bg-subtle hover:!border-transparent hover:text-ink',
  danger: 'h-9 bg-danger-fill text-on-accent hover:brightness-110 active:brightness-95'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonStyle
  icon?: LucideIcon
  loading?: boolean
  loadingLabel?: string
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  icon: Icon,
  loading = false,
  loadingLabel,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-body font-medium whitespace-nowrap transition-[background-color,color,border-color,transform,filter] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 ${STYLES[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : (
        Icon && <Icon aria-hidden className="size-4" />
      )}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
}

export function IconButton({ icon: Icon, label, active, className = '', type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`relative inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
        active
          ? 'glass-cta !bg-glass-raised !border-line-strong text-ink'
          : 'glass-cta text-ink-2 hover:!bg-subtle hover:text-ink'
      } ${className}`}
      {...rest}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  )
}

interface ActionChipProps {
  label: string
  primary?: boolean
  icon?: 'copy'
  onClick: () => void
}

export function ActionChip({ label, primary, icon, onClick }: ActionChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-small whitespace-nowrap transition-colors duration-150 active:scale-[0.98] ${
        primary ? 'bg-accent text-on-accent hover:bg-accent-hover' : 'glass-cta text-ink hover:!bg-subtle'
      }`}
    >
      {icon === 'copy' && <Copy aria-hidden className="size-3.5" />}
      {label}
    </button>
  )
}
