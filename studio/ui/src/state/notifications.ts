import { useSyncExternalStore } from 'react'

export type Tone = 'info' | 'success' | 'warning' | 'danger'

export interface Action {
  label: string
  run: () => void
  primary?: boolean
  icon?: 'copy'
}

export interface Notice {
  id: number
  /** Notices with the same key replace each other, so a repeated state (say, unsaved changes) shows once. */
  key?: string
  tone: Tone
  title: string
  body: string
  time: number
  read: boolean
  actions: Action[]
}

export interface Toast {
  id: number
  key?: string
  tone: Tone
  title: string
  body: string
  action?: Action
  /** Errors stay until closed; everything else leaves after a few seconds. */
  sticky: boolean
}

interface State {
  notices: Notice[]
  toasts: Toast[]
}

let state: State = { notices: [], toasts: [] }
let nextId = 1
const listeners = new Set<() => void>()
const MAX_NOTICES = 30

function set(next: State): void {
  state = next
  for (const listener of listeners) listener()
}

export interface NoticeInput {
  key?: string
  tone: Tone
  title: string
  body: string
  actions?: Action[]
  toast?: boolean
}

export const notifications = {
  notify(input: NoticeInput): number {
    const id = nextId++
    const notice: Notice = {
      id,
      key: input.key,
      tone: input.tone,
      title: input.title,
      body: input.body,
      time: Date.now(),
      read: false,
      actions: input.actions ?? []
    }
    const kept = state.notices.filter((existing) => !input.key || existing.key !== input.key)
    // A toast for a kept notice is never sticky (the panel holds it), and replaces the last toast with the same key.
    const others = state.toasts.filter((toast) => !input.key || toast.key !== input.key)
    const toasts = input.toast
      ? [
          ...others,
          {
            id,
            key: input.key,
            tone: input.tone,
            title: input.title,
            body: input.body,
            action: notice.actions[0],
            sticky: false
          }
        ]
      : others
    set({ notices: [notice, ...kept].slice(0, MAX_NOTICES), toasts })
    return id
  },
  /** Shows a toast without keeping it in the panel, for confirmations such as "Copied". */
  toast(input: Omit<Toast, 'id' | 'sticky'> & { sticky?: boolean }): void {
    const toast = { ...input, id: nextId++, sticky: input.sticky ?? input.tone === 'danger' }
    set({ ...state, toasts: [...state.toasts, toast] })
  },
  dismissToast(id: number): void {
    set({ ...state, toasts: state.toasts.filter((toast) => toast.id !== id) })
  },
  removeKey(key: string): void {
    if (!state.notices.some((notice) => notice.key === key)) return
    set({ ...state, notices: state.notices.filter((notice) => notice.key !== key) })
  },
  remove(id: number): void {
    set({ ...state, notices: state.notices.filter((notice) => notice.id !== id) })
  },
  markAllRead(): void {
    set({ ...state, notices: state.notices.map((notice) => ({ ...notice, read: true })) })
  },
  markRead(id: number): void {
    set({ ...state, notices: state.notices.map((notice) => (notice.id === id ? { ...notice, read: true } : notice)) })
  },
  reset(): void {
    set({ notices: [], toasts: [] })
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useNotifications(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    notifications.toast({ tone: 'success', title: 'Copied', body: what })
  } catch {
    notifications.toast({
      tone: 'warning',
      title: 'Could not copy',
      body: `Your browser blocked the clipboard. Copy it by hand: ${text}`
    })
  }
}

export function relativeTime(time: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - time) / 1000))
  if (seconds < 45) return 'now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`
}
