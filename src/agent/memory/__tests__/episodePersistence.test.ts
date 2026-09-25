import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExtractionEpisode } from '../../../storage/extractionQueue.js'

const mocks = vi.hoisted(() => ({
  embedEpisodeText: vi.fn(),
  getSharedRateLimiter: vi.fn(),
  logger: { warn: vi.fn() }
}))

let testDb: Database.Database

vi.mock('../episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))
vi.mock('../../../storage/database.js', () => ({ getDb: () => testDb }))
vi.mock('../../../utils/logger.js', () => ({ logger: mocks.logger }))
vi.mock('../../../utils/rateLimiter.js', () => ({ getSharedRateLimiter: mocks.getSharedRateLimiter }))

import { enqueueEpisode } from '../../../storage/extractionQueue.js'
import { listEpisodesForGuild } from '../../../storage/memoryEpisodeStore.js'
import { persistEpisodeResult } from '../episodePersistence.js'

function oneLineEpisode(): ExtractionEpisode {
  return {
    messages: [
      {
        messageId: 'm-1',
        userId: 'u-1',
        displayName: 'Mio',
        content: 'We planned a picnic.',
        timestamp: 1000,
        isBot: false
      }
    ],
    context: [],
    startedAt: 1000,
    endedAt: 1000
  }
}

function vector768(): number[] {
  return Array.from({ length: 768 }, () => 0.25)
}

describe('episode persistence', () => {
  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        enqueued_at INTEGER NOT NULL
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
    `)
    mocks.embedEpisodeText.mockReset().mockResolvedValue(vector768())
    mocks.getSharedRateLimiter.mockReset()
    mocks.logger.warn.mockReset()
  })

  afterEach(() => testDb.close())

  it('stores the completed pipeline summary and embedding under the queue job ID', async () => {
    const job = enqueueEpisode({ guildId: 'guild-a', channelId: 'channel-a', episode: oneLineEpisode() })

    await persistEpisodeResult({
      job,
      result: { status: 'completed', summary: 'The group planned a picnic.', appliedOps: 0, duplicateOps: 0 }
    })

    expect(mocks.embedEpisodeText).toHaveBeenCalledWith({
      text: 'The group planned a picnic.',
      role: 'RETRIEVAL_DOCUMENT'
    })
    expect(listEpisodesForGuild('guild-a')).toEqual([
      expect.objectContaining({
        id: job.id,
        channelId: 'channel-a',
        startedAt: 1000,
        endedAt: 1000,
        summary: 'The group planned a picnic.',
        embedding: Array.from(new Float32Array(vector768()))
      })
    ])
    expect(mocks.getSharedRateLimiter).not.toHaveBeenCalled()
  })

  it('does not embed or store a dropped episode', async () => {
    const job = enqueueEpisode({ guildId: 'guild-a', channelId: 'channel-a', episode: oneLineEpisode() })

    await persistEpisodeResult({
      job,
      result: { status: 'dropped', summary: null, appliedOps: 0, duplicateOps: 0 }
    })

    expect(mocks.embedEpisodeText).not.toHaveBeenCalled()
    expect(listEpisodesForGuild('guild-a')).toEqual([])
  })

  it('keeps the admitted summary when document embedding fails', async () => {
    mocks.embedEpisodeText.mockRejectedValue(new Error('embedding unavailable'))
    const job = enqueueEpisode({ guildId: 'guild-a', channelId: 'channel-a', episode: oneLineEpisode() })

    await persistEpisodeResult({
      job,
      result: { status: 'completed', summary: 'The group planned a picnic.', appliedOps: 0, duplicateOps: 0 }
    })

    expect(listEpisodesForGuild('guild-a')).toEqual([
      expect.objectContaining({ id: job.id, summary: 'The group planned a picnic.', embedding: null })
    ])
    expect(mocks.logger.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('The group planned a picnic.')
    expect(mocks.getSharedRateLimiter).not.toHaveBeenCalled()
  })
})
