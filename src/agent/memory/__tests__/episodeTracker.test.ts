import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EpisodeLine } from '../../../storage/extractionQueue.js'

let testDb: Database.Database

vi.mock('../../../storage/database.js', () => ({
  getDb: () => testDb
}))

import { getEpisodeCursor } from '../../../storage/memoryEpisodeStore.js'
import { addMessage, getMessages, getUserMap, resetAllBuffers } from '../../passiveBuffer.js'
import { flushEpisode, flushOpenEpisodes, recordEpisodeMessage, resetEpisodeTrackerForTest } from '../episodeTracker.js'

function line(overrides: Partial<EpisodeLine> = {}): EpisodeLine {
  return {
    messageId: 'm-0',
    userId: 'u-1',
    displayName: 'Mio',
    content: 'I like tea',
    timestamp: 1_000,
    isBot: false,
    ...overrides
  }
}

function queueEpisodes(): Array<{ messages: EpisodeLine[]; context: EpisodeLine[] }> {
  const rows = testDb.prepare('SELECT payload FROM extraction_queue ORDER BY id').all() as Array<{ payload: string }>
  return rows.map(({ payload }) => JSON.parse(payload) as { messages: EpisodeLine[]; context: EpisodeLine[] })
}

describe('episodeTracker', () => {
  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE memory_episode_cursor (
        channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, last_message_id TEXT, opened_at INTEGER,
        message_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
        payload TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        enqueued_at INTEGER NOT NULL, admitted_by TEXT DEFAULT NULL
      );
    `)
    resetAllBuffers()
    resetEpisodeTrackerForTest()
  })

  afterEach(() => {
    resetEpisodeTrackerForTest()
    resetAllBuffers()
    testDb.close()
    vi.useRealTimers()
  })

  it('waits for the configured lull before enqueueing an episode', () => {
    vi.useFakeTimers({ now: 1_000 })
    const first = line({ messageId: 'm-1' })

    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: first })
    vi.advanceTimersByTime(179_999)
    expect(queueEpisodes()).toEqual([])
    vi.advanceTimersByTime(1)

    expect(queueEpisodes().map(({ messages }) => messages)).toEqual([[first]])
  })

  it('closes the old delta before accepting a message after an overdue lull', () => {
    vi.useFakeTimers({ now: 1_000 })
    const first = line({ messageId: 'm-1', timestamp: 1_000 })
    const second = line({ messageId: 'm-2', timestamp: 182_001 })

    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: first })
    vi.setSystemTime(182_001)
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: second })

    expect(queueEpisodes().map(({ messages }) => messages)).toEqual([[first]])
    expect(getEpisodeCursor('c-1')).toMatchObject({ lastMessageId: 'm-1', messageCount: 1 })
  })

  it('keeps equal-timestamp messages in one delta', () => {
    vi.useFakeTimers({ now: 1_000 })
    const first = line({ messageId: 'm-1', timestamp: 1_000 })
    const second = line({ messageId: 'm-2', timestamp: 1_000 })

    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: first })
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: second })
    flushEpisode('c-1')

    expect(queueEpisodes().map(({ messages }) => messages)).toEqual([[first, second]])
  })

  it('closes an episode immediately at the maximum delta size', () => {
    vi.useFakeTimers({ now: 1_000 })
    const messages = Array.from({ length: 25 }, (_, index) => line({ messageId: `m-${index + 1}` }))

    for (const message of messages) recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message })

    expect(queueEpisodes().map(({ messages: delta }) => delta)).toEqual([messages])
    expect(getEpisodeCursor('c-1')).toMatchObject({ lastMessageId: 'm-25', messageCount: 0 })
  })

  it('keeps the last three context lines and preserves bot identity in context and delta', () => {
    vi.useFakeTimers({ now: 1_000 })
    testDb
      .prepare(
        'INSERT INTO memory_episode_cursor (channel_id, guild_id, last_message_id, opened_at, message_count) VALUES (?, ?, ?, NULL, 0)'
      )
      .run('c-1', 'g-1', 'pre-4')
    const prior = Array.from({ length: 5 }, (_, index) =>
      line({ messageId: `pre-${index}`, content: `prior ${index}`, isBot: index === 3 })
    )
    for (const message of prior) {
      addMessage('c-1', message.userId, message.displayName, 'mio', message.content, {
        messageId: message.messageId,
        timestamp: message.timestamp,
        isBot: message.isBot
      })
    }
    const human = line({ messageId: 'm-1', content: 'I like tea' })
    const bot = line({ messageId: 'm-2', userId: 'bot-1', displayName: 'Roka', content: 'Oh?', isBot: true })

    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: human })
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: bot })
    flushEpisode('c-1')

    expect(queueEpisodes()).toEqual([
      { messages: [human, bot], context: prior.slice(-3), startedAt: 1_000, endedAt: 1_000 }
    ])
    expect(getUserMap('c-1').has('Roka')).toBe(false)
  })

  it('ignores a duplicate message ID', () => {
    vi.useFakeTimers({ now: 1_000 })
    const first = line({ messageId: 'm-1' })

    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: first })
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: line({ messageId: 'm-1', content: 'changed' }) })
    flushEpisode('c-1')

    expect(queueEpisodes().map(({ messages }) => messages)).toEqual([[first]])
  })

  it('flushes every open channel exactly once', () => {
    vi.useFakeTimers({ now: 1_000 })
    recordEpisodeMessage({ guildId: 'g-1', channelId: 'c-1', message: line({ messageId: 'm-1' }) })
    recordEpisodeMessage({ guildId: 'g-2', channelId: 'c-2', message: line({ messageId: 'm-2' }) })

    flushOpenEpisodes()
    flushOpenEpisodes()

    expect(queueEpisodes()).toHaveLength(2)
  })

  it('generates deterministic IDs for buffer messages without Discord IDs', () => {
    addMessage('c-1', 'u-1', 'Mio', 'mio', 'first')
    addMessage('c-1', 'u-1', 'Mio', 'mio', 'second')

    expect(getMessages('c-1').map(({ messageId }) => messageId)).toEqual(['c-1-local-1', 'c-1-local-2'])
  })
})
