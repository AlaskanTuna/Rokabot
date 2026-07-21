/**
 * Session history persistence — write-behind storage and cold-start rehydration.
 * Wraps SQLite operations on the `session_history` table.
 */

import type { WindowMessage } from '../session/types.js'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

/**
 * Persist a single message to the session history table.
 * @param channelId - Discord channel ID
 * @param role - Message author role ('user' or 'assistant')
 * @param displayName - Display name of the message author
 * @param content - Message text content
 * @param userId - Discord user ID (optional, for user messages)
 */
export function saveMessage(
  channelId: string,
  role: 'user' | 'assistant',
  displayName: string,
  content: string,
  userId?: string,
  username?: string
): void {
  const db = getDb()
  const stmt = db.prepare(
    'INSERT INTO session_history (channel_id, role, display_name, content, timestamp, user_id, username) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  stmt.run(channelId, role, displayName, content, Date.now(), userId ?? null, username ?? null)

  // Backfill user_id and username on old rows so cold-start mapping works
  if (userId && role === 'user') {
    db.prepare(
      'UPDATE session_history SET user_id = ?, username = COALESCE(username, ?) WHERE channel_id = ? AND display_name = ? AND user_id IS NULL'
    ).run(userId, username ?? null, channelId, displayName)
    // Also backfill username on rows that have user_id but no username
    if (username) {
      db.prepare('UPDATE session_history SET username = ? WHERE user_id = ? AND username IS NULL').run(username, userId)
    }
  }
}

/**
 * Load the most recent messages for a channel, ordered oldest-first.
 * @param channelId - Discord channel ID
 * @param limit - Maximum number of messages to return
 * @returns Array of WindowMessage ordered by timestamp ascending
 */
export function loadHistory(channelId: string, limit: number, maxAgeMs?: number): WindowMessage[] {
  const db = getDb()
  const cutoff = maxAgeMs ? Date.now() - maxAgeMs : 0
  const stmt = db.prepare(`
    SELECT role, display_name, content, timestamp
    FROM session_history
    WHERE channel_id = ? AND timestamp >= ?
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  const rows = stmt.all(channelId, cutoff, limit) as Array<{
    role: 'user' | 'assistant'
    display_name: string
    content: string
    timestamp: number
  }>

  return rows.reverse().map((row) => ({
    role: row.role,
    displayName: row.display_name,
    content: row.content,
    timestamp: row.timestamp
  }))
}

/**
 * Delete all stored history for a channel.
 * @param channelId - Discord channel ID
 */
export function clearHistory(channelId: string): void {
  const db = getDb()
  const stmt = db.prepare('DELETE FROM session_history WHERE channel_id = ?')
  stmt.run(channelId)
}

/**
 * Delete session history older than the specified number of days.
 * Returns the number of rows deleted.
 */
export function pruneOldHistory(maxAgeDays: number = 7): number {
  const db = getDb()
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const result = db.prepare('DELETE FROM session_history WHERE timestamp < ?').run(cutoff)
  if (result.changes > 0) {
    logger.info({ pruned: result.changes, maxAgeDays }, 'Pruned old session history')
  }
  return result.changes
}

export interface ChannelUser {
  userId: string
  displayName: string
  username: string | null
}

/** Get unique users from recent session history for a channel (keyed by userId) */
export function getChannelUsers(channelId: string, limit: number): Map<string, ChannelUser> {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT display_name, user_id, username FROM session_history
       WHERE channel_id = ? AND user_id IS NOT NULL AND role = 'user'
       ORDER BY timestamp DESC LIMIT ?`
    )
    .all(channelId, limit) as Array<{ display_name: string; user_id: string; username: string | null }>

  const map = new Map<string, ChannelUser>()
  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, { userId: row.user_id, displayName: row.display_name, username: row.username })
    }
  }
  return map
}
