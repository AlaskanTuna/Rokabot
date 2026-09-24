import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let testDb: Database.Database

vi.mock('../database.js', () => ({ getDb: () => testDb }))

import {
  MAX_EXTRACTION_QUEUE_ATTEMPTS,
  claimNextForGuild,
  enqueueEpisode,
  listGuildsWithPending,
  markDone,
  markFailed,
  resetStuckProcessing
} from '../extractionQueue.js'
import type { ExtractionEpisode } from '../extractionQueue.js'

const reopenPath = join(process.cwd(), 'data', '.extraction-queue-reopen.test.db')

function createTestDb(path = ':memory:'): Database.Database {
  const db = new Database(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      enqueued_at INTEGER NOT NULL
    );
  `)
  return db
}

function episodeFor(content: string): ExtractionEpisode {
  const message = {
    messageId: 'message-1',
    userId: 'user-1',
    displayName: 'Mio',
    content,
    timestamp: 100,
    isBot: false
  }
  return { messages: [message], context: [], startedAt: 100, endedAt: 100 }
}

describe('extractionQueue', () => {
  beforeEach(() => {
    testDb = createTestDb()
  })

  afterEach(() => {
    testDb.close()
    rmSync(reopenPath, { force: true })
    vi.restoreAllMocks()
  })

  it('claims episode jobs in FIFO order and completes idempotently', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200)
    const first = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('first') })
    const second = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('second') })

    expect(claimNextForGuild('guild-1')).toMatchObject({ ...first, status: 'processing' })
    expect(claimNextForGuild('guild-1')).toMatchObject({ ...second, status: 'processing' })
    expect(markDone(first.id)).toBe(true)
    expect(markDone(first.id)).toBe(false)
    expect(testDb.prepare('SELECT status FROM extraction_queue WHERE id = ?').get(first.id)).toBeUndefined()
  })

  it('round-trips complete episode messages and context', () => {
    const input = episodeFor('I like tea')
    const episode = { ...input, context: [{ ...input.messages[0], messageId: 'context-1' }] }
    const job = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })
    const stored = testDb.prepare('SELECT payload FROM extraction_queue WHERE id = ?').get(job.id) as {
      payload: string
    }

    expect(JSON.parse(stored.payload)).toEqual(episode)
    expect(job.episode).toEqual(episode)
    expect(claimNextForGuild('guild-1')?.episode).toEqual(episode)
  })

  it('retains a failed episode after the one queue retry', () => {
    const job = enqueueEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeFor('retry') })

    claimNextForGuild('g-1')
    expect(markFailed(job.id)).toBe('pending')
    claimNextForGuild('g-1')
    expect(markFailed(job.id)).toBe('failed')
    expect(MAX_EXTRACTION_QUEUE_ATTEMPTS).toBe(2)
    expect(testDb.prepare('SELECT status, attempts FROM extraction_queue WHERE id = ?').get(job.id)).toEqual({
      status: 'failed',
      attempts: 2
    })
  })

  it('does not evict older episodes when the queue grows', () => {
    for (let index = 0; index < 100; index++) {
      enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor(`message ${index}`) })
    }

    expect(testDb.prepare('SELECT COUNT(*) AS count FROM extraction_queue').get()).toEqual({ count: 100 })
    expect(claimNextForGuild('guild-1')?.episode.messages[0].content).toBe('message 0')
  })

  it('lists only pending guilds and recovers stale processing jobs', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(1_000)
    enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('stale') })
    enqueueEpisode({ guildId: 'guild-2', channelId: 'channel-2', episode: episodeFor('pending') })
    claimNextForGuild('guild-1')

    expect(listGuildsWithPending()).toEqual(['guild-2'])
    expect(resetStuckProcessing(500)).toBe(1)
    expect(listGuildsWithPending()).toEqual(['guild-1', 'guild-2'])
  })

  it('preserves an episode payload across database close and reopen', () => {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true })
    rmSync(reopenPath, { force: true })
    testDb.close()
    testDb = createTestDb(reopenPath)
    const episode = episodeFor('persisted episode')
    enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode })
    testDb.close()
    testDb = createTestDb(reopenPath)

    expect(claimNextForGuild('guild-1')?.episode).toEqual(episode)
  })
})
