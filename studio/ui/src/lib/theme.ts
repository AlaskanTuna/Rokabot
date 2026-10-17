import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'studio.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

let choice: ThemeChoice = readChoice()

function apply(): void {
  const dark = choice === 'dark' || (choice === 'system' && media().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

export function setTheme(next: ThemeChoice): void {
  choice = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {}
  apply()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The stored choice plus a setter; System follows the OS setting live. */
export function useTheme(): [ThemeChoice, (next: ThemeChoice) => void] {
  const current = useSyncExternalStore(subscribe, () => choice)
  useEffect(() => {
    const query = media()
    const onChange = () => apply()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return [current, useCallback((next: ThemeChoice) => setTheme(next), [])]
}

/** Marks the page idle while hidden or unfocused, which pauses the ambient drift. */
export function watchIdle(): () => void {
  const root = document.documentElement
  const update = () => {
    if (document.hidden || !document.hasFocus()) root.dataset.idle = ''
    else delete root.dataset.idle
  }
  update()
  document.addEventListener('visibilitychange', update)
  window.addEventListener('focus', update)
  window.addEventListener('blur', update)
  return () => {
    document.removeEventListener('visibilitychange', update)
    window.removeEventListener('focus', update)
    window.removeEventListener('blur', update)
  }
}
