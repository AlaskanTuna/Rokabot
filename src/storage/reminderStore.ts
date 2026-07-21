/**
 * Reminder persistence — CRUD operations on the `reminders` SQLite table.
 * Supports creation (with per-user cap), due-query, delivery marking, and cleanup.
 */

import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

const MAX_ACTIVE_REMINDERS_PER_USER = config.reminders.maxPerUser

export interface CreateReminderResult {
  id: number
  success: boolean
  message: string
}

export interface DueReminder {
  id: number
  userId: string
  channelId: string
  reminder: string
}

export interface ActiveReminder {
  id: number
  reminder: string
  dueAt: number
}

/**
 * Count a user's active (undelivered) reminders.
 */
export function countActiveReminders(userId: string): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM reminders WHERE user_id = ? AND delivered = 0').get(userId) as {
    cnt: number
  }
  return row.cnt
}

/**
 * Insert a new reminder. Rejects if the user already has 5 active (undelivered) reminders.
 */
export function createReminder(
  userId: string,
  channelId: string,
  reminder: string,
  dueAt: number
): CreateReminderResult {
  const activeCount = countActiveReminders(userId)

  if (activeCount >= MAX_ACTIVE_REMINDERS_PER_USER) {
    return {
      id: -1,
      success: false,
      message: `${userId} already has ${MAX_ACTIVE_REMINDERS_PER_USER} active reminders. They need to wait for some to be delivered before setting more.`
    }
  }

  const db = getDb()
  const stmt = db.prepare(
    'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
  )
  const result = stmt.run(userId, channelId, reminder, dueAt, Date.now())

  return {
    id: Number(result.lastInsertRowid),
    success: true,
    message: `Reminder set for ${userId}.`
  }
}

/**
 * Get all reminders where due_at <= now and delivered = 0.
 * Reminders more than 5 minutes past due are silently dropped (marked delivered).
 */
export function getDueReminders(): DueReminder[] {
  const db = getDb()
  const now = Date.now()
  const staleThreshold = now - config.reminders.staleThresholdMs

  // Drop stale reminders (past due by more than 5 minutes)
  const stale = db.prepare('UPDATE reminders SET delivered = 1 WHERE delivered = 0 AND due_at < ?').run(staleThreshold)
  if (stale.changes > 0) {
    logger.info({ dropped: stale.changes }, 'Dropped stale reminders (>5min past due)')
  }

  const rows = db
    .prepare('SELECT id, user_id, channel_id, reminder FROM reminders WHERE delivered = 0 AND due_at <= ?')
    .all(now) as Array<{
    id: number
    user_id: string
    channel_id: string
    reminder: string
  }>

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    channelId: row.channel_id,
    reminder: row.reminder
  }))
}

/**
 * Mark a reminder as delivered so it won't be returned by getDueReminders again.
 */
export function markDelivered(id: number): void {
  const db = getDb()
  db.prepare('UPDATE reminders SET delivered = 1 WHERE id = ?').run(id)
}

/**
 * Get a user's active (undelivered) reminders, ordered by due_at ascending.
 */
export function getActiveReminders(userId: string): ActiveReminder[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT id, reminder, due_at FROM reminders WHERE user_id = ? AND delivered = 0 ORDER BY due_at ASC')
    .all(userId) as Array<{
    id: number
    reminder: string
    due_at: number
  }>

  return rows.map((row) => ({
    id: row.id,
    reminder: row.reminder,
    dueAt: row.due_at
  }))
}

/**
 * Get a single reminder by ID (returns null if not found or already delivered).
 */
export function getReminderById(id: number): { id: number; userId: string; reminder: string; dueAt: number } | null {
  const db = getDb()
  const row = db
    .prepare('SELECT id, user_id, reminder, due_at FROM reminders WHERE id = ? AND delivered = 0')
    .get(id) as { id: number; user_id: string; reminder: string; due_at: number } | undefined

  if (!row) return null
  return { id: row.id, userId: row.user_id, reminder: row.reminder, dueAt: row.due_at }
}

/**
 * Delete a specific reminder by ID.
 */
export function deleteReminder(id: number): void {
  const db = getDb()
  db.prepare('DELETE FROM reminders WHERE id = ?').run(id)
}
