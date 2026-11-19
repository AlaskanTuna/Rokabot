import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type RecallScope, canRecall } from '../../agent/memory/privacy.js'
import { config } from '../../config.js'
import { closeDb, getDb } from '../database.js'
import { listForWrite, listRecallable } from '../memoryItemStore.js'
import type { RecallableMemoryItem, WriteMemoryItem } from '../memoryItemStore.js'

const SCOPE: RecallScope = { guildId: 'guild-fixture', channelId: 'channel-here' }
const memory = config.memory as { privacy: string }
let previousPrivacy = ''

function assertScopeIsRequiredAtCompileTime(): void {
  // @ts-expect-error listRecallable must keep its scope argument required.
  listRecallable({ kind: 'fact' })
}
void assertScopeIsRequiredAtCompileTime

// @ts-expect-error write-only rows must not be accepted by prompt readers.
const promptReadableItems: RecallableMemoryItem[] = [] as WriteMemoryItem[]
void promptReadableItems

function insertFact(input: {
  itemId: number
  guildId?: string
  userId?: string
  value?: string
  legacyId?: number
  needsReview?: number
}): void {
  getDb()
    .prepare(`
      INSERT INTO memory_item (
        id, guild_id, kind, subject_kind, subject_user_id, predicate, content, source_kind, status,
        needs_review, period, confidence, salience, pinned, first_seen_at, last_seen_at, legacy_table, legacy_id
      ) VALUES (?, ?, 'fact', 'user', ?, 'hobby', ?, 'explicit', 'active', ?, 'current', 0.9, 0.8, 0, 100, 200,
        'memory_claim', ?)
    `)
    .run(
      input.itemId,
      input.guildId ?? 'guild-fixture',
      input.userId ?? `user-${input.itemId}`,
      input.value ?? 'tea',
      input.needsReview ?? 0,
      input.legacyId ?? input.itemId + 100
    )
}

function insertEpisode(itemId: number, channelId: string, embedding = true): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memory_item (
      id, guild_id, kind, subject_kind, predicate, content, source_job_id, period, status,
      first_seen_at, last_seen_at, created_at, legacy_table, legacy_id
    ) VALUES (?, 'guild-fixture', 'episode', 'guild', NULL, 'A short episode.', ?, 'current', 'active',
      100, 200, 300, 'memory_episode', ?)
  `).run(itemId, itemId + 1000, itemId + 1000)
  db.prepare(`
    INSERT INTO memory_item_occurrence (item_id, guild_id, channel_id, origin, span_start, observed_at)
    VALUES (?, 'guild-fixture', ?, 'episode', 100, 200)
  `).run(itemId, channelId)
  if (embedding) {
    db.prepare(`
      INSERT INTO memory_item_embedding (item_id, fingerprint, dim, renderer, renderer_version, text_hash, vector)
      VALUES (?, ?, ?, 'summary', 1, NULL, ?)
    `).run(itemId, config.embeddings.fingerprint, config.embeddings.dim, vector())
  }
}

function insertMedia(itemId: number, channelId?: string): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO memory_item (
      id, guild_id, kind, subject_kind, predicate, content, label, media_kind, content_key,
      period, status, first_seen_at, last_seen_at, created_at, legacy_table, legacy_id
    ) VALUES (?, 'guild-fixture', 'media', 'guild', NULL, 'A short media note.', 'Clip', 'video', ?,
      'current', 'active', 100, 200, 200, 'media_digest', ?)
  `).run(itemId, `key-${itemId}`, itemId + 2000)
  if (channelId) {
    db.prepare(`
      INSERT INTO memory_item_occurrence (
        item_id, guild_id, channel_id, origin, message_id, shared_by_user_id, observed_at
      ) VALUES (?, 'guild-fixture', ?, 'link', ?, 'user-fixture', 200)
    `).run(itemId, channelId, `message-${itemId}`)
  }
  db.prepare(`
    INSERT INTO memory_item_embedding (item_id, fingerprint, dim, renderer, renderer_version, text_hash, vector)
    VALUES (?, ?, ?, 'summary', 1, NULL, ?)
  `).run(itemId, config.embeddings.fingerprint, config.embeddings.dim, vector())
}

function vector(): Buffer {
  const result = Buffer.alloc(config.embeddings.dim * 4)
  for (let index = 0; index < config.embeddings.dim; index += 1) result.writeFloatLE(0.25, index * 4)
  return result
}

beforeEach(() => {
  previousPrivacy = memory.privacy
  memory.privacy = 'relaxed'
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  memory.privacy = previousPrivacy
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  vi.restoreAllMocks()
})

