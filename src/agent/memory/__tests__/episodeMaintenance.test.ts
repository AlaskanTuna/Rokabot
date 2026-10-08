import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configMock = vi.hoisted(() => ({ memory: { episodeRetentionDays: 90, mediaRetentionDays: 90 } }))
const mocks = vi.hoisted(() => ({
  embedEpisodeText: vi.fn(),
  logger: { warn: vi.fn() }
}))

let testDb: Database.Database

vi.mock('../../../config.js', () => ({ config: configMock }))
vi.mock('../../../storage/database.js', () => ({ getDb: () => testDb }))
vi.mock('../episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))
vi.mock('../../../utils/logger.js', () => ({ logger: mocks.logger }))

import { findMediaDigest, recordMediaOccurrence, saveMediaDigest } from '../../../storage/mediaDigestStore.js'
import * as episodeStore from '../../../storage/memoryEpisodeStore.js'
import { listEpisodesForGuild, saveMemoryEpisode } from '../../../storage/memoryEpisodeStore.js'
import { pruneEpisodesAndReembed } from '../episodeMaintenance.js'

const DAY_MS = 86_400_000
const now = Date.UTC(2026, 8, 25)
const vector768 = () => Array.from({ length: 768 }, () => 0.25)

function seedEpisode(input: { id: number; guildId: string; endedAt: number; summary: string }) {
  return saveMemoryEpisode({
    id: input.id,
    guildId: input.guildId,
    channelId: `channel-${input.guildId}`,
    startedAt: input.endedAt - 1000,
    endedAt: input.endedAt,
    summary: input.summary,
    embedding: null
  })
}

function seedMedia(input: {
  guildId: string
  contentKey: string
  summary: string
  embedding: number[] | null
  observedAt: number[]
}) {
  const digest = saveMediaDigest({
    guildId: input.guildId,
    contentKey: input.contentKey,
    kind: 'video',
    label: 'Cat video',
    summary: input.summary,
    digestJson: '{}',
    embedding: input.embedding,
    createdAt: now
  })
  if (!digest) throw new Error('Expected a digest')
  for (const [index, observedAt] of input.observedAt.entries()) {
    recordMediaOccurrence({
      digestId: digest.id,
      guildId: input.guildId,
      channelId: 'channel-1',
      messageId: `${input.contentKey}-${index}`,
      sharedByUserId: 'user-1',
      sourceAuthorId: null,
      origin: 'link',
      observedAt
    })
  }
  return digest
}

describe('episode maintenance', () => {
  beforeEach(() => {
    testDb = new Database(':memory:')
    testDb.exec(`
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
    `)
    configMock.memory.episodeRetentionDays = 90
    configMock.memory.mediaRetentionDays = 90
    mocks.embedEpisodeText.mockReset()
    mocks.logger.warn.mockClear()
  })

  afterEach(() => testDb.close())

  it('removes expired episodes and repairs retained rows without failing the pass', async () => {
    seedEpisode({ id: 1, guildId: 'guild-a', endedAt: now - 91 * DAY_MS, summary: 'expired episode' })
    seedEpisode({ id: 2, guildId: 'guild-a', endedAt: now - DAY_MS, summary: 'retained episode A' })
    seedEpisode({ id: 3, guildId: 'guild-a', endedAt: now - DAY_MS, summary: 'retained episode B' })
    mocks.embedEpisodeText.mockResolvedValueOnce(vector768()).mockRejectedValueOnce(new Error('offline'))

    const report = await pruneEpisodesAndReembed(now)
    const retained = listEpisodesForGuild('guild-a')

    expect(report).toEqual({
      deleted: 1,
      reembedded: 1,
      failed: 1,
      mediaDeleted: 0,
      mediaReembedded: 0,
      mediaFailed: 0
    })
    expect(retained).toEqual([
      expect.objectContaining({ id: 3, summary: 'retained episode B', embedding: vector768() }),
      expect.objectContaining({ id: 2, summary: 'retained episode A', embedding: null })
    ])
    expect(mocks.embedEpisodeText).toHaveBeenNthCalledWith(1, {
      text: 'retained episode B',
      role: 'RETRIEVAL_DOCUMENT'
    })
    expect(mocks.embedEpisodeText).toHaveBeenNthCalledWith(2, {
      text: 'retained episode A',
      role: 'RETRIEVAL_DOCUMENT'
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-a', episodeId: 2 }),
      'Failed to re-embed memory episode'
    )
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('retained episode A')
  })

  it('repairs corrupt vectors by enumerating and reading each guild separately', async () => {
    seedEpisode({ id: 1, guildId: 'guild-a', endedAt: now - DAY_MS, summary: 'Guild A episode.' })
    seedEpisode({ id: 2, guildId: 'guild-b', endedAt: now - DAY_MS, summary: 'Guild B episode.' })
    testDb.prepare("UPDATE memory_episode SET embedding = X'0102' WHERE id = 2").run()
    mocks.embedEpisodeText.mockResolvedValue(vector768())
    const listByGuild = vi.spyOn(episodeStore, 'listEpisodesForGuild')

    await pruneEpisodesAndReembed(now)

    expect(listByGuild.mock.calls).toEqual([['guild-a'], ['guild-b']])
    expect(mocks.embedEpisodeText).toHaveBeenCalledTimes(2)
    expect(listEpisodesForGuild('guild-a')[0]?.embedding).toEqual(vector768())
    expect(listEpisodesForGuild('guild-b')[0]?.embedding).toEqual(vector768())
    listByGuild.mockRestore()
  })

  it('prunes expired media and repairs media embeddings in the same pass', async () => {
    seedMedia({
      guildId: 'guild-a',
      contentKey: 'youtube:expired',
      summary: 'expired media',
      embedding: vector768(),
      observedAt: [now - 91 * DAY_MS]
    })
    seedMedia({
      guildId: 'guild-a',
      contentKey: 'youtube:two-shares',
      summary: 'shared twice',
      embedding: vector768(),
      observedAt: [now - 91 * DAY_MS, now - DAY_MS]
    })
    seedMedia({
      guildId: 'guild-a',
      contentKey: 'youtube:pending',
      summary: 'pending media',
      embedding: null,
      observedAt: [now - DAY_MS]
    })
    seedMedia({
      guildId: 'guild-b',
      contentKey: 'youtube:offline',
      summary: 'offline media',
      embedding: null,
      observedAt: [now - DAY_MS]
    })
    mocks.embedEpisodeText.mockResolvedValueOnce(vector768()).mockRejectedValueOnce(new Error('offline'))

    const report = await pruneEpisodesAndReembed(now)

    expect(report).toEqual({
      deleted: 0,
      reembedded: 0,
      failed: 0,
      mediaDeleted: 1,
      mediaReembedded: 1,
      mediaFailed: 1
    })
    expect(findMediaDigest('guild-a', 'youtube:expired')).toBeNull()
    expect(findMediaDigest('guild-a', 'youtube:two-shares')?.embedding).toEqual(vector768())
    expect(findMediaDigest('guild-a', 'youtube:pending')?.embedding).toEqual(vector768())
    expect(findMediaDigest('guild-b', 'youtube:offline')?.embedding).toBeNull()
    expect(mocks.embedEpisodeText).toHaveBeenNthCalledWith(1, { text: 'pending media', role: 'RETRIEVAL_DOCUMENT' })
    expect(mocks.embedEpisodeText).toHaveBeenNthCalledWith(2, { text: 'offline media', role: 'RETRIEVAL_DOCUMENT' })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-b' }),
      'Failed to re-embed media digest'
    )
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('offline media')
  })
})
