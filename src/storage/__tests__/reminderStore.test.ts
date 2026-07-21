import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    reminders: { checkIntervalMs: 5_000, maxPerUser: 5, staleThresholdMs: 300_000 }
  }
}))

// Use an in-memory SQLite database for tests
let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import {
  countActiveReminders,
  createReminder,
  deleteReminder,
  getActiveReminders,
  getDueReminders,
  markDelivered
} from '../reminderStore.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      reminder TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      delivered INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders (delivered, due_at);
  `)
  return db
}

describe('reminderStore', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  describe('createReminder', () => {
    it('saves a reminder and returns its id', () => {
      const result = createReminder('Alice', 'ch-1', 'buy milk', Date.now() + 60_000)

      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
      expect(result.message).toContain('Alice')
    })

    it('assigns incrementing ids', () => {
      const r1 = createReminder('Alice', 'ch-1', 'first', Date.now() + 60_000)
      const r2 = createReminder('Alice', 'ch-1', 'second', Date.now() + 120_000)

      expect(r2.id).toBeGreaterThan(r1.id)
    })

    it('stores reminder data correctly in the database', () => {
      const dueAt = Date.now() + 60_000
      createReminder('Alice', 'ch-1', 'buy milk', dueAt)

      const row = testDb.prepare('SELECT * FROM reminders WHERE user_id = ?').get('Alice') as {
        user_id: string
        channel_id: string
        reminder: string
        due_at: number
        delivered: number
      }
      expect(row.user_id).toBe('Alice')
      expect(row.channel_id).toBe('ch-1')
      expect(row.reminder).toBe('buy milk')
      expect(row.due_at).toBe(dueAt)
      expect(row.delivered).toBe(0)
    })
  })

  describe('getDueReminders', () => {
    it('returns reminders that are due (due_at <= now)', () => {
      const pastDue = Date.now() - 60_000
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Alice', 'ch-1', 'past reminder', pastDue, Date.now())

      const due = getDueReminders()
      expect(due).toHaveLength(1)
      expect(due[0].userId).toBe('Alice')
      expect(due[0].channelId).toBe('ch-1')
      expect(due[0].reminder).toBe('past reminder')
    })

    it('does not return future reminders', () => {
      const futureDue = Date.now() + 600_000
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Alice', 'ch-1', 'future reminder', futureDue, Date.now())

      const due = getDueReminders()
      expect(due).toHaveLength(0)
    })

    it('does not return already delivered reminders', () => {
      const pastDue = Date.now() - 60_000
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 1)'
        )
        .run('Alice', 'ch-1', 'delivered reminder', pastDue, Date.now())

      const due = getDueReminders()
      expect(due).toHaveLength(0)
    })

    it('returns multiple due reminders from different users', () => {
      const pastDue = Date.now() - 60_000
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Alice', 'ch-1', 'alice reminder', pastDue, Date.now())
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Bob', 'ch-2', 'bob reminder', pastDue, Date.now())

      const due = getDueReminders()
      expect(due).toHaveLength(2)
    })
  })

  describe('markDelivered', () => {
    it('prevents a reminder from appearing in getDueReminders', () => {
      const pastDue = Date.now() - 60_000
      const result = createReminder('Alice', 'ch-1', 'test', pastDue)

      expect(getDueReminders()).toHaveLength(1)

      markDelivered(result.id)

      expect(getDueReminders()).toHaveLength(0)
    })

    it('sets the delivered column to 1', () => {
      const result = createReminder('Alice', 'ch-1', 'test', Date.now() - 60_000)

      markDelivered(result.id)

      const row = testDb.prepare('SELECT delivered FROM reminders WHERE id = ?').get(result.id) as { delivered: number }
      expect(row.delivered).toBe(1)
    })
  })

  describe('5-reminder cap per user', () => {
    it('allows up to 5 active reminders', () => {
      for (let i = 1; i <= 5; i++) {
        const result = createReminder('Alice', 'ch-1', `reminder ${i}`, Date.now() + i * 60_000)
        expect(result.success).toBe(true)
      }
      expect(countActiveReminders('Alice')).toBe(5)
    })

    it('rejects the 6th active reminder', () => {
      for (let i = 1; i <= 5; i++) {
        createReminder('Alice', 'ch-1', `reminder ${i}`, Date.now() + i * 60_000)
      }

      const result = createReminder('Alice', 'ch-1', 'one too many', Date.now() + 360_000)
      expect(result.success).toBe(false)
      expect(result.id).toBe(-1)
      expect(result.message).toContain('5')
    })

    it('allows a new reminder after one is delivered', () => {
      const ids: number[] = []
      for (let i = 1; i <= 5; i++) {
        const result = createReminder('Alice', 'ch-1', `reminder ${i}`, Date.now() + i * 60_000)
        ids.push(result.id)
      }

      markDelivered(ids[0])

      const result = createReminder('Alice', 'ch-1', 'after delivery', Date.now() + 360_000)
      expect(result.success).toBe(true)
    })

    it('does not count other users reminders toward the cap', () => {
      for (let i = 1; i <= 5; i++) {
        createReminder('Alice', 'ch-1', `reminder ${i}`, Date.now() + i * 60_000)
      }

      const result = createReminder('Bob', 'ch-1', 'bob reminder', Date.now() + 60_000)
      expect(result.success).toBe(true)
    })
  })

  describe('getActiveReminders', () => {
    it('returns empty array for user with no reminders', () => {
      const reminders = getActiveReminders('nobody')
      expect(reminders).toEqual([])
    })

    it('returns only undelivered reminders for the user', () => {
      const r1 = createReminder('Alice', 'ch-1', 'active one', Date.now() + 60_000)
      createReminder('Alice', 'ch-1', 'active two', Date.now() + 120_000)
      markDelivered(r1.id)

      const reminders = getActiveReminders('Alice')
      expect(reminders).toHaveLength(1)
      expect(reminders[0].reminder).toBe('active two')
    })

    it('returns reminders ordered by due_at ascending', () => {
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Alice', 'ch-1', 'later', 3000, 1000)
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Alice', 'ch-1', 'sooner', 1000, 1000)
      testDb
        .prepare(
          'INSERT INTO reminders (user_id, channel_id, reminder, due_at, created_at, delivered) VALUES (?, ?, ?, ?, ?, 0)'
        )
        .run('Alice', 'ch-1', 'middle', 2000, 1000)

      const reminders = getActiveReminders('Alice')
      expect(reminders[0].reminder).toBe('sooner')
      expect(reminders[1].reminder).toBe('middle')
      expect(reminders[2].reminder).toBe('later')
    })

    it('does not return other users reminders', () => {
      createReminder('Alice', 'ch-1', 'alice reminder', Date.now() + 60_000)
      createReminder('Bob', 'ch-1', 'bob reminder', Date.now() + 60_000)

      const reminders = getActiveReminders('Alice')
      expect(reminders).toHaveLength(1)
      expect(reminders[0].reminder).toBe('alice reminder')
    })
  })

  describe('deleteReminder', () => {
    it('removes a reminder from the database', () => {
      const result = createReminder('Alice', 'ch-1', 'to delete', Date.now() + 60_000)

      deleteReminder(result.id)

      const row = testDb.prepare('SELECT * FROM reminders WHERE id = ?').get(result.id)
      expect(row).toBeUndefined()
    })

    it('does not affect other reminders', () => {
      const r1 = createReminder('Alice', 'ch-1', 'keep', Date.now() + 60_000)
      const r2 = createReminder('Alice', 'ch-1', 'delete', Date.now() + 120_000)

      deleteReminder(r2.id)

      expect(countActiveReminders('Alice')).toBe(1)
      const reminders = getActiveReminders('Alice')
      expect(reminders[0].id).toBe(r1.id)
    })

    it('does not throw when deleting a non-existent reminder', () => {
      expect(() => deleteReminder(99999)).not.toThrow()
    })
  })

  describe('countActiveReminders', () => {
    it('returns 0 for a user with no reminders', () => {
      expect(countActiveReminders('nobody')).toBe(0)
    })

    it('returns correct count of undelivered reminders', () => {
      createReminder('Alice', 'ch-1', 'one', Date.now() + 60_000)
      createReminder('Alice', 'ch-1', 'two', Date.now() + 120_000)
      const r3 = createReminder('Alice', 'ch-1', 'three', Date.now() + 180_000)

      markDelivered(r3.id)

      expect(countActiveReminders('Alice')).toBe(2)
    })

    it('does not count other users reminders', () => {
      createReminder('Alice', 'ch-1', 'alice', Date.now() + 60_000)
      createReminder('Bob', 'ch-1', 'bob', Date.now() + 60_000)

      expect(countActiveReminders('Alice')).toBe(1)
    })
  })
})
