import { copyFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  embedEpisodeText: vi.fn(async () => {
    throw new Error('offline')
  }),
  embedPendingFacts: vi.fn(),
  proposePredicates: vi.fn(),
  jevConfirm: vi.fn()
}))

vi.mock('../../agent/memory/episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))
vi.mock('../../agent/memory/factEmbeddings.js', () => ({ embedPendingFacts: mocks.embedPendingFacts }))
vi.mock('../../agent/memory/reclassifyModels.js', () => ({
  proposePredicates: mocks.proposePredicates,
  jevConfirm: mocks.jevConfirm
}))

import { pruneEpisodesAndReembed } from '../../agent/memory/episodeMaintenance.js'
import { buildEpisodeRecallBlock } from '../../agent/memory/episodeRetriever.js'
import { buildMediaRecallBlock } from '../../agent/memory/mediaRecall.js'
import { assertClaim, pruneStaleClaims } from '../../agent/memory/memoryClaims.js'
import { reclassifyClaims } from '../../agent/memory/reclassify.js'
import { retrieveForTurn, retrieveGuildFacts } from '../../agent/memory/retriever.js'
import { config } from '../../config.js'
import { closeDb, getDb, runMigrations } from '../database.js'
import { migrateMemoryItems } from '../memoryItemBackfill.js'
import { fillMemoryItemEmbeddingHashes, sweepMemoryItemIntegrity } from '../memoryItemIntegrity.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'
import {
  LEGACY_MEMORY_TABLES,
  MEMORY_LEGACY_DROP_MARKER,
  dropLegacyMemoryTables,
  isLegacyMemoryDropped
} from '../memoryLegacyDrop.js'

const memoryStoreConfig = config.memory as { store: 'legacy' | 'dual' | 'item' }
const previousStore = memoryStoreConfig.store
let tempPaths: string[] = []

function tempPath(name: string): string {
  const path = join(tmpdir(), `rokabot-legacy-drop-${process.pid}-${tempPaths.length}-${name}`)
  tempPaths.push(path, `${path}-wal`, `${path}-shm`)
  return path
}

/** Minimal legacy fixture: one user fact with evidence, one episode, one shared digest. */
function seedLegacyFixture(): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memory_claim (
      guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status,
      confidence, salience, first_seen_at, last_seen_at, period
    ) VALUES ('guild-1', 'user', 'user-1', 'hobby', 'painting', 'explicit', 'active', 0.7, 0.8, 1000, 2000, 'current')
  `).run()
  db.prepare('INSERT INTO memory_evidence (claim_id, channel_id, source_kind, observed_at) VALUES (1, ?, ?, ?)').run(
    'channel-1',
    'explicit',
    1500
  )
  db.prepare(`
    INSERT INTO memory_episode (id, guild_id, channel_id, started_at, ended_at, summary, created_at)
    VALUES (7, 'guild-1', 'channel-1', 1000, 2000, 'First summary.', 3000)
  `).run()
  db.prepare(`
    INSERT INTO media_digest (id, guild_id, content_key, kind, label, summary, digest_json, created_at)
    VALUES (9, 'guild-1', 'key-1', 'video', 'Clip', 'A clip.', '{}', 1000)
  `).run()
  db.prepare(`
    INSERT INTO media_occurrence (digest_id, guild_id, channel_id, message_id, shared_by_user_id, origin, observed_at)
    VALUES (9, 'guild-1', 'channel-1', 'msg-1', 'user-1', 'upload', 2000)
  `).run()
}

function ftsTableNames(database = getDb()): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'memory\\_claim\\_fts%' ESCAPE '\\'")
      .all() as Array<{ name: string }>
  ).map(({ name }) => name)
}

function openFileDb(): void {
  process.env.ROKABOT_DB_PATH = tempPath('rokabot.db')
  getDb()
}

beforeEach(() => {
  memoryStoreConfig.store = previousStore
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  memoryStoreConfig.store = previousStore
  for (const path of tempPaths) rmSync(path, { force: true })
  tempPaths = []
})

describe('memory legacy drop refusals', () => {
  it('refuses unless memory.store is item', () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())

    for (const store of ['legacy', 'dual'] as const) {
      expect(() => dropLegacyMemoryTables(getDb(), { store, backupPath: undefined })).toThrow(
        'Memory item legacy drop requires memory.store item'
      )
    }
  })

  it('refuses while projection triggers remain', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
    const backup = tempPath('backup.db')
    await getDb().backup(backup)

    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })).toThrow(
      'Memory item legacy drop requires projection triggers to be dropped'
    )
  })

  it('refuses without an existing backup', () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())

    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: undefined })).toThrow(
      'Memory item legacy drop requires --backup <path>'
    )
    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: tempPath('missing.db') })).toThrow(
      'Memory item legacy drop requires --backup <path>'
    )
  })

  it('refuses a backup that is not SQLite or lacks a legacy table and leaves live tables in place', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())

    const notSqlite = tempPath('not-sqlite.db')
    writeFileSync(notSqlite, 'not a database')
    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: notSqlite })).toThrow(
      'requires a readable SQLite backup'
    )

    const bare = tempPath('bare.db')
    new Database(bare).close()
    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: bare })).toThrow(
      'backup is missing legacy tables'
    )

    const partial = tempPath('partial.db')
    await getDb().backup(partial)
    const partialDb = new Database(partial)
    partialDb.exec('DROP TABLE media_occurrence')
    partialDb.close()
    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: partial })).toThrow(
      /backup is missing legacy tables: .*media_occurrence/
    )
    expect(isLegacyMemoryDropped(getDb())).toBe(false)
    for (const table of LEGACY_MEMORY_TABLES) {
      expect(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeDefined()
    }
  })

  it('refuses a backup with a row-count mismatch and leaves live tables in place', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('mismatch.db')
    await getDb().backup(backup)

    getDb()
      .prepare(`
        INSERT INTO memory_claim (
          guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status,
          confidence, salience, first_seen_at, last_seen_at, period
        ) VALUES ('guild-1', 'user', 'user-1', 'hobby', 'chess', 'explicit', 'active', 0.7, 0.8, 1000, 2000, 'current')
      `)
      .run()

    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })).toThrow(
      /row count mismatch.*memory_claim/
    )
    expect(isLegacyMemoryDropped(getDb())).toBe(false)
    expect((getDb().prepare('SELECT COUNT(*) AS count FROM memory_claim').get() as { count: number }).count).toBe(2)
    for (const table of LEGACY_MEMORY_TABLES) {
      expect(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeDefined()
    }
  })

  it('refuses a stale backup older than the newest legacy write and leaves live tables in place', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    const recentWriteAt = Date.now()
    getDb().prepare('UPDATE memory_claim SET last_seen_at = ? WHERE id = 1').run(recentWriteAt)
    migrateMemoryItems(getDb())
    const backup = tempPath('stale-write.db')
    await getDb().backup(backup)
    const olderTime = new Date(recentWriteAt - 60_000)
    utimesSync(backup, olderTime, olderTime)

    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })).toThrow(/stale.*memory_claim/)
    expect(isLegacyMemoryDropped(getDb())).toBe(false)
    for (const table of LEGACY_MEMORY_TABLES) {
      expect(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeDefined()
    }
  })

  it('refuses a backup older than 24 hours when no legacy writes are detectable, and accepts a fresh one', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    migrateMemoryItems(getDb())
    const backup = tempPath('stale-empty.db')
    await getDb().backup(backup)
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000)
    utimesSync(backup, oldTime, oldTime)

    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })).toThrow(/stale.*24 hours/)
    expect(isLegacyMemoryDropped(getDb())).toBe(false)
    for (const table of LEGACY_MEMORY_TABLES) {
      expect(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBeDefined()
    }

    const freshTime = new Date()
    utimesSync(backup, freshTime, freshTime)
    const report = dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })
    expect(report.dropped_tables).toEqual([...LEGACY_MEMORY_TABLES])
    expect(isLegacyMemoryDropped(getDb())).toBe(true)
  })

  it('refuses a backup path that is the live database', async () => {
    openFileDb()
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const live = process.env.ROKABOT_DB_PATH as string

    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: live })).toThrow(
      'backup must be a separate file'
    )
    expect(isLegacyMemoryDropped(getDb())).toBe(false)
  })

  it('refuses a second drop', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('backup.db')
    await getDb().backup(backup)

    dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })
    expect(() => dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })).toThrow('were already dropped')
  })
})

describe('memory legacy drop', () => {
  it('drops the legacy tables in one transaction and records the marker', async () => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('backup.db')
    await getDb().backup(backup)
    const itemsBefore = (getDb().prepare('SELECT COUNT(*) AS count FROM memory_item').get() as { count: number }).count

    const report = dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })

    expect(report.dropped_tables).toEqual([
      'memory_claim',
      'memory_evidence',
      'memory_claim_fts',
      'memory_episode',
      'media_digest',
      'media_occurrence'
    ])
    expect(report.row_counts).toEqual({
      memory_claim: 1,
      memory_evidence: 1,
      memory_claim_fts: 1,
      memory_episode: 1,
      media_digest: 1,
      media_occurrence: 1
    })
    expect(report.marker).toBe(MEMORY_LEGACY_DROP_MARKER)
    for (const table of report.dropped_tables) {
      expect(getDb().prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBe(
        undefined
      )
    }
    expect(ftsTableNames()).toEqual([])
    expect(isLegacyMemoryDropped(getDb())).toBe(true)
    expect((getDb().prepare('SELECT COUNT(*) AS count FROM memory_item').get() as { count: number }).count).toBe(
      itemsBefore
    )
    expect(
      (getDb().prepare('SELECT COUNT(*) AS count FROM memory_item_evidence').get() as { count: number }).count
    ).toBe(1)
  })

  it('startup never recreates the legacy tables and only item is accepted', async () => {
    openFileDb()
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('backup.db')
    await getDb().backup(backup)
    dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })
    closeDb()

    const restarted = getDb()
    runMigrations(restarted)

    for (const table of [
      'memory_claim',
      'memory_evidence',
      'memory_claim_fts',
      'memory_episode',
      'media_digest',
      'media_occurrence'
    ]) {
      expect(restarted.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).toBe(
        undefined
      )
    }
    expect(isLegacyMemoryDropped(restarted)).toBe(true)
    expect(() => configureMemoryItemProjectionTriggers(restarted, 'item')).not.toThrow()
    expect(() => configureMemoryItemProjectionTriggers(restarted, 'legacy')).toThrow(
      'memory.store must be item once the legacy memory tables are dropped'
    )
    expect(() => configureMemoryItemProjectionTriggers(restarted, 'dual')).toThrow(
      'memory.store must be item once the legacy memory tables are dropped'
    )
    expect(() => migrateMemoryItems(restarted)).toThrow('restore the backup')
  })

  it('keeps new item IDs above every migrated legacy ID after the drop', async () => {
    openFileDb()
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('backup.db')
    await getDb().backup(backup)
    dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })
    closeDb()

    memoryStoreConfig.store = 'item'
    const database = getDb()
    configureMemoryItemProjectionTriggers(database, 'item')
    const written = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'gardening',
      sourceKind: 'explicit',
      channelId: 'channel-1'
    })

    const { maximum } = database.prepare('SELECT MAX(legacy_id) AS maximum FROM memory_item').get() as {
      maximum: number
    }
    expect(maximum).toBe(9)
    expect(written.id).toBeGreaterThan(maximum)
  })
})

describe('dropped legacy schema lifecycle', () => {
  it('starts up, serves one turn, writes one extraction and runs daily maintenance', async () => {
    openFileDb()
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('backup.db')
    await getDb().backup(backup)
    dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })
    closeDb()

    // Startup on the dropped database.
    memoryStoreConfig.store = 'item'
    const database = getDb()
    runMigrations(database)
    configureMemoryItemProjectionTriggers(database, memoryStoreConfig.store)

    // One turn across the four recall blocks.
    const scope = { guildId: 'guild-1', channelId: 'channel-1' }
    const turn = retrieveForTurn({
      guildId: 'guild-1',
      speakerId: 'user-1',
      participantIds: [],
      message: 'what do you remember about painting?',
      scope
    })
    const people = turn.entries.length > 0 ? JSON.stringify(turn.entries) : ''
    const guild = retrieveGuildFacts('guild-1', Date.now(), scope)
    const episodes = buildEpisodeRecallBlock({ guildId: 'guild-1', queryEmbedding: [], scope })
    const media = buildMediaRecallBlock({ guildId: 'guild-1', queryEmbedding: [], scope })
    expect(people).toContain('painting')
    expect(Array.isArray(guild.facts)).toBe(true)
    expect(typeof episodes).toBe('string')
    expect(typeof media).toBe('string')

    // One extraction write through the item writers.
    const written = assertClaim({
      guildId: 'guild-1',
      subjectUserId: 'user-1',
      predicate: 'hobby',
      value: 'gardening',
      sourceKind: 'explicit',
      channelId: 'channel-1'
    })
    expect(written.value).toBe('gardening')

    // Daily maintenance, as index.ts runs it, touches no legacy table.
    mocks.embedPendingFacts.mockResolvedValue({ embedded: 0, failed: 0 })
    mocks.proposePredicates.mockImplementation(async (batch: Array<{ id: number }>) =>
      batch.map(({ id }) => ({ id, predicate: 'keep' }))
    )
    expect(() => pruneStaleClaims()).not.toThrow()
    await expect(reclassifyClaims()).resolves.toBe(0)
    // The 1970 fixture episode and share are past retention, so the item store prunes both.
    await expect(pruneEpisodesAndReembed()).resolves.toMatchObject({ deleted: 1, mediaDeleted: 1 })
    expect(fillMemoryItemEmbeddingHashes()).toBe(0)
    expect(sweepMemoryItemIntegrity()).toEqual({ fact: 0, episode: 0, media: 0 })
  })

  it('restores from the backup and starts up with the legacy tables back', async () => {
    const dbPath = tempPath('rokabot.db')
    process.env.ROKABOT_DB_PATH = dbPath
    seedLegacyFixture()
    migrateMemoryItems(getDb())
    const backup = tempPath('backup.db')
    await getDb().backup(backup)
    dropLegacyMemoryTables(getDb(), { store: 'item', backupPath: backup })
    closeDb()

    copyFileSync(backup, dbPath)
    for (const suffix of ['-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true })

    const restored = getDb()
    runMigrations(restored)
    expect((restored.prepare('SELECT COUNT(*) AS count FROM memory_claim').get() as { count: number }).count).toBe(1)
    expect((restored.prepare('SELECT COUNT(*) AS count FROM media_occurrence').get() as { count: number }).count).toBe(
      1
    )
    expect(isLegacyMemoryDropped(restored)).toBe(false)
    expect(() => configureMemoryItemProjectionTriggers(restored, 'dual')).not.toThrow()
  })
})
