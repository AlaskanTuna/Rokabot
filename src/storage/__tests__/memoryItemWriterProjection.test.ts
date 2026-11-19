import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as memoryClaims from '../../agent/memory/memoryClaims.js'
import { moveClaim, undoReclassify } from '../../agent/memory/reclassify.js'
import { config } from '../../config.js'
import { closeDb, getDb } from '../database.js'
import type { ExtractionEpisode } from '../extractionQueue.js'
import * as mediaDigestStore from '../mediaDigestStore.js'
import * as memoryEpisodeStore from '../memoryEpisodeStore.js'
import { getMemoryItemDriftCounts, migrateMemoryItems } from '../memoryItemBackfill.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'
import * as memoryRecallStore from '../memoryRecallStore.js'

const reclassifyModelMocks = vi.hoisted(() => ({
  proposePredicates: vi.fn(),
  jevConfirm: vi.fn()
}))

const memoryStoreConfig = config.memory as { store: 'legacy' | 'dual' | 'item' }

vi.mock('../../agent/memory/reclassifyModels.js', () => ({
  proposePredicates: reclassifyModelMocks.proposePredicates,
  jevConfirm: reclassifyModelMocks.jevConfirm
}))

const vector = {
  values: [0.5, 0.5],
  modelId: 'synthetic-model',
  dim: 2,
  fingerprint: 'synthetic:fingerprint'
} as const

type Context = {
  seedClaim: (input?: Partial<Parameters<typeof memoryClaims.assertClaim>[0]>) => number
  seedGuildClaim: () => number
  seedEpisode: (id?: number, summary?: string, endedAt?: number) => number
  seedDigest: (contentKey?: string, summary?: string) => number
  check: () => void
}

type Scenario = Readonly<{ name: string; run: (context: Context) => void | Promise<void> }>

function insertOpenLine(check: () => void): void {
  memoryEpisodeStore.recordOpenEpisodeMessage({
    guildId: 'guild-fixture',
    channelId: 'channel-fixture',
    openedAt: 100,
    line: {
      messageId: 'message-fixture',
      userId: 'user-fixture',
      displayName: 'Fixture',
      content: 'Synthetic line.',
      timestamp: 100,
      isBot: false
    }
  })
  check()
}

