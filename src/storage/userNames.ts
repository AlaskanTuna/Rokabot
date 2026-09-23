/** Persistent user_id → username + display_name lookup table */

import { getDb } from './database.js'

/** Upsert a user's identity mapping (called on every monitored message) */
export function upsertUserName(userId: string, username: string, displayName: string): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO user_names (user_id, username, display_name, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET username = ?, display_name = ?, updated_at = ?`
  ).run(userId, username, displayName, Date.now(), username, displayName, Date.now())
}

export interface UserName {
  userId: string
  username: string
  displayName: string
}

/** Get all known user mappings */
export function getAllUserNames(): Map<string, UserName> {
  const db = getDb()
  const rows = db.prepare('SELECT user_id, username, display_name FROM user_names').all() as Array<{
    user_id: string
    username: string
    display_name: string
  }>
  const map = new Map<string, UserName>()
  for (const row of rows) {
    map.set(row.user_id, { userId: row.user_id, username: row.username, displayName: row.display_name })
  }
  return map
}

/** Get a single user's mapping by userId */
export function getUserName(userId: string): UserName | null {
  const db = getDb()
  const row = db.prepare('SELECT user_id, username, display_name FROM user_names WHERE user_id = ?').get(userId) as
    | { user_id: string; username: string; display_name: string }
    | undefined
  if (!row) return null
  return { userId: row.user_id, username: row.username, displayName: row.display_name }
}
