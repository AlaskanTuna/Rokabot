import { Check, ChevronDown } from 'lucide-react'
import {
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'
import { useDismiss } from './useDismiss'

interface FieldProps {
  label: ReactNode
  helper?: ReactNode
  error?: string | null
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
  path?: string
}

/** Label, control and helper line; a bot error replaces the helper and marks the control invalid. */
export function Field({ label, helper, error, children, className = '', path }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const hasHelp = Boolean(error || helper)
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`} data-path={path}>
      <label htmlFor={id} className="text-label text-ink-2">
        {label}
      </label>
      {children({ id, describedBy: hasHelp ? helpId : undefined, invalid: Boolean(error) })}
      {hasHelp && (
        <p
          id={helpId}
          className={`text-small ${error ? 'text-danger' : 'text-ink-3'}`}
          role={error ? 'alert' : undefined}
        >
          {error || helper}
        </p>
      )}
    </div>
  )
}

export const fieldClass = (invalid: boolean) =>
  `h-[34px] w-full min-w-0 rounded-md border bg-surface pr-2 pl-3 text-code font-mono text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 outline-none focus-visible:border-focus focus-visible:shadow-[0_0_0_1px_var(--focus)] disabled:opacity-50 ${
    invalid ? 'border-danger' : 'border-line-strong'
  }`

interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  invalid?: boolean
  onValue: (value: string) => void
}

export function TextInput({ invalid = false, onValue, className = '', ...rest }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`${fieldClass(invalid)} ${className}`}
      onChange={(event) => onValue(event.target.value)}
      {...rest}
    />
  )
}

export interface Option {
  value: string
  label: string
  detail?: string
}

interface SelectProps {
  id?: string
  value: string
  options: Option[]
  onValue: (value: string) => void
  invalid?: boolean
  describedBy?: string
  disabled?: boolean
  label?: string
  /** Body text instead of mono, for human-readable choices. */
  plain?: boolean
}

/** A listbox select: the open list is a glass popover with one or two lines per option and a check on the chosen one. */
export function Select({
  id,
  value,
  options,
  onValue,
  invalid = false,
  describedBy,
  disabled,
  label,
  plain
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((option) => option.value === value)
  useDismiss(root, open, () => setOpen(false))
  const index = useMemo(
    () =>
      Math.max(
        0,
        options.findIndex((option) => option.value === value)
      ),
    [options, value]
  )
  useEffect(() => {
    if (open) setActive(index)
  }, [open, index])
  useEffect(() => {
    if (!open) return
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  const choose = (option: Option) => {
    onValue(option.value)
    setOpen(false)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) return setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (current + step + options.length) % options.length)
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault()
      if (options[active]) choose(options[active])
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'Home' && open) {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActive(options.length - 1)
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      // Search from the option after the current one, so pressing a letter again moves to its next match.
      const from = open ? active : index
      const found =
        options
          .map((_, step) => (from + 1 + step) % options.length)
          .find((position) => options[position].label.toLowerCase().startsWith(event.key.toLowerCase())) ?? -1
      if (found >= 0) {
        if (open) setActive(found)
        else onValue(options[found].value)
      }
    }
  }

  return (
    <div ref={root} className="relative min-w-0">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        className={`${fieldClass(invalid)} flex items-center gap-2 text-left ${plain ? '!font-sans !text-body' : ''}`}
      >
        <span className="min-w-0 flex-1 truncate" title={selected?.label}>
          {selected ? selected.label : <span className="text-ink-3">Choose…</span>}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-ink-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="glass-overlay absolute top-[calc(100%+6px)] right-0 left-0 z-30 max-h-72 min-w-56 animate-pop-in overflow-auto rounded-lg p-1"
        >
          {options.map((option, position) => {
            const isSelected = option.value === value
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox button owns the keyboard (aria-activedescendant)
              <li
                key={option.value}
                id={`${listId}-${position}`}
                role="option"
                aria-selected={isSelected}
                title={option.detail ? `${option.label}\n${option.detail}` : option.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(position)}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${
                  position === active ? 'bg-subtle' : ''
                } ${isSelected ? 'bg-selected' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-body font-medium ${isSelected ? 'text-accent-ink' : 'text-ink'}`}
                  >
                    {option.label}
                  </span>
                  {option.detail && (
                    <span className="block truncate font-mono text-code-sm text-ink-3">{option.detail}</span>
                  )}
                </span>
                {isSelected && <Check aria-hidden className="size-4 shrink-0 text-accent-ink" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onValue: (value: boolean) => void
  label: ReactNode
  disabled?: boolean
  id?: string
  describedBy?: string
}

export function Toggle({ checked, onValue, label, disabled, id, describedBy }: ToggleProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onValue(!checked)}
      className="group inline-flex items-center gap-2 rounded-sm text-left disabled:opacity-45"
    >
      <span
        aria-hidden
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150 ${checked ? 'bg-accent' : 'bg-line-strong'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-3.5 rounded-full bg-on-accent shadow-hairline transition-transform duration-150 ease-out ${
            checked ? 'translate-x-3.5' : ''
          }`}
        />
      </span>
      <span className="text-body text-ink">{label}</span>
    </button>
  )
}