const scenarios: readonly Scenario[] = [
  {
    name: 'memoryClaims.appendEvidence',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.appendEvidence(id, { sourceKind: 'human', observedAt: 200, channelId: 'channel-2' })
    }
  },
  { name: 'memoryClaims.evictOverflowForAllSubjects', run: () => memoryClaims.evictOverflowForAllSubjects() },
  { name: 'memoryClaims.pruneActiveClaimOverflow', run: () => memoryClaims.pruneActiveClaimOverflow() },
  { name: 'memoryClaims.assertClaim', run: ({ seedClaim }) => seedClaim() },
  {
    name: 'memoryClaims.activateClaim',
    run: ({ seedClaim }) => {
      const id = seedClaim({ status: 'candidate', needsReview: true, sourceKind: 'passive' })
      memoryClaims.activateClaim('guild-fixture', id)
    }
  },
  {
    name: 'memoryClaims.retractClaim',
    run: ({ seedClaim }) => {
      seedClaim()
      memoryClaims.retractClaim({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        predicate: 'hobby',
        value: 'chess'
      })
    }
  },
  {
    name: 'memoryClaims.retireClaim',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.retireClaim('guild-fixture', id, 'retracted')
    }
  },
  {
    name: 'memoryClaims.pinClaim',
    run: ({ seedClaim }) => memoryClaims.pinClaim(seedClaim())
  },
  {
    name: 'memoryClaims.unpinClaim',
    run: ({ seedClaim, check }) => {
      const id = seedClaim()
      memoryClaims.pinClaim(id)
      check()
      memoryClaims.unpinClaim(id)
    }
  },
  {
    name: 'memoryClaims.replaceActiveClaim',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.replaceActiveClaim({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        existingId: id,
        predicate: 'hobby',
        value: 'painting',
        channelId: 'channel-fixture',
        observedAt: 200
      })
    }
  },
  {
    name: 'memoryClaims.replaceActiveClaim on an ended fact',
    run: ({ seedClaim, check }) => {
      const id = seedClaim()
      memoryClaims.rejectActiveClaimById({ guildId: 'guild-fixture', subjectUserId: 'user-fixture', existingId: id })
      check()
      expect(
        memoryClaims.replaceActiveClaim({
          guildId: 'guild-fixture',
          subjectUserId: 'user-fixture',
          existingId: id,
          predicate: 'hobby',
          value: 'painting',
          channelId: 'channel-fixture',
          observedAt: 200
        })
      ).toBeNull()
    }
  },
  {
    name: 'memoryClaims.replaceActiveClaim with an unsafe value',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      expect(() =>
        memoryClaims.replaceActiveClaim({
          guildId: 'guild-fixture',
          subjectUserId: 'user-fixture',
          existingId: id,
          predicate: 'hobby',
          value: 'line one\nline two',
          channelId: 'channel-fixture',
          observedAt: 200
        })
      ).toThrow('Claim value is unsafe')
    }
  },
  {
    name: 'memoryClaims.assertClaim keeps the object user of an existing fact',
    run: ({ seedClaim }) => {
      seedClaim({ predicate: 'relationship_to', value: 'partner', objectUserId: 'object-a' })
      seedClaim({ predicate: 'relationship_to', value: 'partner', objectUserId: 'object-b', observedAt: 200 })
    }
  },
  {
    name: 'memoryClaims.rejectActiveClaimById',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.rejectActiveClaimById({ guildId: 'guild-fixture', subjectUserId: 'user-fixture', existingId: id })
    }
  },
  {
    name: 'memoryClaims.rejectClaimIdsForSpeaker',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.rejectClaimIdsForSpeaker('guild-fixture', 'user-fixture', [id])
    }
  },
  { name: 'memoryClaims.assertGuildClaim', run: ({ seedGuildClaim }) => seedGuildClaim() },
  {
    name: 'memoryClaims.replaceActiveGuildClaim',
    run: ({ seedGuildClaim }) => {
      const id = seedGuildClaim()
      memoryClaims.replaceActiveGuildClaim({
        guildId: 'guild-fixture',
        existingId: id,
        predicate: 'upcoming_event',
        value: 'Community gathering',
        expiresAt: 20_000,
        eventDate: '2026-12',
        channelId: 'channel-fixture',
        observedAt: 200
      })
    }
  },
  {
    name: 'memoryClaims.replaceActiveGuildClaim on an ended fact',
    run: ({ seedGuildClaim, check }) => {
      const id = seedGuildClaim()
      memoryClaims.rejectActiveGuildClaimById({ guildId: 'guild-fixture', existingId: id })
      check()
      expect(
        memoryClaims.replaceActiveGuildClaim({
          guildId: 'guild-fixture',
          existingId: id,
          predicate: 'upcoming_event',
          value: 'Community gathering',
          expiresAt: 20_000,
          eventDate: '2026-12',
          channelId: 'channel-fixture',
          observedAt: 200
        })
      ).toBeNull()
    }
  },
  {
    name: 'memoryClaims.rejectActiveGuildClaimById',
    run: ({ seedGuildClaim }) => {
      const id = seedGuildClaim()
      memoryClaims.rejectActiveGuildClaimById({ guildId: 'guild-fixture', existingId: id })
    }
  },
  {
    name: 'memoryClaims.touchRecalled',
    run: ({ seedClaim }) => memoryClaims.touchRecalled([seedClaim()])
  },
  { name: 'memoryClaims.pruneStaleClaims', run: () => memoryClaims.pruneStaleClaims(1_000_000) },
  {
    name: 'reclassify.moveClaim raw SQL path',
    run: ({ seedClaim, check }) => {
      const id = seedClaim({ predicate: 'misc' })
      const claim = memoryClaims.findReclassifyRows(10).find((row) => row.id === id)!
      moveClaim(claim, 'hobby', 0.9)
      check()
    }
  },
  {
    name: 'reclassify.undoReclassify raw SQL path',
    run: ({ seedClaim, check }) => {
      const id = seedClaim({ predicate: 'misc' })
      moveClaim(memoryClaims.findReclassifyRows(10).find((row) => row.id === id)!, 'hobby', 0.9)
      check()
      undoReclassify(id)
    }
  },
  {
    name: 'reclassify.reclassifyClaims with stubbed model results',
    run: async ({ seedClaim }) => {
      const id = seedClaim({ predicate: 'misc' })
      reclassifyModelMocks.proposePredicates.mockResolvedValue([{ id, predicate: 'hobby' }])
      reclassifyModelMocks.jevConfirm.mockResolvedValue({ [id]: 0.9 })
      expect(await (await import('../../agent/memory/reclassify.js')).reclassifyClaims()).toBe(1)
    }
  },
  {
    name: 'memoryEpisodeStore.saveMemoryEpisode',
    run: ({ seedEpisode }) => seedEpisode()
  },
  {
    name: 'memoryEpisodeStore.saveMemoryEpisode retry with a new summary',
    run: ({ seedEpisode }) => {
      seedEpisode()
      seedEpisode(501, 'Retried episode.')
    }
  },
  {
    name: 'memoryEpisodeStore.setEpisodeEmbedding',
    run: ({ seedEpisode }) => {
      const id = seedEpisode()
      memoryEpisodeStore.setEpisodeEmbedding({
        guildId: 'guild-fixture',
        id,
        summary: 'Synthetic episode.',
        embedding: vector
      })
    }
  },
  {
    name: 'memoryEpisodeStore.pruneExpiredEpisodes',
    run: ({ seedEpisode }) => {
      seedEpisode(501, 'Expired episode.', 1)
      memoryEpisodeStore.pruneExpiredEpisodes(2)
    }
  },
  {
    name: 'memoryEpisodeStore.recordOpenEpisodeMessage',
    run: ({ check }) => insertOpenLine(check)
  },
  {
    name: 'memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor',
    run: ({ check }) => {
      insertOpenLine(check)
      const episode: ExtractionEpisode = {
        messages: [
          {
            messageId: 'message-fixture',
            userId: 'user-fixture',
            displayName: 'Fixture',
            content: 'Synthetic line.',
            timestamp: 100,
            isBot: false
          }
        ],
        context: [],
        startedAt: 100,
        endedAt: 100
      }
      memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor({
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        episode,
        lastMessageId: 'message-fixture'
      })
    }
  },
  {
    name: 'memoryEpisodeStore.syncOpenEpisodeCursorsToLineCounts',
    run: ({ check }) => {
      insertOpenLine(check)
      memoryEpisodeStore.syncOpenEpisodeCursorsToLineCounts()
    }
  },
  {
    name: 'memoryEpisodeStore.clearSavedOpenEpisodes',
    run: ({ check }) => {
      insertOpenLine(check)
      memoryEpisodeStore.clearSavedOpenEpisodes()
    }
  },
  {
    name: 'mediaDigestStore.saveMediaDigest',
    run: ({ seedDigest }) => seedDigest()
  },
  {
    name: 'mediaDigestStore.recordMediaOccurrence',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'message-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 200
      })
    }
  },
  {
    name: 'mediaDigestStore.saveMediaDigest re-watch after the last share',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'rewatched-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 200
      })
      check()
      mediaDigestStore.saveMediaDigest({
        guildId: 'guild-fixture',
        contentKey: 'fixture:key',
        kind: 'video',
        label: 'Fixture media',
        summary: 'Rewatched media summary.',
        digestJson: '{}',
        createdAt: 500
      })
    }
  },
  {
    name: 'mediaDigestStore.setMediaDigestEmbedding',
    run: ({ seedDigest }) => {
      const id = seedDigest()
      mediaDigestStore.setMediaDigestEmbedding({
        guildId: 'guild-fixture',
        id,
        summary: 'Synthetic media summary.',
        embedding: vector
      })
    }
  },
  {
    name: 'mediaDigestStore.pruneExpiredMediaDigests',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'expired-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 1
      })
      check()
      mediaDigestStore.pruneExpiredMediaDigests(2)
    }
  },
  {
    name: 'mediaDigestStore.forgetMediaForUser',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'forgotten-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 200
      })
      check()
      mediaDigestStore.forgetMediaForUser('guild-fixture', 'user-fixture', [id])
    }
  },
  {
    name: 'memoryRecallStore.setClaimEmbedding',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryRecallStore.setClaimEmbedding({ id, embeddingText: 'Synthetic fact sentence.', embedding: vector })
    }
  }
]

