import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../extractionQueue.js'

let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import { enqueueEpisodeAndAdvanceCursor, getEpisodeCursor, recordOpenEpisodeMessage } from '../memoryEpisodeStore.js'

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
})
