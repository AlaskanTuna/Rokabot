/**
 * Shared ledger for Google Lens searches: a count per billing month (UTC, starting on `imageId.resetDay`)
 * and per UTC day for automatic lookups, plus a 24 h cache of results keyed by attachment id.
 */

import { config } from '../../../config.js'
import { getDb } from '../../../storage/database.js'

export type LensKind = 'auto' | 'model'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** Billing-month key for the moment: the current UTC month, unless its day precedes the billing start. */
export function billingMonthKey(nowMs: number, resetDay: number): string {
  const date = new Date(nowMs)
  let year = date.getUTCFullYear()
  let month = date.getUTCMonth()
  if (date.getUTCDate() < resetDay) {
    month -= 1
    if (month < 0) {
      month = 11
      year -= 1
    }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

/** The cache key for an image url: the Discord CDN attachment id, or the whole url when it has none. */
export function lensCacheKey(url: string): string {
  try {
    const match = new URL(url).pathname.match(/\/attachments\/[^/]+\/([^/]+)(?:\/|$)/)
    if (match) return match[1]
  } catch {
    // A relative or malformed url keys on itself below.
  }
  return url
}

/** Whether another Lens search of this kind may run: under the shared monthly cap, and for automatic
 * lookups, under the daily cap too. */
export function lensAllowed(kind: LensKind, nowMs: number = Date.now()): boolean {
  const db = getDb()
  const month = billingMonthKey(nowMs, config.imageId.resetDay)
  const monthCount = (
    db.prepare('SELECT COUNT(*) AS count FROM lens_search WHERE month = ?').get(month) as { count: number }
  ).count
  if (monthCount >= config.imageId.monthlyCap) return false
  if (kind === 'auto') {
    const dayCount = (
      db.prepare("SELECT COUNT(*) AS count FROM lens_search WHERE kind = 'auto' AND day = ?").get(dayKey(nowMs)) as {
        count: number
      }
    ).count
    if (dayCount >= config.imageId.autoDailyCap) return false
  }
  return true
}

/** Records one Lens search that reached SerpApi, in the current billing month and UTC day. */
export function recordLensSearch(kind: LensKind, nowMs: number = Date.now()): void {
  getDb()
    .prepare('INSERT INTO lens_search (kind, month, day, created_at) VALUES (?, ?, ?, ?)')
    .run(kind, billingMonthKey(nowMs, config.imageId.resetDay), dayKey(nowMs), nowMs)
}

/** The cached Lens matches (as JSON) for the key, or undefined on a miss or an entry older than 24 h. */
export function cachedLens(key: string, nowMs: number = Date.now()): string | undefined {
  const row = getDb().prepare('SELECT result, created_at FROM lens_cache WHERE key = ?').get(key) as
    | { result: string; created_at: number }
    | undefined
  if (!row) return undefined
  if (nowMs - row.created_at > CACHE_TTL_MS) {
    getDb().prepare('DELETE FROM lens_cache WHERE key = ?').run(key)
    return undefined
  }
  return row.result
}

/** Keeps the Lens matches (as JSON) for the key for the next 24 h, and drops entries past that. */
export function storeLens(key: string, result: string, nowMs: number = Date.now()): void {
  const db = getDb()
  db.prepare('DELETE FROM lens_cache WHERE created_at < ?').run(nowMs - CACHE_TTL_MS)
  db.prepare('INSERT OR REPLACE INTO lens_cache (key, result, created_at) VALUES (?, ?, ?)').run(key, result, nowMs)
}