function itemStoreSnapshot() {
  const db = getDb()
  const items = db
    .prepare(`
      SELECT id, guild_id, kind, subject_kind, subject_user_id, predicate, content, label, media_kind, content_key,
             source_job_id, period, object_kind, object_user_id, source_kind, status, needs_review, end_reason,
             ended_at, superseded_by, confidence, salience, pinned, valid_until, event_date, first_seen_at,
             last_seen_at, last_recalled_at, created_at, version, legacy_embedding_text
      FROM memory_item ORDER BY id
    `)
    .all() as Array<Record<string, unknown> & { id: number; superseded_by: number | null }>
  const itemIds = new Map(items.map(({ id }, index) => [id, index + 1]))
  const normalizeItemId = (id: number | null) => (id === null ? null : itemIds.get(id))
  return {
    items: items.map((item) => ({
      ...item,
      id: normalizeItemId(item.id),
      superseded_by: normalizeItemId(item.superseded_by)
    })),
    evidence: db
      .prepare(`
        SELECT item_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id
        FROM memory_item_evidence ORDER BY item_id, observed_at, job_id
      `)
      .all()
      .map((row) => ({
        ...(row as Record<string, unknown>),
        item_id: normalizeItemId((row as { item_id: number }).item_id)
      })),
    occurrences: db
      .prepare(`
        SELECT item_id, guild_id, channel_id, origin, message_id, shared_by_user_id, source_author_id, span_start,
               observed_at
        FROM memory_item_occurrence ORDER BY item_id, observed_at, message_id
      `)
      .all()
      .map((row) => ({
        ...(row as Record<string, unknown>),
        item_id: normalizeItemId((row as { item_id: number }).item_id)
      })),
    payloads: db
      .prepare('SELECT item_id, digest_json FROM memory_item_payload ORDER BY item_id')
      .all()
      .map((row) => ({
        ...(row as Record<string, unknown>),
        item_id: normalizeItemId((row as { item_id: number }).item_id)
      })),
    embeddings: db
      .prepare(`
        SELECT item_id, fingerprint, model_id, dim, renderer, renderer_version, vector
        FROM memory_item_embedding ORDER BY item_id, fingerprint
      `)
      .all()
      .map((row) => ({
        ...(row as Record<string, unknown>),
        item_id: normalizeItemId((row as { item_id: number }).item_id)
      })),
    fts: db
      .prepare('SELECT rowid, content, predicate FROM memory_item_fts ORDER BY rowid')
      .all()
      .map((row) => ({ ...(row as Record<string, unknown>), rowid: normalizeItemId((row as { rowid: number }).rowid) }))
  }
}

