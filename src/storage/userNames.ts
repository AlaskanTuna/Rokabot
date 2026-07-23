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

/** Find a user by name; when guildId is given, prefer members with claims or activity in that guild */
export function findUserByName(name: string, guildId?: string): UserName | null {
  const db = getDb()
  const normalizedName = name.trim()
  if (!normalizedName) return null

  const find = (column: 'display_name' | 'username') => {
    const base = `SELECT user_id, username, display_name FROM user_names WHERE LOWER(TRIM(${column})) = LOWER(?)`
    if (!guildId || guildId === 'global') {
      return db.prepare(`${base} LIMIT 1`).get(normalizedName) as
        | { user_id: string; username: string; display_name: string }
        | undefined
    }
    return db
      .prepare(
        `${base}
         ORDER BY (
           EXISTS(SELECT 1 FROM memory_claim WHERE guild_id = ? AND subject_user_id = user_names.user_id)
           OR EXISTS(SELECT 1 FROM response_events WHERE guild_id = ? AND user_id = user_names.user_id)
         ) DESC
         LIMIT 1`
      )
      .get(normalizedName, guildId, guildId) as { user_id: string; username: string; display_name: string } | undefined
  }
  const row = find('display_name') ?? find('username')

  if (!row) return null
  return { userId: row.user_id, username: row.username, displayName: row.display_name }
}
