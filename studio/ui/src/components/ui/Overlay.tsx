import { X } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions: ReactNode
  /** Wider dialogs (for example a form) pass a Tailwind width class. */
  width?: string
}

/** A native modal dialog: focus is trapped, Escape closes it, and focus returns to the opener. */
export function Dialog({ open, onClose, title, children, actions, width = 'w-[440px]' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      // The close event can arrive after a quick reopen; only a dialog that is really closed reports it.
      onClose={() => {
        if (!ref.current?.open) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={`glass-overlay m-auto max-w-[calc(100vw-32px)] animate-pop-in rounded-lg p-0 text-ink backdrop:bg-scrim backdrop:backdrop-blur-[10px] ${width}`}
    >
      {open && (
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <h2 id="dialog-title" className="min-w-0 flex-1 text-section [overflow-wrap:anywhere] text-ink">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-mt-0.5 -mr-1.5 rounded-sm p-1 text-ink-3 hover:bg-subtle hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="text-body text-ink-2">{children}</div>
          <div className="flex justify-end gap-2">{actions}</div>
        </div>
      )}
    </dialog>
  )
}

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-[85%]', 'w-[60%]', 'w-[92%]', 'w-[70%]']
  return (
    <div aria-hidden className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder lines have no identity
        <span key={index} className={`h-3 animate-shimmer rounded-sm bg-subtle ${widths[index % widths.length]}`} />
      ))}
    </div>
  )
}

interface TabsProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onValue: (value: T) => void
  label: string
}

export function Tabs<T extends string>({ value, options, onValue, label }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-0.5 rounded-md bg-subtle p-0.5">
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValue(option.value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
              event.preventDefault()
              const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
              onValue(options[next].value)
              refs.current[next]?.focus()
            }}
            className={`h-7 rounded-sm px-3 text-body transition-colors duration-150 ${
              selected ? 'bg-surface font-medium text-ink shadow-hairline' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