function legacySourcesSnapshot() {
  const db = getDb()
  return {
    claims: db.prepare('SELECT * FROM memory_claim ORDER BY id').all(),
    evidence: db.prepare('SELECT * FROM memory_evidence ORDER BY id').all(),
    episodes: db.prepare('SELECT * FROM memory_episode ORDER BY id').all(),
    digests: db.prepare('SELECT * FROM media_digest ORDER BY id').all(),
    occurrences: db.prepare('SELECT * FROM media_occurrence ORDER BY id').all()
  }
}

function prepareFtsIndexComparison(database: ReturnType<typeof getDb>): void {
  database.exec(`
    CREATE VIRTUAL TABLE temp.memory_item_fts_expected USING fts5(content, predicate);
    CREATE VIRTUAL TABLE temp.memory_item_fts_actual_vocab
      USING fts5vocab(main, memory_item_fts, 'instance');
    CREATE VIRTUAL TABLE temp.memory_item_fts_expected_vocab
      USING fts5vocab(temp, memory_item_fts_expected, 'instance');
  `)
}

function expectFtsIndexMatchesActiveFacts(database: ReturnType<typeof getDb>): void {
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

async function runScenarioInStore(mode: 'dual' | 'item', run: Scenario['run']) {
  closeDb()
  process.env.ROKABOT_DB_PATH = ':memory:'
  memoryStoreConfig.store = 'dual'
  const db = getDb()
  configureMemoryItemProjectionTriggers(db, 'dual')
  prepareFtsIndexComparison(db)
  memoryClaims.assertClaim({
    guildId: 'guild-fixture',
    subjectUserId: 'baseline-user',
    predicate: 'favorite_color',
    value: 'green',
    sourceKind: 'explicit',
    observedAt: 50
  })
  memoryEpisodeStore.saveMemoryEpisode({
    id: 700,
    guildId: 'guild-fixture',
    channelId: 'channel-fixture',
    startedAt: 100,
    endedAt: 200,
    summary: 'Baseline episode.',
    embedding: null,
    createdAt: 300
  })
  const baselineDigest = mediaDigestStore.saveMediaDigest({
    guildId: 'guild-fixture',
    contentKey: 'baseline:key',
    kind: 'video',
    label: 'Baseline media',
    summary: 'Baseline media summary.',
    digestJson: '{}',
    createdAt: 300
  })!
  mediaDigestStore.recordMediaOccurrence({
    digestId: baselineDigest.id,
    guildId: 'guild-fixture',
    channelId: 'channel-fixture',
    messageId: 'baseline-message',
    sharedByUserId: 'baseline-user',
    sourceAuthorId: null,
    origin: 'upload',
    observedAt: 200
  })
  expect(getMemoryItemDriftCounts(db)).toEqual({ fact: 0, episode: 0, media: 0 })
  expect(migrateMemoryItems(db).checks_failed).toBe(0)
  const frozenSources = legacySourcesSnapshot()
  if (mode === 'item') {
    memoryStoreConfig.store = 'item'
    configureMemoryItemProjectionTriggers(db, 'item')
  }
  const snapshots: ReturnType<typeof itemStoreSnapshot>[] = []
  const check = () => {
    expectFtsIndexMatchesActiveFacts(db)
    if (mode === 'dual') {
      expect(getMemoryItemDriftCounts(db)).toEqual({ fact: 0, episode: 0, media: 0 })
      expect(migrateMemoryItems(db).checks_failed).toBe(0)
    } else {
      expect(legacySourcesSnapshot()).toEqual(frozenSources)
      const unhashed = db
        .prepare('SELECT COUNT(*) AS count FROM memory_item_embedding WHERE text_hash IS NULL')
        .get() as { count: number }
      expect(unhashed.count).toBe(0)
    }
    snapshots.push(itemStoreSnapshot())
  }
  const seedClaim = (input: Partial<Parameters<typeof memoryClaims.assertClaim>[0]> = {}) => {
    const claim = memoryClaims.assertClaim({
      guildId: 'guild-fixture',
      subjectUserId: 'user-fixture',
      predicate: 'hobby',
      value: 'chess',
      sourceKind: 'explicit',
      observedAt: 100,
      ...input
    })
    check()
    return claim.id
  }
  const seedGuildClaim = () => {
    const claim = memoryClaims.assertGuildClaim({
      guildId: 'guild-fixture',
      predicate: 'upcoming_event',
      value: 'Workshop',
      expiresAt: 10_000,
      eventDate: '2026-11',
      sourceKind: 'explicit',
      observedAt: 100
    })
    check()
    return claim.id
  }
  const seedEpisode = (id = 501, summary = 'Synthetic episode.', endedAt = 200) => {
    memoryEpisodeStore.saveMemoryEpisode({
      id,
      guildId: 'guild-fixture',
      channelId: 'channel-fixture',
      startedAt: 100,
      endedAt,
      summary,
      embedding: null,
      createdAt: 300
    })
    check()
    return id
  }
  const seedDigest = (contentKey = 'fixture:key', summary = 'Synthetic media summary.') => {
    const digest = mediaDigestStore.saveMediaDigest({
      guildId: 'guild-fixture',
      contentKey,
      kind: 'video',
      label: 'Fixture media',
      summary,
      digestJson: '{}',
      createdAt: 300
    })
    expect(digest).not.toBeNull()
    check()
    return digest!.id
  }

  await run({ seedClaim, seedGuildClaim, seedEpisode, seedDigest, check })
  check()
  return snapshots
}

describe.each(scenarios)('$name', ({ run }) => {
  beforeEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = ':memory:'
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
  })

  afterEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('leaves the Phase 2 projection equal to its legacy sources', async () => {
    const check = () => {
      expect(getMemoryItemDriftCounts(getDb())).toEqual({ fact: 0, episode: 0, media: 0 })
      const report = migrateMemoryItems(getDb())
      expect(report.copied_items).toBe(0)
      expect(report.refreshed_items).toBe(0)
      expect(report.deleted_items).toBe(0)
      expect(report.copied_evidence).toBe(0)
      expect(report.copied_occurrences).toBe(0)
      expect(report.copied_payloads).toBe(0)
      expect(report.copied_embeddings).toBe(0)
      expect(report.checks_failed).toBe(0)
    }
    const seedClaim = (input: Partial<Parameters<typeof memoryClaims.assertClaim>[0]> = {}) => {
      const claim = memoryClaims.assertClaim({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        predicate: 'hobby',
        value: 'chess',
        sourceKind: 'explicit',
        observedAt: 100,
        ...input
      })
      check()
      return claim.id
    }
    const seedGuildClaim = () => {
      const claim = memoryClaims.assertGuildClaim({
        guildId: 'guild-fixture',
        predicate: 'upcoming_event',
        value: 'Workshop',
        expiresAt: 10_000,
        eventDate: '2026-11',
        sourceKind: 'explicit',
        observedAt: 100
      })
      check()
      return claim.id
    }
    const seedEpisode = (id = 501, summary = 'Synthetic episode.', endedAt = 200) => {
      memoryEpisodeStore.saveMemoryEpisode({
        id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        startedAt: 100,
        endedAt,
        summary,
        embedding: null,
        createdAt: 300
      })
      check()
      return id
    }
    const seedDigest = (contentKey = 'fixture:key', summary = 'Synthetic media summary.') => {
      const digest = mediaDigestStore.saveMediaDigest({
        guildId: 'guild-fixture',
        contentKey,
        kind: 'video',
        label: 'Fixture media',
        summary,
        digestJson: '{}',
        createdAt: 300
      })
      expect(digest).not.toBeNull()
      check()
      return digest!.id
    }

    await run({ seedClaim, seedGuildClaim, seedEpisode, seedDigest, check })
    check()
  })
})

describe.each(scenarios)('item writer parity: $name', ({ run }) => {
  afterEach(() => {
    closeDb()
    memoryStoreConfig.store = 'legacy'
    process.env.ROKABOT_DB_PATH = undefined
    vi.useRealTimers()
  })

  it('matches the dual projection after every write while keeping legacy tables frozen', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T00:00:00.000Z'))
    const dual = await runScenarioInStore('dual', run)
    const item = await runScenarioInStore('item', run)
    expect(item).toEqual(dual)
  })
})
