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
  getNextPendingAvailableAt,
  listGuildsWithPending,
  markDone,
  markFailed,
  pruneFailedExtractionJobs,
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
      enqueued_at INTEGER NOT NULL,
      available_at INTEGER NOT NULL DEFAULT 0,
      transient_retries INTEGER NOT NULL DEFAULT 0
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
    expect(markFailed(job.id)).toMatchObject({ status: 'pending', scheduledDelayMs: 0 })
    claimNextForGuild('g-1')
    expect(markFailed(job.id)).toMatchObject({ status: 'failed', scheduledDelayMs: 0 })
    expect(MAX_EXTRACTION_QUEUE_ATTEMPTS).toBe(2)
    expect(testDb.prepare('SELECT status, attempts FROM extraction_queue WHERE id = ?').get(job.id)).toEqual({
      status: 'failed',
      attempts: 2
    })
  })

  it('gives an episode Jev could not judge one delayed retry, then drops it', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const job = enqueueEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeFor('unjudged') })

    claimNextForGuild('g-1')
    expect(markFailed(job.id, 'unjudged')).toMatchObject({ status: 'pending', scheduledDelayMs: 300_000 })
    expect(testDb.prepare('SELECT attempts, available_at FROM extraction_queue WHERE id = ?').get(job.id)).toEqual({
      attempts: 1,
      available_at: 301_000
    })
    expect(claimNextForGuild('g-1')).toBeUndefined()

    now = 301_000
    expect(claimNextForGuild('g-1')?.id).toBe(job.id)
    expect(markFailed(job.id, 'unjudged')).toMatchObject({ status: 'dropped', scheduledDelayMs: 0 })
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM extraction_queue').get()).toEqual({ count: 0 })
  })

  it('exposes the transient retry count on a claimed job', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const job = enqueueEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeFor('counted') })

    expect(claimNextForGuild('g-1')?.transientRetries).toBe(0)
    markFailed(job.id, 'transient')
    now = 61_000
    expect(claimNextForGuild('g-1')?.transientRetries).toBe(1)
  })

  it('backs off transient failures without increasing ordinary attempts', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const job = enqueueEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeFor('transient') })

    claimNextForGuild('g-1')
    expect(markFailed(job.id, 'transient')).toMatchObject({ status: 'pending', scheduledDelayMs: 60_000 })
    expect(
      testDb.prepare('SELECT attempts, transient_retries, available_at FROM extraction_queue WHERE id = ?').get(job.id)
    ).toEqual({
      attempts: 0,
      transient_retries: 1,
      available_at: 61_000
    })
    expect(listGuildsWithPending()).toEqual([])
    expect(claimNextForGuild('g-1')).toBeUndefined()

    now += 60_000
    claimNextForGuild('g-1')
    expect(markFailed(job.id, 'transient')).toMatchObject({ status: 'pending', scheduledDelayMs: 300_000 })
    expect(
      testDb.prepare('SELECT attempts, transient_retries, available_at FROM extraction_queue WHERE id = ?').get(job.id)
    ).toEqual({
      attempts: 0,
      transient_retries: 2,
      available_at: 361_000
    })
  })

  it('counts transient errors as ordinary failures after four delayed retries', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const job = enqueueEpisode({ guildId: 'g-1', channelId: 'c-1', episode: episodeFor('exhausted') })
    const delays = [60_000, 300_000, 1_200_000, 3_600_000]

    for (const delay of delays) {
      expect(claimNextForGuild('g-1')).toBeDefined()
      expect(markFailed(job.id, 'transient')).toMatchObject({ status: 'pending', scheduledDelayMs: delay })
      now += delay
    }

    expect(claimNextForGuild('g-1')).toBeDefined()
    expect(markFailed(job.id, 'transient')).toMatchObject({ status: 'pending', scheduledDelayMs: 0 })
    expect(
      testDb.prepare('SELECT attempts, transient_retries, available_at FROM extraction_queue WHERE id = ?').get(job.id)
    ).toEqual({
      attempts: 1,
      transient_retries: 4,
      available_at: 0
    })

    expect(claimNextForGuild('g-1')).toBeDefined()
    expect(markFailed(job.id, 'transient')).toMatchObject({ status: 'failed', scheduledDelayMs: 0 })
    expect(
      testDb.prepare('SELECT attempts, transient_retries, status FROM extraction_queue WHERE id = ?').get(job.id)
    ).toEqual({
      attempts: 2,
      transient_retries: 4,
      status: 'failed'
    })
  })

  it('skips jobs that are not yet available while keeping ready jobs oldest-first', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const delayed = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('delayed') })
    const ready = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('ready') })
    testDb.prepare('UPDATE extraction_queue SET available_at = ? WHERE id = ?').run(2_000, delayed.id)

    expect(listGuildsWithPending()).toEqual(['guild-1'])
    expect(getNextPendingAvailableAt()).toBe(2_000)
    expect(claimNextForGuild('guild-1')?.id).toBe(ready.id)
    expect(claimNextForGuild('guild-1')).toBeUndefined()

    now = 2_000
    expect(listGuildsWithPending()).toEqual(['guild-1'])
    expect(claimNextForGuild('guild-1')?.id).toBe(delayed.id)
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
    expect(resetStuckProcessing()).toBe(1)
    expect(listGuildsWithPending()).toEqual(['guild-1', 'guild-2'])
  })

  it('recovers a job processed seconds before startup and preserves its attempts', () => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const job = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('recent') })

    claimNextForGuild('guild-1')
    expect(markFailed(job.id)).toMatchObject({ status: 'pending', scheduledDelayMs: 0 })
    claimNextForGuild('guild-1')
    now += 1_000

    expect(resetStuckProcessing()).toBe(1)
    expect(testDb.prepare('SELECT status, attempts FROM extraction_queue WHERE id = ?').get(job.id)).toEqual({
      status: 'pending',
      attempts: 1
    })
  })

  it('preserves delayed retry time and transient retries when resetting processing jobs', () => {
    const job = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('stuck retry') })
    testDb
      .prepare(
        "UPDATE extraction_queue SET status = 'processing', available_at = ?, transient_retries = ? WHERE id = ?"
      )
      .run(10_000, 3, job.id)

    expect(resetStuckProcessing()).toBe(1)
    expect(
      testDb.prepare('SELECT status, available_at, transient_retries FROM extraction_queue WHERE id = ?').get(job.id)
    ).toEqual({ status: 'pending', available_at: 10_000, transient_retries: 3 })
  })

  it('expires only failed jobs older than the retention window', () => {
    const cutoff = 10_000
    const oldFailed = enqueueEpisode({ guildId: 'guild-1', channelId: 'channel-1', episode: episodeFor('old failed') })
    const recentFailed = enqueueEpisode({
      guildId: 'guild-1',
      channelId: 'channel-1',
      episode: episodeFor('recent failed')
    })
    const oldPending = enqueueEpisode({
      guildId: 'guild-1',
      channelId: 'channel-1',
      episode: episodeFor('old pending')
    })
    testDb
      .prepare("UPDATE extraction_queue SET status = 'failed', enqueued_at = ? WHERE id = ?")
      .run(cutoff - 1, oldFailed.id)
    testDb
      .prepare("UPDATE extraction_queue SET status = 'failed', enqueued_at = ? WHERE id = ?")
      .run(cutoff, recentFailed.id)
    testDb.prepare('UPDATE extraction_queue SET enqueued_at = ? WHERE id = ?').run(cutoff - 100_000, oldPending.id)

    expect(pruneFailedExtractionJobs(7, cutoff + 7 * 24 * 60 * 60 * 1000)).toBe(1)
    expect(testDb.prepare('SELECT id FROM extraction_queue ORDER BY id').all()).toEqual([
      { id: recentFailed.id },
      { id: oldPending.id }
    ])
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
