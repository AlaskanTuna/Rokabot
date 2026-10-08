import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import {
  findMediaDigest,
  findMediaSharedBy,
  forgetMediaForUser,
  listMediaDigestsForGuild,
  listMediaGuildIds,
  listMediaRecallCandidates,
  pruneExpiredMediaDigests,
  recordMediaOccurrence,
  saveMediaDigest,
  setMediaDigestEmbedding
} from '../mediaDigestStore.js'

function digestInput(overrides: Partial<Parameters<typeof saveMediaDigest>[0]> = {}) {
  return {
    guildId: 'guild-1',
    contentKey: 'youtube:video-1',
    kind: 'video' as const,
    label: 'Cat video',
    summary: 'A cat explores a night garden.',
    digestJson: '{"title":"Cat video"}',
    createdAt: 1_000,
    ...overrides
  }
}

function occurrenceInput(digestId: number, overrides: Partial<Parameters<typeof recordMediaOccurrence>[0]> = {}) {
  return {
    digestId,
    guildId: 'guild-1',
    channelId: 'channel-1',
    messageId: 'message-1',
    sharedByUserId: 'user-1',
    sourceAuthorId: 'author-1',
    origin: 'link' as const,
    observedAt: 2_000,
    ...overrides
  }
}

describe('mediaDigestStore', () => {
  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE media_digest (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        content_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        summary TEXT NOT NULL,
        digest_json TEXT NOT NULL,
        embedding BLOB,
        created_at INTEGER NOT NULL,
        UNIQUE (guild_id, content_key)
      );
      CREATE TABLE media_occurrence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        digest_id INTEGER NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        shared_by_user_id TEXT NOT NULL,
        source_author_id TEXT,
        origin TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        UNIQUE (digest_id, message_id)
      );
      CREATE INDEX idx_media_occurrence_digest ON media_occurrence (digest_id);
      CREATE INDEX idx_media_occurrence_guild_user ON media_occurrence (guild_id, shared_by_user_id);
    `)
  })

  afterEach(() => testDb.close())

  it('upserts a guild content key in place and keeps a missing embedding null', () => {
    const first = saveMediaDigest(digestInput())
    const second = saveMediaDigest(digestInput({ label: 'Updated cat video', summary: 'A cat climbs a tree.' }))

    expect(first).not.toBeNull()
    expect(second).toMatchObject({ id: first?.id, label: 'Updated cat video', summary: 'A cat climbs a tree.' })
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM media_digest').get()).toEqual({ count: 1 })
    expect(testDb.prepare('SELECT embedding FROM media_digest').get()).toEqual({ embedding: null })
  })

  it('keeps the same content key independent across guilds', () => {
    const first = saveMediaDigest(digestInput())
    const second = saveMediaDigest(digestInput({ guildId: 'guild-2', label: 'Guild two cat video' }))

    expect(first?.id).not.toBe(second?.id)
    expect(findMediaDigest('guild-1', 'youtube:video-1')?.label).toBe('Cat video')
    expect(findMediaDigest('guild-2', 'youtube:video-1')?.label).toBe('Guild two cat video')
  })

  it('finds guild digests shared by or authored by a user when every term matches', () => {
    const shared = saveMediaDigest(digestInput())
    const authored = saveMediaDigest(
      digestInput({ contentKey: 'youtube:video-2', label: 'Garden walk', summary: 'Someone watches a CAT at night.' })
    )
    const partial = saveMediaDigest(
      digestInput({ contentKey: 'youtube:video-3', label: 'Cat in daylight', summary: 'A sunny afternoon.' })
    )
    const otherGuild = saveMediaDigest(digestInput({ guildId: 'guild-2', contentKey: 'youtube:video-4' }))

    recordMediaOccurrence(occurrenceInput(shared!.id, { sharedByUserId: 'user-1' }))
    recordMediaOccurrence(
      occurrenceInput(authored!.id, { messageId: 'message-2', sharedByUserId: 'user-2', sourceAuthorId: 'user-1' })
    )
    recordMediaOccurrence(occurrenceInput(partial!.id, { messageId: 'message-3', sharedByUserId: 'user-1' }))
    recordMediaOccurrence(occurrenceInput(otherGuild!.id, { guildId: 'guild-2', messageId: 'message-4' }))

    expect(findMediaSharedBy('guild-1', 'user-1', ['CAT', 'night'], 10).map(({ id }) => id)).toEqual([
      shared?.id,
      authored?.id
    ])
  })

  it('matches accented search terms without regard to case', () => {
    const digest = saveMediaDigest(digestInput({ summary: 'CAFÉ reviews from yesterday.' }))!
    recordMediaOccurrence(occurrenceInput(digest.id, { sharedByUserId: 'user-1' }))

    expect(findMediaSharedBy('guild-1', 'user-1', ['café'], 10).map(({ id }) => id)).toEqual([digest.id])
  })

  it('records each digest and message pair once and refreshes it when shared again', () => {
    const digest = saveMediaDigest(digestInput())!
    recordMediaOccurrence(occurrenceInput(digest.id, { observedAt: 2_000 }))
    recordMediaOccurrence(occurrenceInput(digest.id, { observedAt: 3_000, origin: 'upload' }))
    recordMediaOccurrence(occurrenceInput(digest.id, { messageId: 'message-2', observedAt: 2_500 }))

    expect(testDb.prepare('SELECT COUNT(*) AS count FROM media_occurrence').get()).toEqual({ count: 2 })
    expect(findMediaDigest('guild-1', 'youtube:video-1')?.lastSharedAt).toBe(3_000)
  })

  it('rejects an occurrence that names a different guild than its digest', () => {
    const digest = saveMediaDigest(digestInput())!

    expect(() => recordMediaOccurrence(occurrenceInput(digest.id, { guildId: 'guild-2' }))).toThrow(
      'Media digest guild mismatch'
    )
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM media_occurrence').get()).toEqual({ count: 0 })
  })

  it('round-trips embeddings as float32 values and supports maintenance updates', () => {
    const vector = Array.from({ length: 768 }, (_, index) => (index + 1) / 768)
    const digest = saveMediaDigest(digestInput({ embedding: vector }))!

    expect(digest.embedding).toEqual(Array.from(new Float32Array(vector)))
    expect(
      setMediaDigestEmbedding({ guildId: 'guild-1', id: digest.id, summary: digest.summary, embedding: vector })
    ).toBe(true)
    expect(findMediaDigest('guild-1', 'youtube:video-1')?.embedding).toEqual(Array.from(new Float32Array(vector)))
  })

  it('drops an embedding when the summary it was made from is replaced', () => {
    const vector = Array(768).fill(0.25)
    saveMediaDigest(digestInput({ embedding: vector }))
    saveMediaDigest(digestInput({ summary: 'A cat explores a night garden.' }))
    expect(findMediaDigest('guild-1', 'youtube:video-1')?.embedding).not.toBeNull()

    const rewatched = saveMediaDigest(digestInput({ summary: 'A dog digs in the snow.' }))!

    expect(rewatched.embedding).toBeNull()
    expect(
      setMediaDigestEmbedding({
        guildId: 'guild-1',
        id: rewatched.id,
        summary: 'A cat explores a night garden.',
        embedding: vector
      })
    ).toBe(false)
    expect(findMediaDigest('guild-1', 'youtube:video-1')?.embedding).toBeNull()
  })

  it('lists recall candidates with an embedding and their latest share', () => {
    const vector = Array(768).fill(0.25)
    const embedded = saveMediaDigest(digestInput({ embedding: vector }))!
    saveMediaDigest(digestInput({ contentKey: 'youtube:video-2' }))
    recordMediaOccurrence(occurrenceInput(embedded.id, { observedAt: 4_000 }))

    expect(listMediaRecallCandidates('guild-1')).toEqual([
      {
        id: embedded.id,
        label: 'Cat video',
        summary: 'A cat explores a night garden.',
        embedding: Array.from(new Float32Array(vector)),
        lastSharedAt: 4_000
      }
    ])
    expect(listMediaRecallCandidates('dm:user-1')).toEqual([])
  })

  it('rejects embeddings with invalid dimensions, non-finite values, or float32 overflow', () => {
    expect(() => saveMediaDigest(digestInput({ embedding: Array(767).fill(0.25) }))).toThrow()
    expect(() => saveMediaDigest(digestInput({ embedding: Array(768).fill(Number.NaN) }))).toThrow()
    expect(() =>
      setMediaDigestEmbedding({ guildId: 'guild-1', id: 1, summary: '', embedding: [Number.MAX_VALUE] })
    ).toThrow()
  })

  it('treats dm guild IDs as empty or no-op for guild-scoped operations', () => {
    const digest = saveMediaDigest(digestInput())!

    expect(saveMediaDigest(digestInput({ guildId: 'dm:user-1' }))).toBeNull()
    recordMediaOccurrence(occurrenceInput(digest.id, { guildId: 'dm:user-1' }))

    expect(findMediaDigest('dm:user-1', 'youtube:video-1')).toBeNull()
    expect(listMediaDigestsForGuild('dm:user-1')).toEqual([])
    expect(listMediaGuildIds()).toEqual(['guild-1'])
    expect(
      setMediaDigestEmbedding({
        guildId: 'dm:user-1',
        id: digest.id,
        summary: digest.summary,
        embedding: Array(768).fill(1)
      })
    ).toBe(false)
    expect(findMediaSharedBy('dm:user-1', 'user-1', ['cat'], 10)).toEqual([])
    expect(forgetMediaForUser('dm:user-1', 'user-1', [digest.id])).toBe(0)
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM media_occurrence').get()).toEqual({ count: 0 })
  })

  it('prunes expired occurrences and only deletes digests without a recent occurrence', () => {
    const expired = saveMediaDigest(digestInput({ contentKey: 'youtube:expired' }))!
    const retained = saveMediaDigest(digestInput({ contentKey: 'youtube:retained' }))!
    recordMediaOccurrence(occurrenceInput(expired.id, { messageId: 'expired-message', observedAt: 99 }))
    recordMediaOccurrence(occurrenceInput(retained.id, { messageId: 'old-message', observedAt: 99 }))
    recordMediaOccurrence(occurrenceInput(retained.id, { messageId: 'recent-message', observedAt: 100 }))

    expect(pruneExpiredMediaDigests(100)).toBe(1)
    expect(listMediaDigestsForGuild('guild-1').map(({ id, lastSharedAt }) => ({ id, lastSharedAt }))).toEqual([
      { id: retained.id, lastSharedAt: 100 }
    ])
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM media_occurrence').get()).toEqual({ count: 1 })
  })

  it('forgets matching user occurrences and returns distinct digests touched', () => {
    const shared = saveMediaDigest(digestInput({ contentKey: 'youtube:shared' }))!
    const authored = saveMediaDigest(digestInput({ contentKey: 'youtube:authored' }))!
    const untouched = saveMediaDigest(digestInput({ contentKey: 'youtube:untouched' }))!
    recordMediaOccurrence(occurrenceInput(shared.id, { messageId: 'shared-by-user-1', sharedByUserId: 'user-1' }))
    recordMediaOccurrence(occurrenceInput(shared.id, { messageId: 'shared-by-user-2', sharedByUserId: 'user-2' }))
    recordMediaOccurrence(
      occurrenceInput(authored.id, {
        messageId: 'authored-by-user-1',
        sharedByUserId: 'user-2',
        sourceAuthorId: 'user-1'
      })
    )
    recordMediaOccurrence(occurrenceInput(untouched.id, { messageId: 'untouched', sharedByUserId: 'user-2' }))

    expect(forgetMediaForUser('guild-1', 'user-1', [shared.id, authored.id])).toBe(2)
    expect(listMediaDigestsForGuild('guild-1').map(({ id }) => id)).toEqual([shared.id, untouched.id])
    expect(testDb.prepare('SELECT message_id FROM media_occurrence WHERE digest_id = ?').all(shared.id)).toEqual([
      { message_id: 'shared-by-user-2' }
    ])
    expect(findMediaDigest('guild-1', 'youtube:authored')).toBeNull()
  })
})
