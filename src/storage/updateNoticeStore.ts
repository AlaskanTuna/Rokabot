/** GitHub release tags the owner has already been told about, so each release is announced once. */

import { getDb } from './database.js'

export function wasUpdateNotified(tag: string): boolean {
  return getDb().prepare('SELECT 1 FROM update_notices WHERE tag = ?').get(tag) !== undefined
}

export function markUpdateNotified(tag: string, nowMs: number = Date.now()): void {
  getDb().prepare('INSERT OR IGNORE INTO update_notices (tag, notified_at) VALUES (?, ?)').run(tag, nowMs)
}
