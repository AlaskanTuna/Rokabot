import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { config } = vi.hoisted(() => ({
  config: {
    memory: {
      extractionQueueMaxPerGuild: 2
    }
  }
}))

vi.mock('../../config.js', () => ({ config }))

let testDb: Database.Database

vi.mock('../database.js', () => ({
  getDb: () => testDb
}))

import {
  MAX_EXTRACTION_QUEUE_ATTEMPTS,
  claimNextForGuild,
  enqueueEpisode,
  enqueueExtraction,
  listGuildsWithPending,
  markDone,
  markFailed,
  resetStuckProcessing
} from '../extractionQueue.js'
import type { ExtractionEpisode } from '../extractionQueue.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
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
  return db
}

function payload(content: string) {
  return [{ userId: 'user-1', displayName: 'Roka Fan', content }]
}

function episode(content: string): ExtractionEpisode {
  const message = {
    messageId: 'message-1',
    userId: 'user-1',
    displayName: 'Roka Fan',
    content,
    timestamp: 100,
    isBot: false
  }
  return { messages: [message], context: [{ ...message, messageId: 'context-1' }], startedAt: 100, endedAt: 100 }
}

describe('extractionQueue', () => {
  beforeEach(() => {
    testDb = createTestDb()
    config.memory.extractionQueueMaxPerGuild = 2
  })

  afterEach(() => {
    testDb.close()
    vi.restoreAllMocks()
  })

  it('claims pending jobs in FIFO order and completes idempotently', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200)
    const first = enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('first') })
    const second = enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('second') })

    expect(claimNextForGuild('guild-1')).toMatchObject({ ...first, status: 'processing' })
    expect(claimNextForGuild('guild-1')).toMatchObject({ ...second, status: 'processing' })
    expect(markDone(first.id)).toBe(true)
    expect(markDone(first.id)).toBe(false)
    expect(testDb.prepare('SELECT status FROM extraction_queue WHERE id = ?').get(first.id)).toBeUndefined()
  })

  it('round-trips episode messages and context while preserving the legacy payload projection', () => {
    const input = episode('I like tea')
    const job = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: input })
    const stored = testDb.prepare('SELECT payload FROM extraction_queue WHERE id = ?').get(job.id) as {
      payload: string
    }

    expect(JSON.parse(stored.payload)).toEqual(input)
    expect(job.episode).toEqual(input)
    expect(job.payload).toEqual([{ userId: 'user-1', displayName: 'Roka Fan', content: 'I like tea' }])
    expect(claimNextForGuild('guild-1')?.episode).toEqual(input)
  })

  it('round-trips Jev admission through the persisted queue', () => {
    const queued = enqueueExtraction({
      guildId: 'guild-1',
      channelId: 'channel-1',
      payload: payload('durable detail'),
      admittedBy: 'jev'
    })

    expect(queued.admittedBy).toBe('jev')
    expect(claimNextForGuild('guild-1')?.admittedBy).toBe('jev')
  })

  it('maps a stored NULL Jev admission to undefined', () => {
    testDb
      .prepare(
        "INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at, admitted_by) VALUES (?, ?, ?, 'pending', ?, NULL)"
      )
      .run('guild-1', 'channel-1', JSON.stringify(payload('legacy row')), 100)

    expect(claimNextForGuild('guild-1')?.admittedBy).toBeUndefined()
  })

  it('wraps a legacy message array in an episode without changing its scheduler payload', () => {
    const legacyPayload = payload('legacy row')
    testDb
      .prepare(
        "INSERT INTO extraction_queue (guild_id, channel_id, payload, status, enqueued_at, admitted_by) VALUES (?, ?, ?, 'pending', ?, NULL)"
      )
      .run('guild-1', 'channel-1', JSON.stringify(legacyPayload), 123)

    const job = claimNextForGuild('guild-1')

    expect(job?.payload).toEqual(legacyPayload)
    expect(job?.episode).toEqual({
      messages: [
        {
          messageId: 'legacy-1-0',
          userId: 'user-1',
          displayName: 'Roka Fan',
          content: 'legacy row',
          timestamp: 123,
          isBot: false
        }
      ],
      context: [],
      startedAt: 123,
      endedAt: 123
    })
  })

  it('drops the oldest pending job only within an over-cap guild', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300)
    const oldest = enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('oldest') })
    const newest = enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('newest') })
    const otherGuild = enqueueExtraction({ guildId: 'guild-2', channelId: 'channel-2', payload: payload('other') })

    enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('overflow') })

    expect(claimNextForGuild('guild-1')?.id).toBe(newest.id)
    expect(testDb.prepare('SELECT id FROM extraction_queue WHERE id = ?').get(oldest.id)).toBeUndefined()
    expect(claimNextForGuild('guild-2')?.id).toBe(otherGuild.id)
  })

  it('lists only pending guilds and recovers stale processing jobs', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(1_000)
    enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('stale') })
    enqueueExtraction({ guildId: 'guild-2', channelId: 'channel-2', payload: payload('pending') })
    claimNextForGuild('guild-1')

    expect(listGuildsWithPending()).toEqual(['guild-2'])
    expect(resetStuckProcessing(500)).toBe(1)
    expect(listGuildsWithPending()).toEqual(['guild-1', 'guild-2'])
  })

  it('requeues failures until the attempt cap, then drops the job', () => {
    const job = enqueueExtraction({ guildId: 'guild-1', channelId: 'channel-1', payload: payload('retry') })

    for (let attempt = 1; attempt < MAX_EXTRACTION_QUEUE_ATTEMPTS; attempt++) {
      claimNextForGuild('guild-1')
      expect(markFailed(job.id)).toBe('pending')
    }

    claimNextForGuild('guild-1')
    expect(markFailed(job.id)).toBe('dropped')
    expect(testDb.prepare('SELECT * FROM extraction_queue WHERE id = ?').get(job.id)).toBeUndefined()
  })
})