describe('memory item read API', () => {
  it('refuses global and dm scopes and returns no recallable rows when privacy is off', () => {
    insertFact({ itemId: 1 })
    insertFact({ itemId: 2, guildId: 'global' })
    insertFact({ itemId: 3, guildId: 'dm:user-fixture' })

    expect(listRecallable({ guildId: 'global', channelId: 'channel-here' }, { kind: 'fact' })).toEqual([])
    expect(listRecallable({ guildId: 'dm:user-fixture', channelId: 'channel-here' }, { kind: 'fact' })).toEqual([])

    memory.privacy = 'off'
    expect(listRecallable(SCOPE, { kind: 'fact' })).toEqual([])
  })

  it('applies source privacy to facts, episodes, and media, including missing sources', () => {
    const db = getDb()
    insertFact({ itemId: 1, value: 'same channel' })
    db.prepare(
      `INSERT INTO memory_item_evidence (item_id, channel_id, source_kind, observed_at) VALUES (1, ?, 'explicit', 200)`
    ).run(SCOPE.channelId)
    insertFact({ itemId: 2, value: 'unknown source' })
    db.prepare(
      `INSERT INTO memory_item_evidence (item_id, channel_id, source_kind, observed_at) VALUES (2, NULL, 'explicit', 200)`
    ).run()
    insertFact({ itemId: 3, value: 'review item', needsReview: 1 })
    insertEpisode(10, SCOPE.channelId)
    insertEpisode(11, 'channel-other')
    insertMedia(20, SCOPE.channelId)
    insertMedia(21)

    memory.privacy = 'balanced'
    expect(
      listRecallable(SCOPE, { kind: 'fact' })
        .map(({ itemId }) => itemId)
        .sort()
    ).toEqual([1, 2])
    expect(listRecallable(SCOPE, { kind: 'episode' }).map(({ itemId }) => itemId)).toEqual([10])
    expect(listRecallable(SCOPE, { kind: 'media' }).map(({ itemId }) => itemId)).toEqual([20])

    memory.privacy = 'strict'
    expect(
      listRecallable(SCOPE, { kind: 'fact' })
        .map(({ itemId }) => itemId)
        .sort()
    ).toEqual([1])
    expect(listRecallable(SCOPE, { kind: 'episode' }).map(({ itemId }) => itemId)).toEqual([10])
    expect(listRecallable(SCOPE, { kind: 'media' }).map(({ itemId }) => itemId)).toEqual([20])
  })

  it('loads vectors only after source filtering and uses explicit column projections', () => {
    insertEpisode(10, SCOPE.channelId)
    insertEpisode(11, 'channel-other')
    const db = getDb()
    const originalPrepare = db.prepare.bind(db)
    const statements: string[] = []
    vi.spyOn(db, 'prepare').mockImplementation((sql) => {
      statements.push(sql)
      return originalPrepare(sql)
    })
    memory.privacy = 'strict'

    expect(listRecallable(SCOPE, { kind: 'episode' }).map(({ itemId }) => itemId)).toEqual([10])

    const occurrenceQuery = statements.findIndex((sql) => sql.includes('memory_item_occurrence'))
    const vectorQuery = statements.findIndex((sql) => sql.includes('memory_item_embedding'))
    expect(occurrenceQuery).toBeGreaterThanOrEqual(0)
    expect(vectorQuery).toBeGreaterThan(occurrenceQuery)
    expect(statements.some((sql) => /SELECT\s+\*/i.test(sql))).toBe(false)
    expect(statements.some((sql) => sql.includes('memory_item_payload'))).toBe(false)
  })

  it('proves the relaxed shortcut returns what canRecall would return without reading sources', () => {
    const db = getDb()
    insertFact({ itemId: 1 })
    db.prepare(
      `INSERT INTO memory_item_evidence (item_id, channel_id, source_kind, observed_at) VALUES (1, 'private', 'explicit', 200)`
    ).run()
    insertFact({ itemId: 2 })
    const originalPrepare = db.prepare.bind(db)
    const statements: string[] = []
    vi.spyOn(db, 'prepare').mockImplementation((sql) => {
      statements.push(sql)
      return originalPrepare(sql)
    })

    const actual = listRecallable(SCOPE, { kind: 'fact' })
      .map(({ itemId }) => itemId)
      .sort()
    const apiStatements = [...statements]
    const rows = db
      .prepare('SELECT id FROM memory_item WHERE kind = ? AND guild_id = ?')
      .all('fact', SCOPE.guildId) as Array<{ id: number }>
    const expected = rows
      .filter(({ id }) => {
        const sources = db.prepare('SELECT channel_id FROM memory_item_evidence WHERE item_id = ?').all(id) as Array<{
          channel_id: string | null
        }>
        return canRecall(sources.length ? sources.map(({ channel_id }) => channel_id) : [null], SCOPE, 'relaxed')
      })
      .map(({ id }) => id)
      .sort()

    expect(actual).toEqual(expected)
    expect(apiStatements.some((sql) => sql.includes('memory_item_evidence'))).toBe(false)
  })

  it('keeps hidden rows available to write logic without making them prompt-readable', () => {
    insertFact({ itemId: 1 })
    memory.privacy = 'off'

    const writeRows = listForWrite({ guildId: SCOPE.guildId, kind: 'fact' })

    expect(writeRows.map(({ itemId }) => itemId)).toEqual([1])
    expect(listRecallable(SCOPE, { kind: 'fact' })).toEqual([])
  })
})
