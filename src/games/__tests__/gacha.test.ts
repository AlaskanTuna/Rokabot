import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    timezone: 'UTC',
    games: { hangmanLives: 6, hangmanTimeoutMs: 60_000, shiritoriTimeoutMs: 60_000, shinyChance: 0.01 }
  }
}))

let testDb: Database.Database

vi.mock('../../storage/database.js', () => ({
  getDb: () => testDb
}))

import { handleHatch } from '../../discord/events/games/gacha.js'
import {
  generateBuddy,
  getBuddy,
  getBuddyCollection,
  getBuddyCount,
  getTodayDate,
  getTopBuddies,
  hasHatchedToday,
  hashString,
  hatchDailyBuddy,
  markDailyHatch,
  mulberry32,
  saveBuddy
} from '../buddy.js'
import { type BuddyRarity, RARITY_STAT_RANGE, SPECIES, STAT_NAMES } from '../data/buddySpecies.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS buddy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      species TEXT NOT NULL,
      rarity TEXT NOT NULL,
      shiny INTEGER NOT NULL DEFAULT 0,
      eyes TEXT NOT NULL,
      hat TEXT NOT NULL,
      name TEXT,
      personality TEXT,
      stats_json TEXT NOT NULL,
      hatched_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_buddy_user ON buddy (user_id, hatched_at);

    CREATE TABLE IF NOT EXISTS gacha_daily (
      user_id TEXT NOT NULL,
      last_draw_date TEXT NOT NULL,
      streak INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id)
    );
  `)
  return db
}

describe('buddy pet system', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
    vi.useRealTimers()
  })

  describe('mulberry32 PRNG', () => {
    it('produces deterministic output for the same seed', () => {
      const rng1 = mulberry32(12345)
      const rng2 = mulberry32(12345)

      const seq1 = Array.from({ length: 10 }, () => rng1())
      const seq2 = Array.from({ length: 10 }, () => rng2())

      expect(seq1).toEqual(seq2)
    })

    it('produces values between 0 and 1', () => {
      const rng = mulberry32(42)
      for (let i = 0; i < 1000; i++) {
        const val = rng()
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThan(1)
      }
    })

    it('produces different sequences for different seeds', () => {
      const rng1 = mulberry32(111)
      const rng2 = mulberry32(222)

      const seq1 = Array.from({ length: 5 }, () => rng1())
      const seq2 = Array.from({ length: 5 }, () => rng2())

      expect(seq1).not.toEqual(seq2)
    })
  })

  describe('hashString', () => {
    it('returns a consistent hash for the same input', () => {
      expect(hashString('test-user-123')).toBe(hashString('test-user-123'))
    })

    it('returns different hashes for different inputs', () => {
      expect(hashString('user-a')).not.toBe(hashString('user-b'))
    })
  })

  describe('generateBuddy', () => {
    it('returns a valid buddy for a given userId and dateSeed', () => {
      const buddy = generateBuddy('user-123', '2026-04-01')

      expect(buddy.userId).toBe('user-123')
      expect(buddy.species).toBeTruthy()
      expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(buddy.rarity)
      expect(typeof buddy.shiny).toBe('boolean')
      expect(buddy.eyes).toBeTruthy()
      expect(buddy.hat).toBeTruthy()
      expect(buddy.name).toBeTruthy()
      expect(buddy.personality).toBeTruthy()
      expect(Object.keys(buddy.stats)).toHaveLength(5)
      expect(buddy.hatchedAt).toBeGreaterThan(0)
    })

    it('generates the same buddy for the same userId and dateSeed', () => {
      const buddy1 = generateBuddy('deterministic-user', '2026-04-01')
      const buddy2 = generateBuddy('deterministic-user', '2026-04-01')

      expect(buddy1.species).toBe(buddy2.species)
      expect(buddy1.rarity).toBe(buddy2.rarity)
      expect(buddy1.shiny).toBe(buddy2.shiny)
      expect(buddy1.eyes).toBe(buddy2.eyes)
      expect(buddy1.hat).toBe(buddy2.hat)
      expect(buddy1.name).toBe(buddy2.name)
      expect(buddy1.stats).toEqual(buddy2.stats)
    })

    it('generates different buddies for different dateSeed values', () => {
      const buddy1 = generateBuddy('user-aaa', '2026-04-01')
      const buddy2 = generateBuddy('user-aaa', '2026-04-02')

      // At least one attribute should differ (statistically near-certain)
      const same =
        buddy1.species === buddy2.species &&
        buddy1.rarity === buddy2.rarity &&
        buddy1.eyes === buddy2.eyes &&
        buddy1.hat === buddy2.hat &&
        buddy1.name === buddy2.name
      expect(same).toBe(false)
    })

    it('generates different buddies for different userIds on the same day', () => {
      const buddy1 = generateBuddy('user-aaa', '2026-04-01')
      const buddy2 = generateBuddy('user-zzz', '2026-04-01')

      const same =
        buddy1.species === buddy2.species &&
        buddy1.rarity === buddy2.rarity &&
        buddy1.eyes === buddy2.eyes &&
        buddy1.hat === buddy2.hat &&
        buddy1.name === buddy2.name
      expect(same).toBe(false)
    })

    it('assigns a species that matches the rolled rarity', () => {
      for (let i = 0; i < 50; i++) {
        const buddy = generateBuddy(`rarity-check-${i}`, '2026-04-01')
        const speciesInfo = SPECIES.find((s) => s.id === buddy.species)
        expect(speciesInfo).toBeDefined()
        expect(speciesInfo!.rarity).toBe(buddy.rarity)
      }
    })

    it('generates stats within rarity floor/ceiling bounds', () => {
      for (let i = 0; i < 50; i++) {
        const buddy = generateBuddy(`stat-check-${i}`, '2026-04-01')
        const range = RARITY_STAT_RANGE[buddy.rarity]
        for (const { key } of STAT_NAMES) {
          const val = buddy.stats[key]
          expect(val).toBeGreaterThanOrEqual(range.floor)
          expect(val).toBeLessThanOrEqual(range.max)
        }
      }
    })

    it('produces all 5 stats', () => {
      const buddy = generateBuddy('stat-keys', '2026-04-01')
      const expectedKeys = ['charm', 'wit', 'dere', 'drama', 'luck']
      for (const key of expectedKeys) {
        expect(buddy.stats[key]).toBeDefined()
        expect(typeof buddy.stats[key]).toBe('number')
      }
    })
  })

  describe('shiny probability', () => {
    it('approximately 1% of buddies are shiny (statistical)', () => {
      let shinyCount = 0
      const total = 10000
      for (let i = 0; i < total; i++) {
        const buddy = generateBuddy(`shiny-test-${i}`, '2026-04-01')
        if (buddy.shiny) shinyCount++
      }
      // Expect between 0.2% and 3% (generous bounds for randomness)
      const rate = shinyCount / total
      expect(rate).toBeGreaterThan(0.002)
      expect(rate).toBeLessThan(0.03)
    })
  })

  describe('saveBuddy / getBuddy', () => {
    it('round-trips a buddy correctly', () => {
      const buddy = generateBuddy('roundtrip-user', '2026-04-01')
      saveBuddy(buddy)

      const loaded = getBuddy('roundtrip-user')
      expect(loaded).not.toBeNull()
      expect(loaded!.userId).toBe(buddy.userId)
      expect(loaded!.species).toBe(buddy.species)
      expect(loaded!.rarity).toBe(buddy.rarity)
      expect(loaded!.shiny).toBe(buddy.shiny)
      expect(loaded!.eyes).toBe(buddy.eyes)
      expect(loaded!.hat).toBe(buddy.hat)
      expect(loaded!.name).toBe(buddy.name)
      expect(loaded!.personality).toBe(buddy.personality)
      expect(loaded!.stats).toEqual(buddy.stats)
      expect(loaded!.hatchedAt).toBe(buddy.hatchedAt)
    })

    it('returns null for non-existent user', () => {
      const loaded = getBuddy('nonexistent')
      expect(loaded).toBeNull()
    })

    it('returns the latest buddy when multiple exist', () => {
      const buddy1 = generateBuddy('multi-user', '2026-04-01')
      buddy1.hatchedAt = 1000
      saveBuddy(buddy1)

      const buddy2 = generateBuddy('multi-user', '2026-04-02')
      buddy2.hatchedAt = 2000
      saveBuddy(buddy2)

      const loaded = getBuddy('multi-user')
      expect(loaded).not.toBeNull()
      expect(loaded!.hatchedAt).toBe(2000)
    })

    it('saveBuddy returns the inserted row id', () => {
      const buddy = generateBuddy('id-test', '2026-04-01')
      const id = saveBuddy(buddy)
      expect(id).toBeGreaterThan(0)

      const buddy2 = generateBuddy('id-test', '2026-04-02')
      const id2 = saveBuddy(buddy2)
      expect(id2).toBeGreaterThan(id)
    })
  })

  describe('getBuddyCollection', () => {
    it('returns empty array when no buddies exist', () => {
      const collection = getBuddyCollection('nobody')
      expect(collection).toEqual([])
    })

    it('returns all buddies for a user, most recent first', () => {
      const buddy1 = generateBuddy('collector', '2026-04-01')
      buddy1.hatchedAt = 1000
      saveBuddy(buddy1)

      const buddy2 = generateBuddy('collector', '2026-04-02')
      buddy2.hatchedAt = 2000
      saveBuddy(buddy2)

      const buddy3 = generateBuddy('collector', '2026-04-03')
      buddy3.hatchedAt = 3000
      saveBuddy(buddy3)

      const collection = getBuddyCollection('collector')
      expect(collection).toHaveLength(3)
      expect(collection[0].hatchedAt).toBe(3000)
      expect(collection[1].hatchedAt).toBe(2000)
      expect(collection[2].hatchedAt).toBe(1000)
    })

    it('does not return other users buddies', () => {
      const buddyA = generateBuddy('user-a', '2026-04-01')
      saveBuddy(buddyA)

      const buddyB = generateBuddy('user-b', '2026-04-01')
      saveBuddy(buddyB)

      const collectionA = getBuddyCollection('user-a')
      expect(collectionA).toHaveLength(1)
      expect(collectionA[0].userId).toBe('user-a')
    })
  })

  describe('getBuddyCount', () => {
    it('returns 0 when no buddies exist', () => {
      expect(getBuddyCount('nobody')).toBe(0)
    })

    it('returns correct count for multiple buddies', () => {
      for (let i = 0; i < 5; i++) {
        const buddy = generateBuddy('counter', `2026-04-0${i + 1}`)
        saveBuddy(buddy)
      }
      expect(getBuddyCount('counter')).toBe(5)
    })
  })

  describe('hasHatchedToday / markDailyHatch', () => {
    it('returns false when user has not hatched', () => {
      expect(hasHatchedToday('fresh-user')).toBe(false)
    })

    it('returns true after marking daily hatch', () => {
      markDailyHatch('daily-user')
      expect(hasHatchedToday('daily-user')).toBe(true)
    })

    it('returns false if last hatch was a different day', () => {
      // Manually insert a past date
      testDb
        .prepare('INSERT OR REPLACE INTO gacha_daily (user_id, last_draw_date, streak) VALUES (?, ?, ?)')
        .run('old-user', '2020-01-01', 1)
      expect(hasHatchedToday('old-user')).toBe(false)
    })
  })

  describe('hatchDailyBuddy', () => {
    it('hatches and marks the daily draw together', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))

      const result = hatchDailyBuddy('normal-hatch-user')

      expect(result).toMatchObject({ alreadyHatched: false, count: 1, streak: 1, adopted: false })
      expect(hasHatchedToday('normal-hatch-user')).toBe(true)
      expect(getBuddyCount('normal-hatch-user')).toBe(1)
    })

    it('adopts a deterministic orphan row and returns the normal hatch reply', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
      const userId = 'orphan-hatch-user'
      saveBuddy(generateBuddy(userId))

      const reply = handleHatch({ user: { id: userId } } as never)

      expect(JSON.stringify(reply)).toContain('Companion Hatched!')
      expect(hasHatchedToday(userId)).toBe(true)
      expect(getBuddyCount(userId)).toBe(1)
    })

    it('adopts an orphan after migrating a real historical buddy table', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
      testDb.close()
      testDb = new Database(':memory:')
      testDb.exec(`
        CREATE TABLE session_history (
          channel_id TEXT NOT NULL,
          role TEXT NOT NULL,
          display_name TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          user_id TEXT DEFAULT NULL,
          username TEXT DEFAULT NULL
        );
        CREATE TABLE user_memory (
          guild_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          fact_key TEXT NOT NULL,
          fact_value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (guild_id, user_id, fact_key)
        );
        CREATE TABLE gacha_daily (
          user_id TEXT NOT NULL,
          last_draw_date TEXT NOT NULL,
          streak INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id)
        );
        CREATE TABLE buddy (
          user_id TEXT PRIMARY KEY,
          species TEXT NOT NULL,
          rarity TEXT NOT NULL,
          shiny INTEGER NOT NULL DEFAULT 0,
          eyes TEXT NOT NULL,
          hat TEXT NOT NULL,
          name TEXT,
          personality TEXT,
          stats_json TEXT NOT NULL,
          hatched_at INTEGER NOT NULL
        );
      `)
      const userId = 'historical-orphan-user'
      saveBuddy(generateBuddy(userId))

      const { runMigrations } =
        await vi.importActual<typeof import('../../storage/database.js')>('../../storage/database.js')
      runMigrations(testDb)

      expect(hatchDailyBuddy(userId)).toMatchObject({ alreadyHatched: false, adopted: true, count: 1 })
      expect(hasHatchedToday(userId)).toBe(true)
    })

    it('does not adopt an orphan whose personality differs from today’s deterministic buddy', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
      const userId = 'different-personality-orphan'
      saveBuddy(generateBuddy(userId))
      testDb.prepare('UPDATE buddy SET personality = ? WHERE user_id = ?').run('A different personality', userId)

      const result = hatchDailyBuddy(userId)

      expect(result).toMatchObject({ alreadyHatched: false, adopted: false, count: 2 })
    })

    it('adds a second buddy on the next calendar day', () => {
      vi.useFakeTimers()
      const userId = 'daily-collection-user'
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
      hatchDailyBuddy(userId)

      vi.setSystemTime(new Date('2026-04-02T12:00:00Z'))
      const result = hatchDailyBuddy(userId)

      expect(result).toMatchObject({ alreadyHatched: false, count: 2, adopted: false })
      expect(getBuddyCount(userId)).toBe(2)
    })

    it('rolls back the buddy insert when marking the daily hatch fails', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))
      testDb.exec('DROP TABLE gacha_daily')
      testDb.exec(`
        CREATE TABLE gacha_daily (
          user_id TEXT NOT NULL,
          last_draw_date TEXT NOT NULL,
          streak INTEGER NOT NULL CHECK (streak < 0),
          PRIMARY KEY (user_id)
        )
      `)

      expect(() => hatchDailyBuddy('failed-daily-hatch-user')).toThrow()
      expect(getBuddyCount('failed-daily-hatch-user')).toBe(0)
      expect(testDb.prepare('SELECT COUNT(*) AS count FROM gacha_daily').get()).toEqual({ count: 0 })
    })
  })

  describe('getTodayDate', () => {
    it('returns a string in YYYY-MM-DD format', () => {
      const date = getTodayDate()
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('getTopBuddies', () => {
    it('returns empty array when no buddies exist', () => {
      const top = getTopBuddies(10)
      expect(top).toEqual([])
    })

    it('returns best buddy per user sorted by total stats descending', () => {
      // User 1: two buddies, one with high stats
      const buddy1a = generateBuddy('leader-1', '2026-04-01')
      buddy1a.stats = { charm: 10, wit: 10, dere: 10, drama: 10, luck: 10 }
      saveBuddy(buddy1a)

      const buddy1b = generateBuddy('leader-1', '2026-04-02')
      buddy1b.stats = { charm: 1, wit: 1, dere: 1, drama: 1, luck: 1 }
      saveBuddy(buddy1b)

      // User 2: one buddy with low stats
      const buddy2 = generateBuddy('leader-2', '2026-04-01')
      buddy2.stats = { charm: 3, wit: 3, dere: 3, drama: 3, luck: 3 }
      saveBuddy(buddy2)

      const top = getTopBuddies(10)
      expect(top).toHaveLength(2)
      // User 1's best buddy (50 total) should be first
      expect(top[0].userId).toBe('leader-1')
      const topTotal = Object.values(top[0].stats).reduce((s, v) => s + v, 0)
      expect(topTotal).toBe(50)
      expect(top[1].userId).toBe('leader-2')
    })

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const buddy = generateBuddy(`limit-test-${i}`, '2026-04-01')
        saveBuddy(buddy)
      }
      const top = getTopBuddies(3)
      expect(top).toHaveLength(3)
    })
  })

  describe('species catalog', () => {
    it('has exactly 18 species', () => {
      expect(SPECIES).toHaveLength(18)
    })

    it('all species have unique ids', () => {
      const ids = SPECIES.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('has the expected distribution across rarity tiers', () => {
      const counts: Record<BuddyRarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
      for (const s of SPECIES) counts[s.rarity]++

      expect(counts.common).toBe(7)
      expect(counts.uncommon).toBe(4)
      expect(counts.rare).toBe(3)
      expect(counts.epic).toBe(2)
      expect(counts.legendary).toBe(2)
    })

    it('all species have required fields', () => {
      for (const s of SPECIES) {
        expect(s.id).toBeTruthy()
        expect(s.name).toBeTruthy()
        expect(s.emoji).toBeTruthy()
        expect(['common', 'uncommon', 'rare', 'epic', 'legendary']).toContain(s.rarity)
        expect(s.description).toBeTruthy()
      }
    })
  })
})
