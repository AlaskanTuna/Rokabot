import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as memoryClaims from '../../agent/memory/memoryClaims.js'
import { moveClaim, undoReclassify } from '../../agent/memory/reclassify.js'
import { config } from '../../config.js'
import { closeDb, getDb } from '../database.js'
import * as mediaDigestStore from '../mediaDigestStore.js'
import * as memoryEpisodeStore from '../memoryEpisodeStore.js'
import { exportMemoryItemsToLegacy, getMemoryItemDriftCounts, migrateMemoryItems } from '../memoryItemBackfill.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'

const memoryStoreConfig = config.memory as { store: 'legacy' | 'dual' | 'item' }
const vector = {
  values: [0.5, 0.5],
  modelId: 'synthetic-model',
  dim: 2,
  fingerprint: 'synthetic:fingerprint'
} as const

function prepareFtsIndexComparison(): void {
  getDb().exec(`
    CREATE VIRTUAL TABLE temp.memory_item_fts_expected USING fts5(content, predicate);
    CREATE VIRTUAL TABLE temp.memory_item_fts_actual_vocab
      USING fts5vocab(main, memory_item_fts, 'instance');
    CREATE VIRTUAL TABLE temp.memory_item_fts_expected_vocab
      USING fts5vocab(temp, memory_item_fts_expected, 'instance');
  `)
}

function expectFtsIndexMatchesActiveFacts(): void {
  const database = getDb()
  database.exec('DELETE FROM temp.memory_item_fts_expected')
  database.exec(`
    INSERT INTO temp.memory_item_fts_expected (rowid, content, predicate)
    SELECT id, content, predicate FROM memory_item WHERE kind = 'fact' AND status = 'active'
  `)
  expect(
    database
      .prepare('SELECT term, doc, col, offset FROM temp.memory_item_fts_actual_vocab ORDER BY doc, col, offset, term')
      .all()
  ).toEqual(
    database
      .prepare('SELECT term, doc, col, offset FROM temp.memory_item_fts_expected_vocab ORDER BY doc, col, offset, term')
      .all()
  )
}

