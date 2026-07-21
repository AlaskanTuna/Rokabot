import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' }
  }
}))

// Use an in-memory SQLite database for tests
let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import { clearHistory, loadHistory, pruneOldHistory, saveMessage } from '../sessionStore.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_history (
      channel_id TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      user_id TEXT DEFAULT NULL,
      username TEXT DEFAULT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_history_channel_ts
      ON session_history (channel_id, timestamp);
  `)
  return db
}

describe('sessionStore', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  describe('saveMessage', () => {
    it('persists a user message', () => {
      saveMessage('ch-1', 'user', 'Alice', 'hello')

      const rows = testDb.prepare('SELECT * FROM session_history WHERE channel_id = ?').all('ch-1') as Array<{
        channel_id: string
        role: string
        display_name: string
        content: string
        timestamp: number
      }>
      expect(rows).toHaveLength(1)
      expect(rows[0].role).toBe('user')
      expect(rows[0].display_name).toBe('Alice')
      expect(rows[0].content).toBe('hello')
      expect(rows[0].timestamp).toBeGreaterThan(0)
    })

    it('persists an assistant message', () => {
      saveMessage('ch-1', 'assistant', 'Roka', 'hi there~')

      const rows = testDb.prepare('SELECT * FROM session_history WHERE channel_id = ?').all('ch-1') as Array<{
        role: string
        display_name: string
        content: string
      }>
      expect(rows).toHaveLength(1)
      expect(rows[0].role).toBe('assistant')
      expect(rows[0].display_name).toBe('Roka')
      expect(rows[0].content).toBe('hi there~')
    })

    it('persists multiple messages for the same channel', () => {
      saveMessage('ch-1', 'user', 'Alice', 'first')
      saveMessage('ch-1', 'assistant', 'Roka', 'second')
      saveMessage('ch-1', 'user', 'Bob', 'third')

      const rows = testDb.prepare('SELECT * FROM session_history WHERE channel_id = ?').all('ch-1')
      expect(rows).toHaveLength(3)
    })

    it('keeps messages from different channels separate', () => {
      saveMessage('ch-1', 'user', 'Alice', 'in channel 1')
      saveMessage('ch-2', 'user', 'Bob', 'in channel 2')

      const ch1 = testDb.prepare('SELECT * FROM session_history WHERE channel_id = ?').all('ch-1')
      const ch2 = testDb.prepare('SELECT * FROM session_history WHERE channel_id = ?').all('ch-2')
      expect(ch1).toHaveLength(1)
      expect(ch2).toHaveLength(1)
    })
  })

  describe('loadHistory', () => {
    it('returns empty array for channel with no history', () => {
      const result = loadHistory('nonexistent', 10)
      expect(result).toEqual([])
    })

    it('returns messages in oldest-first order', () => {
      // Insert with explicit timestamps to control ordering
      testDb
        .prepare(
          'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
        .run('ch-1', 'user', 'Alice', 'first', 1000)
      testDb
        .prepare(
          'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
        .run('ch-1', 'assistant', 'Roka', 'second', 2000)
      testDb
        .prepare(
          'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
        .run('ch-1', 'user', 'Alice', 'third', 3000)

      const result = loadHistory('ch-1', 10)
      expect(result).toHaveLength(3)
      expect(result[0].content).toBe('first')
      expect(result[1].content).toBe('second')
      expect(result[2].content).toBe('third')
    })

    it('respects the limit parameter (FIFO — returns most recent)', () => {
      for (let i = 1; i <= 5; i++) {
        testDb
          .prepare(
            'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
          )
          .run('ch-1', 'user', 'Alice', `msg-${i}`, i * 1000)
      }

      const result = loadHistory('ch-1', 3)
      expect(result).toHaveLength(3)
      expect(result[0].content).toBe('msg-3')
      expect(result[1].content).toBe('msg-4')
      expect(result[2].content).toBe('msg-5')
    })

    it('maps database columns to WindowMessage fields', () => {
      testDb
        .prepare(
          'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
        .run('ch-1', 'user', 'Alice', 'hello', 12345)

      const result = loadHistory('ch-1', 1)
      expect(result[0]).toEqual({
        role: 'user',
        displayName: 'Alice',
        content: 'hello',
        timestamp: 12345
      })
    })

    it('only returns messages for the requested channel', () => {
      testDb
        .prepare(
          'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
        .run('ch-1', 'user', 'Alice', 'ch1 msg', 1000)
      testDb
        .prepare(
          'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        )
        .run('ch-2', 'user', 'Bob', 'ch2 msg', 2000)

      const result = loadHistory('ch-1', 10)
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('ch1 msg')
    })
  })

  describe('clearHistory', () => {
    it('removes all messages for a channel', () => {
      saveMessage('ch-1', 'user', 'Alice', 'hello')
      saveMessage('ch-1', 'assistant', 'Roka', 'hi~')

      clearHistory('ch-1')

      const result = loadHistory('ch-1', 10)
      expect(result).toEqual([])
    })

    it('does not affect other channels', () => {
      saveMessage('ch-1', 'user', 'Alice', 'ch1 msg')
      saveMessage('ch-2', 'user', 'Bob', 'ch2 msg')

      clearHistory('ch-1')

      expect(loadHistory('ch-1', 10)).toEqual([])
      expect(loadHistory('ch-2', 10)).toHaveLength(1)
    })

    it('handles clearing an already empty channel', () => {
      expect(() => clearHistory('nonexistent')).not.toThrow()
    })
  })

  describe('pruneOldHistory', () => {
    const ONE_DAY = 24 * 60 * 60 * 1000
    const insertStmt =
      'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'

    it('deletes messages older than the threshold', () => {
      const eightDaysAgo = Date.now() - 8 * ONE_DAY
      testDb.prepare(insertStmt).run('ch-1', 'user', 'Alice', 'old msg', eightDaysAgo)

      const deleted = pruneOldHistory(7)

      expect(deleted).toBe(1)
      expect(loadHistory('ch-1', 10)).toEqual([])
    })

    it('keeps recent messages', () => {
      const twoDaysAgo = Date.now() - 2 * ONE_DAY
      testDb.prepare(insertStmt).run('ch-1', 'user', 'Alice', 'recent msg', twoDaysAgo)

      const deleted = pruneOldHistory(7)

      expect(deleted).toBe(0)
      expect(loadHistory('ch-1', 10)).toHaveLength(1)
    })

    it('returns correct count of deleted rows', () => {
      const tenDaysAgo = Date.now() - 10 * ONE_DAY
      const oneDayAgo = Date.now() - 1 * ONE_DAY
      testDb.prepare(insertStmt).run('ch-1', 'user', 'Alice', 'old 1', tenDaysAgo)
      testDb.prepare(insertStmt).run('ch-1', 'user', 'Alice', 'old 2', tenDaysAgo + 1000)
      testDb.prepare(insertStmt).run('ch-2', 'user', 'Bob', 'old 3', tenDaysAgo + 2000)
      testDb.prepare(insertStmt).run('ch-1', 'user', 'Alice', 'recent', oneDayAgo)

      const deleted = pruneOldHistory(7)

      expect(deleted).toBe(3)
      const remaining = testDb.prepare('SELECT * FROM session_history').all()
      expect(remaining).toHaveLength(1)
    })
  })
})
