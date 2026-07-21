/** Tracks channels monitored for passive memory extraction with 24h TTL, persisted to SQLite */

import { config } from '../config.js'
import { getDb } from '../storage/database.js'
import { logger } from '../utils/logger.js'

const MONITOR_TTL_MS = config.memory.channelMonitorTtlMs

// In-memory cache backed by SQLite
const monitoredChannels = new Map<string, number>() // channelId → expiry timestamp

/** Restore monitored channels from SQLite on startup */
export function restoreMonitoredChannels(): void {
  const db = getDb()
  const now = Date.now()
  const rows = db
    .prepare('SELECT channel_id, expires_at FROM monitored_channels WHERE expires_at > ?')
    .all(now) as Array<{
    channel_id: string
    expires_at: number
  }>
  for (const row of rows) {
    monitoredChannels.set(row.channel_id, row.expires_at)
  }
  // Clean expired rows
  db.prepare('DELETE FROM monitored_channels WHERE expires_at <= ?').run(now)
  if (rows.length > 0) {
    logger.info({ restored: rows.length }, 'Restored monitored channels from SQLite')
  }
}

export function markActive(channelId: string): void {
  const isNew = !monitoredChannels.has(channelId)
  const expiresAt = Date.now() + MONITOR_TTL_MS
  monitoredChannels.set(channelId, expiresAt)

  // Persist to SQLite
  try {
    const db = getDb()
    db.prepare('INSERT OR REPLACE INTO monitored_channels (channel_id, expires_at) VALUES (?, ?)').run(
      channelId,
      expiresAt
    )
  } catch {
    // Non-critical — in-memory still works
  }

  if (isNew) {
    logger.info({ channelId, totalMonitored: monitoredChannels.size }, 'Channel now monitored for passive memory')
  }
}

export function isMonitored(channelId: string): boolean {
  const expiry = monitoredChannels.get(channelId)
  if (!expiry) return false
  if (Date.now() > expiry) {
    monitoredChannels.delete(channelId)
    return false
  }
  return true
}

export function cleanupExpired(): void {
  const now = Date.now()
  let cleaned = 0
  for (const [channelId, expiry] of monitoredChannels) {
    if (now > expiry) {
      monitoredChannels.delete(channelId)
      cleaned++
    }
  }
  // Also clean SQLite
  try {
    const db = getDb()
    db.prepare('DELETE FROM monitored_channels WHERE expires_at <= ?').run(now)
  } catch {
    // Non-critical
  }
  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Cleaned up expired monitored channels')
  }
}

export function getMonitoredCount(): number {
  return monitoredChannels.size
}

/** Reset for testing */
export function resetMonitor(): void {
  monitoredChannels.clear()
}
