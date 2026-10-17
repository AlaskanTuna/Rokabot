import { humanize } from '../../components/form/YamlForm'

export interface Match {
  group: string
  /** The keys inside the group that match; null when the whole group does. */
  keys: string[] | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const keyHit = (key: string, query: string) =>
  key.toLowerCase().includes(query) || humanize(key).toLowerCase().includes(query)

function textHit(value: unknown, query: string): boolean {
  if (typeof value === 'string') return value.toLowerCase().includes(query)
  if (Array.isArray(value)) return value.some((item) => textHit(item, query))
  if (isRecord(value)) return Object.entries(value).some(([key, item]) => keyHit(key, query) || textHit(item, query))
  return false
}

/** The groups, and the keys inside them, whose key or text contains the query, ignoring case. */
export function searchLines(data: unknown, query: string): Match[] {
  const needle = query.trim().toLowerCase()
  if (!isRecord(data) || !needle) return []
  return Object.entries(data).flatMap(([group, value]): Match[] => {
    if (keyHit(group, needle)) return [{ group, keys: null }]
    if (isRecord(value)) {
      const keys = Object.entries(value)
        .filter(([key, item]) => keyHit(key, needle) || textHit(item, needle))
        .map(([key]) => key)
      return keys.length > 0 ? [{ group, keys }] : []
    }
    return textHit(value, needle) ? [{ group, keys: null }] : []
  })
}