describe('memory item reverse export', () => {
  beforeEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = ':memory:'
    memoryStoreConfig.store = 'dual'
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
    prepareFtsIndexComparison()
  })

  afterEach(() => {
    closeDb()
    memoryStoreConfig.store = 'legacy'
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('exports item writers to legacy rows and passes the Phase 2 forward round trip', () => {
    memoryStoreConfig.store = 'item'
    configureMemoryItemProjectionTriggers(getDb(), 'item')

    const claim = memoryClaims.assertClaim({
      guildId: 'guild-fixture',
      subjectUserId: 'user-fixture',
      predicate: 'hobby',
      value: 'synthetic drawing',
      sourceKind: 'explicit',
      channelId: 'channel-fixture',
      observedAt: 100
    })
    memoryClaims.appendEvidence(claim.id, {
      sourceKind: 'human',
      channelId: 'channel-2',
      observedAt: 200
    })
    memoryEpisodeStore.saveMemoryEpisode({
      id: 501,
      guildId: 'guild-fixture',
      channelId: 'channel-fixture',
      startedAt: 100,
      endedAt: 200,
      summary: 'Synthetic episode.',
      embedding: vector,
      createdAt: 300
    })
    const digest = mediaDigestStore.saveMediaDigest({
      guildId: 'guild-fixture',
      contentKey: 'fixture:key',
      kind: 'video',
      label: 'Fixture media',
      summary: 'Synthetic media summary.',
      digestJson: '{"fixture":true}',
      embedding: vector,
      createdAt: 300
    })
    expect(digest).not.toBeNull()
    mediaDigestStore.recordMediaOccurrence({
      digestId: digest!.id,
      guildId: 'guild-fixture',
      channelId: 'channel-fixture',
      messageId: 'message-fixture',
      sharedByUserId: 'user-fixture',
      sourceAuthorId: null,
      origin: 'upload',
      observedAt: 400
    })

    const report = exportMemoryItemsToLegacy(getDb())
    expect(report).toMatchObject({
      exported_items: 3,
      exported_evidence: 2,
      exported_occurrences: 1,
      forward_check: { checks_failed: 0 }
    })
    expect(getMemoryItemDriftCounts(getDb())).toEqual({ fact: 0, episode: 0, media: 0 })
    expect(migrateMemoryItems(getDb()).checks_failed).toBe(0)
    expect(
      getDb().prepare('SELECT COUNT(*) AS count FROM memory_item_embedding WHERE text_hash IS NULL').get()
    ).toEqual({
      count: 0
    })
  })

  it('writes v2 item IDs and undoes a move when called with the legacy claim ID', () => {
    memoryEpisodeStore.saveMemoryEpisode({
      id: 501,
      guildId: 'guild-fixture',
      channelId: 'channel-fixture',
      startedAt: 50,
      endedAt: 60,
      summary: 'ID offset episode.',
      embedding: null,
      createdAt: 70
    })
    const original = memoryClaims.assertClaim({
      guildId: 'guild-fixture',
      subjectUserId: 'user-fixture',
      predicate: 'misc',
      value: 'synthetic fact',
      sourceKind: 'explicit',
      observedAt: 100
    })
    migrateMemoryItems(getDb())
    const item = getDb()
      .prepare("SELECT id, legacy_id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = ?")
      .get(original.id) as { id: number; legacy_id: number }
    expect(item.id).not.toBe(item.legacy_id)

    memoryStoreConfig.store = 'item'
    configureMemoryItemProjectionTriggers(getDb(), 'item')
    const candidate = memoryClaims.findReclassifyRows(10).find((row) => row.id === original.id)!
    moveClaim(candidate, 'hobby', 0.9)

    const event = getDb()
      .prepare("SELECT detail FROM memory_events WHERE kind = 'claim_reclassified' ORDER BY id DESC LIMIT 1")
      .get() as { detail: string }
    expect(JSON.parse(event.detail)).toMatchObject({ v: 2, oldId: item.id })
    expect(undoReclassify(original.id)).toBe(true)
    expect(getDb().prepare('SELECT status, superseded_by FROM memory_item WHERE id = ?').get(item.id)).toEqual({
      status: 'active',
      superseded_by: null
    })
    expectFtsIndexMatchesActiveFacts()
  })

  it('keeps v2 audits undoable through legacy_id after the reverse export and dual rollback', () => {
    memoryEpisodeStore.saveMemoryEpisode({
      id: 501,
      guildId: 'guild-fixture',
      channelId: 'channel-fixture',
      startedAt: 50,
      endedAt: 60,
      summary: 'ID offset episode.',
      embedding: null,
      createdAt: 70
    })
    const original = memoryClaims.assertClaim({
      guildId: 'guild-fixture',
      subjectUserId: 'user-fixture',
      predicate: 'misc',
      value: 'synthetic fact',
      sourceKind: 'explicit',
      observedAt: 100
    })
    migrateMemoryItems(getDb())
    memoryStoreConfig.store = 'item'
    configureMemoryItemProjectionTriggers(getDb(), 'item')
    const candidate = memoryClaims.findReclassifyRows(10).find((row) => row.id === original.id)!
    moveClaim(candidate, 'hobby', 0.9)

    exportMemoryItemsToLegacy(getDb())
    memoryStoreConfig.store = 'dual'
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
    expect(undoReclassify(original.id)).toBe(true)
    expect(getDb().prepare('SELECT status, superseded_by FROM memory_claim WHERE id = ?').get(original.id)).toEqual({
      status: 'active',
      superseded_by: null
    })
    expect(getMemoryItemDriftCounts(getDb())).toEqual({ fact: 0, episode: 0, media: 0 })
  })

  it('refuses reverse export while dual projection triggers are installed', () => {
    expect(() => exportMemoryItemsToLegacy(getDb())).toThrow(
      'Memory item reverse export requires projection triggers to be dropped'
    )
  })
})
