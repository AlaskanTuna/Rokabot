import { useSyncExternalStore } from 'react'

export const ROUTES = [
  'identity',
  'prompts',
  'voice',
  'moods',
  'lines',
  'models',
  'memory',
  'limits',
  'discord',
  'secrets'
] as const
export type Route = (typeof ROUTES)[number]

export const DEFAULT_ROUTE: Route = 'prompts'

export interface Location {
  route: Route
  /** The part after the route, e.g. `who-you-are.md` in `/prompts/who-you-are.md`. */
  rest: string
  search: URLSearchParams
}

const listeners = new Set<() => void>()
let cached: { key: string; value: Location } | null = null

function parse(): Location {
  const key = window.location.pathname + window.location.search
  if (cached?.key === key) return cached.value
  const [first = '', ...rest] = window.location.pathname.split('/').filter(Boolean)
  const route = (ROUTES as readonly string[]).includes(first) ? (first as Route) : DEFAULT_ROUTE
  const value = {
    route,
    rest: rest.map(decodeURIComponent).join('/'),
    search: new URLSearchParams(window.location.search)
  }
  cached = { key, value }
  return value
}

function notify(): void {
  for (const listener of listeners) listener()
}

window.addEventListener('popstate', notify)

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === window.location.pathname + window.location.search) return
  if (options.replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  notify()
}

export function useLocation(): Location {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, parse)
}

export function href(route: Route, rest?: string): string {
  return rest ? `/${route}/${rest.split('/').map(encodeURIComponent).join('/')}` : `/${route}`
}
