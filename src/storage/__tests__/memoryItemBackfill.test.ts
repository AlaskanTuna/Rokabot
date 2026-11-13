import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb, getDb } from '../database.js'
import { migrateMemoryItems } from '../memoryItemBackfill.js'

const GEMINI_FINGERPRINT = 'gemini:gemini-embedding-2:768:gemini-task-prefix'
const DAY = 24 * 60 * 60 * 1000

function vector(value: number, dim = 768): Buffer {
  const bytes = Buffer.alloc(dim * 4)
  for (let index = 0; index < dim; index += 1) bytes.writeFloatLE(value, index * 4)
  return bytes
}

function seedFixture(): void {
  const db = getDb()
  const insertClaim = db.prepare(`
    INSERT INTO memory_claim (
      id, guild_id, subject_kind, subject_user_id, predicate, value, object_kind, object_user_id,
      source_kind, status, confidence, salience, pinned, needs_review, superseded_by, first_seen_at,
      last_seen_at, last_recalled_at, ended_at, end_reason, expires_at, event_date, embedding,
      embedding_text, embedding_model_id, embedding_dim, embedding_fingerprint, period
    ) VALUES (
      @id, 'guild-fixture', @subject_kind, @subject_user_id, @predicate, @value, @object_kind, @object_user_id,
      @source_kind, @status, 0.7, 0.8, @pinned, @needs_review, @superseded_by, @first_seen_at,
      @last_seen_at, @last_recalled_at, @ended_at, @end_reason, @expires_at, @event_date, @embedding,
      @embedding_text, @embedding_model_id, @embedding_dim, @embedding_fingerprint, @period
    )
  `)
  const fact = (input: {
    id: number
    subjectKind?: 'user' | 'guild'
    subjectUserId?: string | null
    predicate: string
    value: string
    status?: string
    period?: 'current' | 'past'
    needsReview?: number
    pinned?: number
    supersededBy?: number | null
    endedAt?: number | null
    endReason?: string | null
    expiresAt?: number | null
    eventDate?: string | null
    embedding?: Buffer | null
    embeddingText?: string | null
    embeddingModelId?: string | null
    embeddingDim?: number | null
    embeddingFingerprint?: string | null
  }) => {
    insertClaim.run({
      id: input.id,
      subject_kind: input.subjectKind ?? 'user',
      subject_user_id: input.subjectKind === 'guild' ? null : (input.subjectUserId ?? 'user-fixture'),
      predicate: input.predicate,
      value: input.value,
      object_kind: input.predicate === 'relationship_to' ? 'user' : null,
      object_user_id: input.predicate === 'relationship_to' ? 'user-related' : null,
      source_kind: 'explicit',
      status: input.status ?? 'active',
      pinned: input.pinned ?? 0,
      needs_review: input.needsReview ?? 0,
      superseded_by: input.supersededBy ?? null,
      first_seen_at: 1_700_000_000_000 + input.id * DAY,
      last_seen_at: 1_700_000_000_500 + input.id * DAY,
      last_recalled_at: input.id === 11 ? 1_700_000_001_000 : null,
      ended_at: input.endedAt ?? null,
      end_reason: input.endReason ?? null,
      expires_at: input.expiresAt ?? null,
      event_date: input.eventDate ?? null,
      embedding: input.embedding ?? null,
      embedding_text: input.embeddingText ?? null,
      embedding_model_id: input.embeddingModelId ?? null,
      embedding_dim: input.embeddingDim ?? null,
      embedding_fingerprint: input.embeddingFingerprint ?? null,
      period: input.period ?? 'current'
    })
  }

  fact({
    id: 11,
    predicate: 'tea',
    value: 'green',
    period: 'past',
    pinned: 1,
    embedding: vector(0.25),
    embeddingText: "This person's past tea: green.",
    embeddingDim: 768,
    embeddingFingerprint: 'unknown'
  })
  fact({ id: 12, predicate: 'hobby', value: 'painting', status: 'candidate', needsReview: 1 })
  fact({
    id: 13,
    subjectKind: 'guild',
    predicate: 'upcoming_event',
    value: 'community picnic',
    expiresAt: 1_800_000_000_000,
    eventDate: '2026-11',
    embedding: Buffer.from([1, 2, 3, 4]),
    embeddingText: 'Server upcoming event (2026-11): community picnic.',
    embeddingModelId: 'gemini-embedding-2',
    embeddingDim: 768,
    embeddingFingerprint: GEMINI_FINGERPRINT
  })
  fact({
    id: 14,
    predicate: 'favorite_color',
    value: 'blue',
    status: 'superseded',
    supersededBy: 15,
    endedAt: 1_750_000_000_000,
    endReason: 'superseded'
  })
  fact({ id: 15, predicate: 'favorite_color', value: 'green' })
  fact({
    id: 16,
    predicate: 'interest',
    value: 'drawing',
    status: 'rejected',
    endedAt: 1_750_000_000_100,
    endReason: 'reclassified'
  })
  fact({
    id: 17,
    predicate: 'snack',
    value: 'chips',
    status: 'rejected',
    endedAt: 1_750_000_000_200,
    endReason: 'forgotten'
  })

  db.prepare(`
    INSERT INTO memory_evidence (
      id, claim_id, channel_id, source_kind, observed_at, effective_at, job_id, source_message_id, speaker_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(101, 11, 'channel-a', 'explicit', 1_700_000_100_000, 1_700_000_090_000, 501, 'message-a', 'user-fixture')
  db.prepare(`
    INSERT INTO memory_evidence (id, claim_id, channel_id, source_kind, observed_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(102, 11, null, 'legacy', 1_700_000_200_000)
  db.prepare(`
    INSERT INTO memory_evidence (id, claim_id, channel_id, source_kind, observed_at, job_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(103, 14, 'channel-b', 'human', 1_700_000_300_000, 502)

  const saveEpisode = db.prepare(`
    INSERT INTO memory_episode (
      id, guild_id, channel_id, started_at, ended_at, summary, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, embedding = excluded.embedding,
      created_at = excluded.created_at, embedding_model_id = excluded.embedding_model_id,
      embedding_dim = excluded.embedding_dim, embedding_fingerprint = excluded.embedding_fingerprint
  `)
  saveEpisode.run(
    41,
    'guild-fixture',
    'channel-episode',
    1_720_000_000_000,
    1_720_000_300_000,
    'Episode before retry.',
    Buffer.from([4, 5]),
    1_720_000_350_000,
    'local-model',
    768,
    'wrong:size:768:recipe'
  )
  saveEpisode.run(
    41,
    'guild-fixture',
    'channel-episode',
    1_720_000_000_000,
    1_720_000_300_000,
    'Episode after retry.',
    Buffer.from([1, 2]),
    1_720_000_400_000,
    'local-model',
    768,
    'wrong:size:768:recipe'
  )

  const insertDigest = db.prepare(`
    INSERT INTO media_digest (
      id, guild_id, content_key, kind, label, summary, digest_json, embedding, created_at,
      embedding_model_id, embedding_dim, embedding_fingerprint
    ) VALUES (?, 'guild-fixture', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertDigest.run(
    21,
    'content-shared',
    'video',
    'Short clip',
    'A short fixture summary.',
    '{"fixture":1}',
    vector(0),
    1_730_000_000_000,
    'gemini-embedding-2',
    768,
    GEMINI_FINGERPRINT
  )
  insertDigest.run(
    22,
    'content-no-share',
    'audio',
    'Unshared audio',
    'Another fixture summary.',
    '{"fixture":2}',
    null,
    1_740_000_000_000,
    null,
    null,
    null
  )

  const insertOccurrence = db.prepare(`
    INSERT INTO media_occurrence (
      id, digest_id, guild_id, channel_id, message_id, shared_by_user_id, source_author_id, origin, observed_at
    ) VALUES (?, ?, 'guild-fixture', ?, ?, ?, ?, ?, ?)
  `)
  insertOccurrence.run(
    201,
    21,
    'channel-a',
    'message-media-a',
    'user-fixture',
    'user-author',
    'link',
    1_750_000_000_000
  )
  insertOccurrence.run(202, 21, 'channel-b', 'message-media-b', 'user-other', null, 'reply', 1_760_000_000_000)
}

describe('memory item backfill', () => {
  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
  })

  afterEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
    vi.restoreAllMocks()
  })

  it('round-trips the legacy fixture rows and support data into typed items', () => {
    seedFixture()
    const db = getDb()

    const report = migrateMemoryItems(db)

    expect(report.copied_items).toBe(10)
    expect(report.copied_evidence).toBe(3)
    expect(report.copied_occurrences).toBe(3)
    expect(report.copied_payloads).toBe(2)
    expect(report.copied_embeddings).toBe(4)
    expect(report.kind_counts).toEqual({ fact: 7, episode: 1, media: 2 })
    expect(report.subject_counts).toEqual({ user: 6, guild: 4 })
    expect(report.status_counts).toEqual({ candidate: 1, active: 6, superseded: 1, rejected: 2 })
    expect(report.period_counts).toEqual({ current: 9, past: 1 })
    expect(report.evidence_per_item).toEqual({ '0': 8, '1': 1, '2': 1 })
    expect(report.occurrences_per_item).toEqual({ '0': 8, '1': 1, '2': 1 })
    expect(report.non_null_provenance_counts).toEqual({ model_id: 3, dim: 4, fingerprint: 4, text_hash: 4 })
    expect(report.checks_failed).toBe(0)
    expect(report.round_trip_columns_checked).toBeGreaterThan(0)

    const oldFact = db
      .prepare(
        "SELECT id, legacy_id, period, created_at FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 11"
      )
      .get() as { id: number; legacy_id: number; period: string; created_at: number | null }
    expect(oldFact).toMatchObject({ legacy_id: 11, period: 'past', created_at: null })
    expect(oldFact.id).not.toBe(11)

    const successor = db
      .prepare("SELECT id FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 15")
      .get() as { id: number }
    expect(
      db.prepare("SELECT superseded_by FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 14").get()
    ).toEqual({ superseded_by: successor.id })

    expect(
      db
        .prepare(
          "SELECT last_seen_at, created_at FROM memory_item WHERE legacy_table = 'media_digest' AND legacy_id = 22"
        )
        .get()
    ).toEqual({ last_seen_at: 1_740_000_000_000, created_at: 1_740_000_000_000 })
    expect(
      db
        .prepare(
          "SELECT created_at, legacy_embedding_text FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 11"
        )
        .get()
    ).toEqual({ created_at: null, legacy_embedding_text: "This person's past tea: green." })
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM memory_item WHERE legacy_table = 'memory_episode' AND source_job_id = 41"
        )
        .get()
    ).toEqual({ count: 1 })
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM memory_item_embedding WHERE created_at IS NOT NULL').get()
    ).toEqual({
      count: 0
    })
  })

  it('copies only missing rows and is a no-op after a complete backfill', () => {
    seedFixture()
    const db = getDb()
    migrateMemoryItems(db)

    const report = migrateMemoryItems(db)

    expect(report.copied_items).toBe(0)
    expect(report.copied_evidence).toBe(0)
    expect(report.copied_occurrences).toBe(0)
    expect(report.copied_payloads).toBe(0)
    expect(report.copied_embeddings).toBe(0)
    expect(report.checks_failed).toBe(0)
  })

  it('rolls back newly copied rows when a planted round-trip miss is found', () => {
    seedFixture()
    const db = getDb()
    migrateMemoryItems(db)
    db.prepare(
      "UPDATE memory_item SET content = 'planted mismatch' WHERE legacy_table = 'memory_claim' AND legacy_id = 11"
    ).run()
    db.prepare(`
      INSERT INTO memory_claim (guild_id, subject_kind, subject_user_id, predicate, value, source_kind, status,
        first_seen_at, last_seen_at, period)
      VALUES ('guild-fixture', 'user', 'user-fixture', 'new_fact', 'new value', 'explicit', 'active', 1, 2, 'current')
    `).run()
    const before = db.prepare('SELECT COUNT(*) AS count FROM memory_item').get()

    expect(() => migrateMemoryItems(db)).toThrow('Memory item backfill verification failed')

    expect(db.prepare('SELECT COUNT(*) AS count FROM memory_item').get()).toEqual(before)
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 18")
        .get()
    ).toEqual({ count: 0 })
    expect(
      db.prepare("SELECT content FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 11").get()
    ).toEqual({ content: 'planted mismatch' })
  })

  it('does not read the clock while copying timestamps', () => {
    seedFixture()
    const db = getDb()
    const now = vi.spyOn(Date, 'now')

    migrateMemoryItems(db)

    expect(now).not.toHaveBeenCalled()
    expect(
      db
        .prepare(
          "SELECT first_seen_at, last_seen_at, last_recalled_at, ended_at, created_at FROM memory_item WHERE legacy_table = 'memory_claim' AND legacy_id = 11"
        )
        .get()
    ).toEqual({
      first_seen_at: 1_700_000_000_000 + 11 * DAY,
      last_seen_at: 1_700_000_000_500 + 11 * DAY,
      last_recalled_at: 1_700_000_001_000,
      ended_at: null,
      created_at: null
    })
  })
})
