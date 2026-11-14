import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EpisodeLine } from '../../../storage/extractionQueue.js'

let testDb: Database.Database

const mocks = vi.hoisted(() => ({ startExtractionScheduler: vi.fn() }))

vi.mock('../../../storage/database.js', () => ({
  getDb: () => testDb
}))
vi.mock('../scheduler.js', () => ({ startExtractionScheduler: mocks.startExtractionScheduler }))

import { config } from '../../../config.js'
import { getEpisodeCursor, listOpenEpisodeLines } from '../../../storage/memoryEpisodeStore.js'
import {
  flushEpisode,
  recordEpisodeMessage,
  resetEpisodeTrackerForTest,
  restoreOpenEpisodes
} from '../episodeTracker.js'
import { resetAllBuffers } from '../passiveBuffer.js'

function queuedJobs(): Array<{ channelId: string; messages: EpisodeLine[] }> {
  const rows = testDb.prepare('SELECT channel_id, payload FROM extraction_queue ORDER BY id').all() as Array<{
    channel_id: string
    payload: string
  }>
  return rows.map(({ channel_id, payload }) => ({
    channelId: channel_id,
    messages: (JSON.parse(payload) as { messages: EpisodeLine[] }).messages
  }))
}

function savedLines(): Array<{ channelId: string; messageId: string }> {
  return testDb
    .prepare(
      'SELECT channel_id AS channelId, message_id AS messageId FROM memory_episode_line ORDER BY timestamp ASC, message_id COLLATE BINARY ASC'
    )
    .all() as Array<{ channelId: string; messageId: string }>
}

