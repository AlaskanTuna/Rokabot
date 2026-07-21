import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    memory: {
      bufferSize: 20,
      extractionInterval: 20,
      extractionGapMs: 10_000,
      maxFactsPerUser: 10,
      factRetentionDays: 90,
      channelMonitorTtlMs: 86_400_000
    }
  }
}))

// Use an in-memory SQLite database for tests
let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import { countFacts, deleteFact, getAllFactsForPrompt, getFacts, saveFact } from '../userMemory.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_memory (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      fact_key TEXT NOT NULL,
      fact_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id, fact_key)
    );
  `)
  return db
}

describe('userMemory', () => {
  const G = 'test-guild'

  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
  })

  describe('saveFact', () => {
    it('inserts a new fact', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')

      const rows = testDb.prepare('SELECT * FROM user_memory WHERE user_id = ?').all('Alice') as Array<{
        user_id: string
        fact_key: string
        fact_value: string
        updated_at: number
      }>
      expect(rows).toHaveLength(1)
      expect(rows[0].fact_key).toBe('favorite_anime')
      expect(rows[0].fact_value).toBe('Frieren')
      expect(rows[0].updated_at).toBeGreaterThan(0)
    })

    it('upserts an existing fact (same key updates value)', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')
      saveFact(G, 'Alice', 'favorite_anime', 'Steins;Gate')

      const rows = testDb.prepare('SELECT * FROM user_memory WHERE user_id = ?').all('Alice') as Array<{
        fact_key: string
        fact_value: string
      }>
      expect(rows).toHaveLength(1)
      expect(rows[0].fact_value).toBe('Steins;Gate')
    })

    it('stores multiple facts for the same user', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')
      saveFact(G, 'Alice', 'nickname', 'Ali')
      saveFact(G, 'Alice', 'hobby', 'cooking')

      expect(countFacts(G, 'Alice')).toBe(3)
    })

    it('keeps facts from different users separate', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')
      saveFact(G, 'Bob', 'favorite_anime', 'One Piece')

      expect(countFacts(G, 'Alice')).toBe(1)
      expect(countFacts(G, 'Bob')).toBe(1)
    })
  })

  describe('getFacts', () => {
    it('returns empty array for unknown user', () => {
      const facts = getFacts(G, 'nobody')
      expect(facts).toEqual([])
    })

    it('returns all facts for a user', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')
      saveFact(G, 'Alice', 'nickname', 'Ali')

      const facts = getFacts(G, 'Alice')
      expect(facts).toHaveLength(2)
      expect(facts.map((f) => f.key)).toContain('favorite_anime')
      expect(facts.map((f) => f.key)).toContain('nickname')
    })

    it('returns facts ordered by most recently updated first', () => {
      // Insert with explicit timestamps to control ordering
      testDb
        .prepare('INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(G, 'Alice', 'oldest', 'val1', 1000)
      testDb
        .prepare('INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(G, 'Alice', 'newest', 'val2', 3000)
      testDb
        .prepare('INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(G, 'Alice', 'middle', 'val3', 2000)

      const facts = getFacts(G, 'Alice')
      expect(facts[0].key).toBe('newest')
      expect(facts[1].key).toBe('middle')
      expect(facts[2].key).toBe('oldest')
    })
  })

  describe('deleteFact', () => {
    it('removes a specific fact', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')
      saveFact(G, 'Alice', 'nickname', 'Ali')

      deleteFact(G, 'Alice', 'favorite_anime')

      const facts = getFacts(G, 'Alice')
      expect(facts).toHaveLength(1)
      expect(facts[0].key).toBe('nickname')
    })

    it('does nothing when deleting a non-existent fact', () => {
      expect(() => deleteFact(G, 'Alice', 'nonexistent')).not.toThrow()
    })

    it('does not affect other users', () => {
      saveFact(G, 'Alice', 'hobby', 'cooking')
      saveFact(G, 'Bob', 'hobby', 'gaming')

      deleteFact(G, 'Alice', 'hobby')

      expect(getFacts(G, 'Alice')).toHaveLength(0)
      expect(getFacts(G, 'Bob')).toHaveLength(1)
    })
  })

  describe('getAllFactsForPrompt', () => {
    it('returns empty string for unknown user', () => {
      expect(getAllFactsForPrompt(G, 'nobody')).toBe('')
    })

    it('returns formatted string of facts', () => {
      saveFact(G, 'Alice', 'favorite_anime', 'Frieren')
      saveFact(G, 'Alice', 'nickname', 'Ali')

      const result = getAllFactsForPrompt(G, 'Alice')
      expect(result).toContain('favorite_anime: Frieren')
      expect(result).toContain('nickname: Ali')
      expect(result).toContain(', ')
    })

    it('returns single fact without comma separator', () => {
      saveFact(G, 'Alice', 'hobby', 'cooking')

      const result = getAllFactsForPrompt(G, 'Alice')
      expect(result).toBe('hobby: cooking')
      expect(result).not.toContain(', ')
    })
  })

  describe('countFacts', () => {
    it('returns 0 for unknown user', () => {
      expect(countFacts(G, 'nobody')).toBe(0)
    })

    it('returns correct count', () => {
      saveFact(G, 'Alice', 'a', '1')
      saveFact(G, 'Alice', 'b', '2')
      saveFact(G, 'Alice', 'c', '3')

      expect(countFacts(G, 'Alice')).toBe(3)
    })
  })

  describe('10-fact cap', () => {
    it('evicts the oldest fact when saving the 11th', () => {
      // Insert 10 facts with explicit timestamps
      for (let i = 1; i <= 10; i++) {
        testDb
          .prepare(
            'INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(G, 'Alice', `fact_${i}`, `value_${i}`, i * 1000)
      }

      expect(countFacts(G, 'Alice')).toBe(10)

      // Save an 11th fact — should evict fact_1 (oldest by updated_at)
      saveFact(G, 'Alice', 'fact_11', 'value_11')

      expect(countFacts(G, 'Alice')).toBe(10)

      // fact_1 should be gone
      const facts = getFacts(G, 'Alice')
      const keys = facts.map((f) => f.key)
      expect(keys).not.toContain('fact_1')
      expect(keys).toContain('fact_11')
      expect(keys).toContain('fact_2')
    })

    it('does not evict when updating an existing fact at the cap', () => {
      for (let i = 1; i <= 10; i++) {
        testDb
          .prepare(
            'INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(G, 'Alice', `fact_${i}`, `value_${i}`, i * 1000)
      }

      // Update an existing fact — should not evict anything
      saveFact(G, 'Alice', 'fact_5', 'updated_value')

      expect(countFacts(G, 'Alice')).toBe(10)

      const facts = getFacts(G, 'Alice')
      const keys = facts.map((f) => f.key)
      expect(keys).toContain('fact_1')
      expect(keys).toContain('fact_5')

      const fact5 = facts.find((f) => f.key === 'fact_5')
      expect(fact5?.value).toBe('updated_value')
    })

    it('evicts correctly across multiple insertions beyond the cap', () => {
      for (let i = 1; i <= 10; i++) {
        testDb
          .prepare(
            'INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .run(G, 'Alice', `fact_${i}`, `value_${i}`, i * 1000)
      }

      // Save 2 more facts — should evict fact_1 and fact_2
      saveFact(G, 'Alice', 'fact_11', 'value_11')
      saveFact(G, 'Alice', 'fact_12', 'value_12')

      expect(countFacts(G, 'Alice')).toBe(10)

      const facts = getFacts(G, 'Alice')
      const keys = facts.map((f) => f.key)
      expect(keys).not.toContain('fact_1')
      expect(keys).not.toContain('fact_2')
      expect(keys).toContain('fact_11')
      expect(keys).toContain('fact_12')
    })
  })
})
