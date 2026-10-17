import { Bell, CircleCheck, CircleX, Info, Monitor, Moon, Sun, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type ThemeChoice, useTheme } from '../../lib/theme'
import {
  type Notice,
  type Toast,
  type Tone,
  notifications,
  relativeTime,
  useNotifications
} from '../../state/notifications'
import { Badge } from '../ui/Badge'
import { ActionChip } from '../ui/Button'
import { useDismiss } from '../ui/useDismiss'

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'Match system theme', icon: Monitor }
]

export function ThemeSwitch() {
  const [theme, setTheme] = useTheme()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  return (
    <div role="radiogroup" aria-label="Theme" className="glass-cta inline-flex gap-0.5 rounded-md p-0.5">
      {THEMES.map(({ value, label, icon: Icon }, index) => {
        const checked = theme === value
        return (
          <button
            key={value}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            tabIndex={checked ? 0 : -1}
            onClick={() => setTheme(value)}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
              event.preventDefault()
              const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
              const next = (index + step + THEMES.length) % THEMES.length
              setTheme(THEMES[next].value)
              refs.current[next]?.focus()
            }}
            className={`inline-flex h-[26px] w-7 items-center justify-center rounded-sm border transition-colors duration-150 ${
              checked ? 'border-glass-edge bg-glass-raised text-ink' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        )
      })}
    </div>
  )
}

const TONE_ICON: Record<Tone, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: 'text-info' },
  success: { icon: CircleCheck, color: 'text-success' },
  warning: { icon: TriangleAlert, color: 'text-warning' },
  danger: { icon: CircleX, color: 'text-danger' }
}

function NoticeRow({ notice, close }: { notice: Notice; close: () => void }) {
  const { icon: Icon, color } = TONE_ICON[notice.tone]
  return (
    <li className="group flex gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 hover:bg-subtle">
      <span className="mt-px inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-subtle">
        <Icon aria-hidden className={`size-4 ${color}`} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <p className={`min-w-0 flex-1 text-body text-ink ${notice.read ? '' : 'font-medium'}`}>{notice.title}</p>
          <time className="text-label text-ink-3" dateTime={new Date(notice.time).toISOString()}>
            {relativeTime(notice.time)}
          </time>
          {!notice.read && <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-accent" />}
        </div>
        <p className="text-small break-words text-ink-2">{notice.body}</p>
        {notice.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {notice.actions.slice(0, 2).map((action) => (
              <ActionChip
                key={action.label}
                label={action.label}
                primary={action.primary}
                icon={action.icon}
                onClick={() => {
                  notifications.markRead(notice.id)
                  action.run()
                  close()
                }}
              />
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={`Dismiss ${notice.title}`}
        onClick={() => notifications.remove(notice.id)}
        className="-mr-1 size-6 shrink-0 self-start rounded-sm text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-raised hover:text-ink focus-visible:opacity-100"
      >
        <X aria-hidden className="m-auto size-3.5" />
      </button>
    </li>
  )
}

export function NotificationCenter() {
  const { notices } = useNotifications()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const bell = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  const closeAndReturn = useCallback(() => {
    setOpen(false)
    bell.current?.focus()
  }, [])
  useDismiss(root, open, closeAndReturn, panel)
  useEffect(() => {
    if (open) panel.current?.focus()
  }, [open])
  // The panel lives in a portal: the header's glass ancestors trap fixed positioning and clip it on narrow screens.
  const [place, setPlace] = useState<{ top: number; right: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const rect = bell.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(396, window.innerWidth - 16)
      const right = Math.min(Math.max(8, window.innerWidth - rect.right), window.innerWidth - width - 8)
      setPlace({ top: rect.bottom + 8, right, width })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [open])
  const unread = notices.filter((notice) => !notice.read).length
  const [, tick] = useState(0)
  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => tick((value) => value + 1), 30_000)
    return () => clearInterval(timer)
  }, [open])

  return (
    <div ref={root} className="relative">
      <button
        ref={bell}
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex size-8 items-center justify-center rounded-md transition-colors duration-150 ${
          open
            ? 'glass-cta !border-line-strong !bg-glass-raised text-ink'
            : 'glass-cta text-ink-2 hover:!bg-subtle hover:text-ink'
        }`}
      >
        <Bell aria-hidden className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-[5px] left-[19px] inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-label text-on-accent ring-2 ring-canvas">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Notifications"
            tabIndex={-1}
            style={{
              top: place.top,
              right: place.right,
              width: place.width,
              maxHeight: `calc(100vh - ${place.top + 8}px)`
            }}
            className="glass-overlay fixed z-40 flex animate-pop-in flex-col rounded-lg p-1.5 text-ink outline-none"
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              <h2 className="text-body font-medium text-ink">Notifications</h2>
              {unread > 0 && <Badge tone="accent">{unread} new</Badge>}
              <span className="flex-1" />
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => notifications.markAllRead()}
                  className="rounded-sm px-1 text-small text-accent-ink hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="h-px bg-line" />
            {notices.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-subtle">
                  <Bell aria-hidden className="size-5 text-ink-3" />
                </span>
                <p className="text-body font-medium text-ink">You're all caught up</p>
                <p className="text-small text-ink-3">Saves, pack checks and model errors show up here.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5 overflow-y-auto pt-1">
                {notices.map((notice) => (
                  <NoticeRow key={notice.id} notice={notice} close={close} />
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

const TOAST_MS = 6000

function ToastCard({ id, tone, title, body, action, sticky }: Omit<Toast, 'key'>) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (sticky || paused) return
    const timer = setTimeout(() => notifications.dismissToast(id), TOAST_MS)
    return () => clearTimeout(timer)
  }, [id, sticky, paused])
  const { icon: Icon, color } = TONE_ICON[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="glass-overlay pointer-events-auto flex w-[380px] max-w-[calc(100vw-24px)] animate-toast-in gap-3 rounded-lg px-4 py-3"
    >
      <Icon aria-hidden className={`mt-0.5 size-[18px] shrink-0 ${color}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body font-medium text-ink">{title}</p>
        <p className="text-small break-words text-ink-2">{body}</p>
        {action && (
          <div className="pt-1.5">
            <ActionChip
              label={action.label}
              icon={action.icon}
              onClick={() => {
                action.run()
                notifications.dismissToast(id)
              }}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={() => notifications.dismissToast(id)}
        className="size-6 shrink-0 rounded-sm text-ink-3 hover:bg-subtle hover:text-ink"
      >
        <X aria-hidden className="m-auto size-3.5" />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts } = useNotifications()
  return (
    <section
      aria-label="Messages"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2"
    >
      {toasts.slice(-3).map((toast) => (
        <ToastCard
          key={toast.id}
          id={toast.id}
          tone={toast.tone}
          title={toast.title}
          body={toast.body}
          action={toast.action}
          sticky={toast.sticky}
        />
      ))}
    </section>
  )
}

export function Ambient() {
  return (
    <div aria-hidden className="ambient">
      <span className="glow-1" />
      <span className="glow-2" />
      <span className="glow-3" />
    </div>
  )
}