describe('episode crash restore', () => {
  const originalPrivacy = config.memory.privacy

  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE memory_episode_cursor (
        channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, last_message_id TEXT, opened_at INTEGER,
        message_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE memory_episode_line (
        channel_id TEXT NOT NULL, message_id TEXT NOT NULL, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
        display_name TEXT NOT NULL, content TEXT NOT NULL, timestamp INTEGER NOT NULL, is_bot INTEGER NOT NULL,
        PRIMARY KEY (channel_id, message_id)
      );
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        enqueued_at INTEGER NOT NULL, admitted_by TEXT DEFAULT NULL
      );
    `)
    resetAllBuffers()
    resetEpisodeTrackerForTest()
    mocks.startExtractionScheduler.mockClear()
  })

  afterEach(() => {
    Object.assign(config.memory, { privacy: originalPrivacy })
    resetEpisodeTrackerForTest()
    resetAllBuffers()
    testDb.close()
    vi.useRealTimers()
  })

  it('breaks equal-timestamp line order by message ID instead of row insertion order', () => {
    testDb
      .prepare(
        `INSERT INTO memory_episode_line
          (channel_id, message_id, guild_id, user_id, display_name, content, timestamp, is_bot)
         VALUES ('channel-1', ?, 'guild-1', ?, ?, ?, 1000, 0)`
      )
      .run('m-2', 'u-2', 'Second', 'second')
    testDb
      .prepare(
        `INSERT INTO memory_episode_line
          (channel_id, message_id, guild_id, user_id, display_name, content, timestamp, is_bot)
         VALUES ('channel-1', ?, 'guild-1', ?, ?, ?, 1000, 0)`
      )
      .run('m-1', 'u-1', 'First', 'first')

    expect(listOpenEpisodeLines().map(({ messageId }) => messageId)).toEqual(['m-1', 'm-2'])
  })

  it('recovers a crashed open episode and flushes its exact lines in order', () => {
    vi.useFakeTimers({ now: 1_000 })
    const first = {
      messageId: 'm-1',
      userId: 'u-1',
      displayName: 'Mio',
      content: 'first',
      timestamp: 1_000,
      isBot: false
    }
    const second = {
      messageId: 'm-2',
      userId: 'u-2',
      displayName: 'Roka',
      content: 'second',
      timestamp: 1_001,
      isBot: false
    }
    const third = {
      messageId: 'm-3',
      userId: 'u-1',
      displayName: 'Mio',
      content: 'third',
      timestamp: 1_002,
      isBot: false
    }
    for (const message of [first, second, third]) {
      recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message })
    }

    resetAllBuffers()
    resetEpisodeTrackerForTest()
    restoreOpenEpisodes()
    flushEpisode('c-1')

    expect(queuedJobs()).toEqual([{ channelId: 'c-1', messages: [first, second, third] }])
    expect(savedLines()).toEqual([])
    expect(getEpisodeCursor('c-1')).toMatchObject({ lastMessageId: 'm-3', messageCount: 0 })
  })

  it('keeps restored lines and appends messages recorded after the restart', () => {
    vi.useFakeTimers({ now: 1_000 })
    const earlier = [
      { messageId: 'm-1', userId: 'u-1', displayName: 'Mio', content: 'first', timestamp: 1_000, isBot: false },
      { messageId: 'm-2', userId: 'u-2', displayName: 'Roka', content: 'second', timestamp: 1_001, isBot: false },
      { messageId: 'm-3', userId: 'u-1', displayName: 'Mio', content: 'third', timestamp: 1_002, isBot: false }
    ]
    for (const message of earlier) recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message })

    resetAllBuffers()
    resetEpisodeTrackerForTest()
    restoreOpenEpisodes()

    const fourth = {
      messageId: 'm-4',
      userId: 'u-2',
      displayName: 'Roka',
      content: 'fourth',
      timestamp: 1_003,
      isBot: false
    }
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: fourth })
    flushEpisode('c-1')

    expect(queuedJobs()).toEqual([{ channelId: 'c-1', messages: [...earlier, fourth] }])
  })

  it('ignores a message delivered again after the restore', () => {
    vi.useFakeTimers({ now: 1_000 })
    const message = {
      messageId: 'm-1',
      userId: 'u-1',
      displayName: 'Mio',
      content: 'first',
      timestamp: 1_000,
      isBot: false
    }
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message })

    resetAllBuffers()
    resetEpisodeTrackerForTest()
    restoreOpenEpisodes()
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message })

    expect(savedLines()).toEqual([{ channelId: 'c-1', messageId: 'm-1' }])
    expect(getEpisodeCursor('c-1')).toMatchObject({ messageCount: 1 })
    expect(queuedJobs()).toEqual([])
  })

  it('flushes on the restored lull when the silence already passed during downtime', () => {
    vi.useFakeTimers({ now: 1_000 })
    const message = {
      messageId: 'm-1',
      userId: 'u-1',
      displayName: 'Mio',
      content: 'first',
      timestamp: 1_000,
      isBot: false
    }
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message })

    resetAllBuffers()
    resetEpisodeTrackerForTest()
    vi.setSystemTime(1_000 + config.memory.episodeLullMs + 1)
    restoreOpenEpisodes()

    expect(queuedJobs()).toEqual([])
    vi.advanceTimersByTime(1)

    expect(queuedJobs()).toEqual([{ channelId: 'c-1', messages: [message] }])
  })

  it('resets a cursor whose count has no lines without queueing a job', () => {
    testDb
      .prepare(
        'INSERT INTO memory_episode_cursor (channel_id, guild_id, last_message_id, opened_at, message_count) VALUES (?, ?, ?, ?, ?)'
      )
      .run('c-1', 'g-1', null, 1_000, 2)

    restoreOpenEpisodes()

    expect(getEpisodeCursor('c-1')).toMatchObject({ messageCount: 0, openedAt: null })
    expect(queuedJobs()).toEqual([])
  })

  it('deletes saved lines and resets cursors at privacy off without queueing', () => {
    vi.useFakeTimers({ now: 1_000 })
    recordEpisodeMessage({
      guildId: 'g-1',
      channelId: 'c-1',
      message: {
        messageId: 'm-1',
        userId: 'u-1',
        displayName: 'Mio',
        content: 'first',
        timestamp: 1_000,
        isBot: false
      }
    })
    recordEpisodeMessage({
      guildId: 'g-1',
      channelId: 'c-1',
      message: {
        messageId: 'm-2',
        userId: 'u-2',
        displayName: 'Roka',
        content: 'second',
        timestamp: 1_001,
        isBot: false
      }
    })

    resetAllBuffers()
    resetEpisodeTrackerForTest()
    Object.assign(config.memory, { privacy: 'off' })
    restoreOpenEpisodes()

    expect(savedLines()).toEqual([])
    expect(getEpisodeCursor('c-1')).toMatchObject({ messageCount: 0, openedAt: null })
    expect(queuedJobs()).toEqual([])
  })

  it('flushes only the flushed channel lines', () => {
    vi.useFakeTimers({ now: 1_000 })
    recordEpisodeMessage({
      guildId: 'g-1',
      channelId: 'c-1',
      message: {
        messageId: 'm-1',
        userId: 'u-1',
        displayName: 'Mio',
        content: 'first',
        timestamp: 1_000,
        isBot: false
      }
    })
    recordEpisodeMessage({
      guildId: 'g-1',
      channelId: 'c-2',
      message: {
        messageId: 'm-2',
        userId: 'u-2',
        displayName: 'Roka',
        content: 'other channel',
        timestamp: 1_001,
        isBot: false
      }
    })

    flushEpisode('c-1')

    expect(queuedJobs().map(({ channelId }) => channelId)).toEqual(['c-1'])
    expect(savedLines()).toEqual([{ channelId: 'c-2', messageId: 'm-2' }])
  })
})
