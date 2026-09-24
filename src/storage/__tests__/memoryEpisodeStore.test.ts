import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../extractionQueue.js'

let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import {
  enqueueEpisodeAndAdvanceCursor,
  getEpisodeCursor,
  listEpisodeGuildIds,
  listEpisodesForGuild,
  recordOpenEpisodeMessage,
  saveMemoryEpisode
} from '../memoryEpisodeStore.js'

function episode(): ExtractionEpisode {
  return {
    messages: [
      {
        messageId: 'm-1',
        userId: 'u-1',
        displayName: 'Mio',
        content: 'I like tea',
        timestamp: 1_000,
        isBot: false
      }
    ],
    context: [],
    startedAt: 1_000,
    endedAt: 1_000
  }
}

describe('memoryEpisodeStore', () => {
  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE memory_episode_cursor (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        last_message_id TEXT,
        opened_at INTEGER,
        message_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE memory_episode (
        id INTEGER PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        summary TEXT NOT NULL,
        embedding BLOB,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        enqueued_at INTEGER NOT NULL,
        admitted_by TEXT DEFAULT NULL
      );
    `)
  })

  afterEach(() => testDb.close())

  it('records an open cursor and increments its unique message count', () => {
    expect(recordOpenEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', openedAt: 1_000 })).toMatchObject({
      guildId: 'g-1',
      channelId: 'c-1',
      lastMessageId: null,
      openedAt: 1_000,
      messageCount: 1
    })

    recordOpenEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', openedAt: 2_000 })

    expect(getEpisodeCursor('c-1')).toMatchObject({ openedAt: 1_000, messageCount: 2 })
  })

  it('enqueues an episode and advances its cursor atomically', () => {
    recordOpenEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', openedAt: 1_000 })

    const job = enqueueEpisodeAndAdvanceCursor({
      guildId: 'g-1',
      channelId: 'c-1',
      episode: episode(),
      lastMessageId: 'm-1'
    })

    expect(testDb.prepare('SELECT COUNT(*) AS count FROM extraction_queue').get()).toEqual({ count: 1 })
    expect(getEpisodeCursor('c-1')).toMatchObject({ lastMessageId: 'm-1', openedAt: null, messageCount: 0 })
    expect(job.episode.messages[0]?.messageId).toBe('m-1')
  })

  it('rolls back episode enqueue when cursor advancement fails', () => {
    recordOpenEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', openedAt: 1_000 })
    testDb.exec(`
      CREATE TRIGGER fail_episode_cursor BEFORE UPDATE ON memory_episode_cursor
      BEGIN SELECT RAISE(ABORT, 'cursor failure'); END;
    `)

    expect(() =>
      enqueueEpisodeAndAdvanceCursor({
        guildId: 'g-1',
        channelId: 'c-1',
        episode: episode(),
        lastMessageId: 'm-1'
      })
    ).toThrow('cursor failure')
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM extraction_queue').get()).toEqual({ count: 0 })
  })

  it('round-trips a guild episode and its 768 float values idempotently', () => {
    const vector = Array.from({ length: 768 }, (_, index) => index / 768)
    const input = {
      id: 41,
      guildId: 'guild-a',
      channelId: 'channel-a',
      startedAt: 10_000,
      endedAt: 12_000,
      summary: 'The group planned a picnic.',
      embedding: vector
    }

    saveMemoryEpisode(input)
    saveMemoryEpisode({ ...input, summary: 'The group moved the picnic.' })

    expect(listEpisodesForGuild('guild-a')).toEqual([
      expect.objectContaining({
        id: 41,
        guildId: 'guild-a',
        summary: 'The group moved the picnic.',
        embedding: Array.from(new Float32Array(vector))
      })
    ])
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM memory_episode').get()).toEqual({ count: 1 })
  })

  it('returns only episodes for the requested guild', () => {
    saveMemoryEpisode({
      id: 1,
      guildId: 'guild-a',
      channelId: 'channel-a',
      startedAt: 10,
      endedAt: 20,
      summary: 'Guild A episode.',
      embedding: null
    })
    saveMemoryEpisode({
      id: 2,
      guildId: 'guild-b',
      channelId: 'channel-b',
      startedAt: 10,
      endedAt: 20,
      summary: 'Guild B episode.',
      embedding: null
    })

    expect(listEpisodesForGuild('guild-a').map(({ guildId }) => guildId)).toEqual(['guild-a'])
    expect(listEpisodeGuildIds()).toEqual(['guild-a', 'guild-b'])
  })

  it('decodes malformed, zero-norm, and non-finite vectors as missing', () => {
    for (const id of [1, 2, 3]) {
      saveMemoryEpisode({
        id,
        guildId: 'guild-a',
        channelId: 'channel-a',
        startedAt: 10,
        endedAt: 20,
        summary: `Episode ${id}.`,
        embedding: null
      })
    }

    testDb.prepare("UPDATE memory_episode SET embedding = X'0102' WHERE id = 1").run()
    testDb.prepare('UPDATE memory_episode SET embedding = ? WHERE id = 2').run(Buffer.alloc(3072))
    const nonFinite = Buffer.alloc(3072)
    nonFinite.writeFloatLE(Number.POSITIVE_INFINITY, 0)
    testDb.prepare('UPDATE memory_episode SET embedding = ? WHERE id = 3').run(nonFinite)

    expect(listEpisodesForGuild('guild-a').map(({ embedding }) => embedding)).toEqual([null, null, null])
  })

  it('rejects an episode ID reused for a different episode identity', () => {
    const input = {
      id: 41,
      guildId: 'guild-a',
      channelId: 'channel-a',
      startedAt: 10_000,
      endedAt: 12_000,
      summary: 'The group planned a picnic.',
      embedding: null
    }

    saveMemoryEpisode(input)

    expect(() => saveMemoryEpisode({ ...input, channelId: 'channel-b' })).toThrow('Episode queue ID collision')
  })

  it('rejects vectors with invalid dimensions or non-finite values', () => {
    const input = {
      id: 41,
      guildId: 'guild-a',
      channelId: 'channel-a',
      startedAt: 10_000,
      endedAt: 12_000,
      summary: 'The group planned a picnic.'
    }

    expect(() => saveMemoryEpisode({ ...input, embedding: Array(767).fill(0.25) })).toThrow(
      'Episode embedding must contain 768 finite values'
    )
    expect(() => saveMemoryEpisode({ ...input, embedding: Array(768).fill(Number.NaN) })).toThrow(
      'Episode embedding must contain 768 finite values'
    )
  })
})
