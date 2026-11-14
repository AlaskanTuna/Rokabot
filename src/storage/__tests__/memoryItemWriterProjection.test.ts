import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as memoryClaims from '../../agent/memory/memoryClaims.js'
import { moveClaim, undoReclassify } from '../../agent/memory/reclassify.js'
import { closeDb, getDb } from '../database.js'
import type { ExtractionEpisode } from '../extractionQueue.js'
import * as mediaDigestStore from '../mediaDigestStore.js'
import * as memoryEpisodeStore from '../memoryEpisodeStore.js'
import { getMemoryItemDriftCounts, migrateMemoryItems } from '../memoryItemBackfill.js'
import { configureMemoryItemProjectionTriggers } from '../memoryItemProjection.js'
import * as memoryRecallStore from '../memoryRecallStore.js'

const reclassifyModelMocks = vi.hoisted(() => ({
  proposePredicates: vi.fn(),
  jevConfirm: vi.fn()
}))

vi.mock('../../agent/memory/reclassifyModels.js', () => ({
  proposePredicates: reclassifyModelMocks.proposePredicates,
  jevConfirm: reclassifyModelMocks.jevConfirm
}))

const vector = {
  values: [0.5, 0.5],
  modelId: 'synthetic-model',
  dim: 2,
  fingerprint: 'synthetic:fingerprint'
} as const

type Context = {
  seedClaim: (input?: Partial<Parameters<typeof memoryClaims.assertClaim>[0]>) => number
  seedGuildClaim: () => number
  seedEpisode: (id?: number, summary?: string, endedAt?: number) => number
  seedDigest: (contentKey?: string, summary?: string) => number
  check: () => void
}

type Scenario = Readonly<{ name: string; run: (context: Context) => void | Promise<void> }>

function insertOpenLine(check: () => void): void {
  memoryEpisodeStore.recordOpenEpisodeMessage({
    guildId: 'guild-fixture',
    channelId: 'channel-fixture',
    openedAt: 100,
    line: {
      messageId: 'message-fixture',
      userId: 'user-fixture',
      displayName: 'Fixture',
      content: 'Synthetic line.',
      timestamp: 100,
      isBot: false
    }
  })
  check()
}

const scenarios: readonly Scenario[] = [
  {
    name: 'memoryClaims.appendEvidence',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.appendEvidence(id, { sourceKind: 'human', observedAt: 200, channelId: 'channel-2' })
    }
  },
  { name: 'memoryClaims.evictOverflowForAllSubjects', run: () => memoryClaims.evictOverflowForAllSubjects() },
  { name: 'memoryClaims.pruneActiveClaimOverflow', run: () => memoryClaims.pruneActiveClaimOverflow() },
  { name: 'memoryClaims.assertClaim', run: ({ seedClaim }) => seedClaim() },
  {
    name: 'memoryClaims.activateClaim',
    run: ({ seedClaim }) => {
      const id = seedClaim({ status: 'candidate', needsReview: true, sourceKind: 'passive' })
      memoryClaims.activateClaim('guild-fixture', id)
    }
  },
  {
    name: 'memoryClaims.retractClaim',
    run: ({ seedClaim }) => {
      seedClaim()
      memoryClaims.retractClaim({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        predicate: 'hobby',
        value: 'chess'
      })
    }
  },
  {
    name: 'memoryClaims.retireClaim',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.retireClaim('guild-fixture', id, 'retracted')
    }
  },
  {
    name: 'memoryClaims.pinClaim',
    run: ({ seedClaim }) => memoryClaims.pinClaim(seedClaim())
  },
  {
    name: 'memoryClaims.unpinClaim',
    run: ({ seedClaim, check }) => {
      const id = seedClaim()
      memoryClaims.pinClaim(id)
      check()
      memoryClaims.unpinClaim(id)
    }
  },
  {
    name: 'memoryClaims.replaceActiveClaim',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.replaceActiveClaim({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        existingId: id,
        predicate: 'hobby',
        value: 'painting',
        channelId: 'channel-fixture',
        observedAt: 200
      })
    }
  },
  {
    name: 'memoryClaims.rejectActiveClaimById',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.rejectActiveClaimById({ guildId: 'guild-fixture', subjectUserId: 'user-fixture', existingId: id })
    }
  },
  {
    name: 'memoryClaims.rejectClaimIdsForSpeaker',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryClaims.rejectClaimIdsForSpeaker('guild-fixture', 'user-fixture', [id])
    }
  },
  { name: 'memoryClaims.assertGuildClaim', run: ({ seedGuildClaim }) => seedGuildClaim() },
  {
    name: 'memoryClaims.replaceActiveGuildClaim',
    run: ({ seedGuildClaim }) => {
      const id = seedGuildClaim()
      memoryClaims.replaceActiveGuildClaim({
        guildId: 'guild-fixture',
        existingId: id,
        predicate: 'upcoming_event',
        value: 'Community gathering',
        expiresAt: 20_000,
        eventDate: '2026-12',
        channelId: 'channel-fixture',
        observedAt: 200
      })
    }
  },
  {
    name: 'memoryClaims.rejectActiveGuildClaimById',
    run: ({ seedGuildClaim }) => {
      const id = seedGuildClaim()
      memoryClaims.rejectActiveGuildClaimById({ guildId: 'guild-fixture', existingId: id })
    }
  },
  {
    name: 'memoryClaims.touchRecalled',
    run: ({ seedClaim }) => memoryClaims.touchRecalled([seedClaim()])
  },
  { name: 'memoryClaims.pruneStaleClaims', run: () => memoryClaims.pruneStaleClaims(1_000_000) },
  {
    name: 'reclassify.moveClaim raw SQL path',
    run: ({ seedClaim, check }) => {
      seedClaim({ predicate: 'misc' })
      const claim = memoryClaims.findReclassifyRows()[0]!
      moveClaim(claim, 'hobby', 0.9)
      check()
    }
  },
  {
    name: 'reclassify.undoReclassify raw SQL path',
    run: ({ seedClaim, check }) => {
      const id = seedClaim({ predicate: 'misc' })
      moveClaim(memoryClaims.findReclassifyRows()[0]!, 'hobby', 0.9)
      check()
      undoReclassify(id)
    }
  },
  {
    name: 'reclassify.reclassifyClaims with stubbed model results',
    run: async ({ seedClaim }) => {
      const id = seedClaim({ predicate: 'misc' })
      reclassifyModelMocks.proposePredicates.mockResolvedValue([{ id, predicate: 'hobby' }])
      reclassifyModelMocks.jevConfirm.mockResolvedValue({ [id]: 0.9 })
      expect(await (await import('../../agent/memory/reclassify.js')).reclassifyClaims()).toBe(1)
    }
  },
  {
    name: 'memoryEpisodeStore.saveMemoryEpisode',
    run: ({ seedEpisode }) => seedEpisode()
  },
  {
    name: 'memoryEpisodeStore.setEpisodeEmbedding',
    run: ({ seedEpisode }) => {
      const id = seedEpisode()
      memoryEpisodeStore.setEpisodeEmbedding({
        guildId: 'guild-fixture',
        id,
        summary: 'Synthetic episode.',
        embedding: vector
      })
    }
  },
  {
    name: 'memoryEpisodeStore.pruneExpiredEpisodes',
    run: ({ seedEpisode }) => {
      seedEpisode(501, 'Expired episode.', 1)
      memoryEpisodeStore.pruneExpiredEpisodes(2)
    }
  },
  {
    name: 'memoryEpisodeStore.recordOpenEpisodeMessage',
    run: ({ check }) => insertOpenLine(check)
  },
  {
    name: 'memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor',
    run: ({ check }) => {
      insertOpenLine(check)
      const episode: ExtractionEpisode = {
        messages: [
          {
            messageId: 'message-fixture',
            userId: 'user-fixture',
            displayName: 'Fixture',
            content: 'Synthetic line.',
            timestamp: 100,
            isBot: false
          }
        ],
        context: [],
        startedAt: 100,
        endedAt: 100
      }
      memoryEpisodeStore.enqueueEpisodeAndAdvanceCursor({
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        episode,
        lastMessageId: 'message-fixture'
      })
    }
  },
  {
    name: 'memoryEpisodeStore.syncOpenEpisodeCursorsToLineCounts',
    run: ({ check }) => {
      insertOpenLine(check)
      memoryEpisodeStore.syncOpenEpisodeCursorsToLineCounts()
    }
  },
  {
    name: 'memoryEpisodeStore.clearSavedOpenEpisodes',
    run: ({ check }) => {
      insertOpenLine(check)
      memoryEpisodeStore.clearSavedOpenEpisodes()
    }
  },
  {
    name: 'mediaDigestStore.saveMediaDigest',
    run: ({ seedDigest }) => seedDigest()
  },
  {
    name: 'mediaDigestStore.recordMediaOccurrence',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'message-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 200
      })
    }
  },
  {
    name: 'mediaDigestStore.setMediaDigestEmbedding',
    run: ({ seedDigest }) => {
      const id = seedDigest()
      mediaDigestStore.setMediaDigestEmbedding({
        guildId: 'guild-fixture',
        id,
        summary: 'Synthetic media summary.',
        embedding: vector
      })
    }
  },
  {
    name: 'mediaDigestStore.pruneExpiredMediaDigests',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'expired-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 1
      })
      check()
      mediaDigestStore.pruneExpiredMediaDigests(2)
    }
  },
  {
    name: 'mediaDigestStore.forgetMediaForUser',
    run: ({ seedDigest, check }) => {
      const id = seedDigest()
      mediaDigestStore.recordMediaOccurrence({
        digestId: id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        messageId: 'forgotten-media',
        sharedByUserId: 'user-fixture',
        sourceAuthorId: null,
        origin: 'upload',
        observedAt: 200
      })
      check()
      mediaDigestStore.forgetMediaForUser('guild-fixture', 'user-fixture', [id])
    }
  },
  {
    name: 'memoryRecallStore.setClaimEmbedding',
    run: ({ seedClaim }) => {
      const id = seedClaim()
      memoryRecallStore.setClaimEmbedding({ id, embeddingText: 'Synthetic fact sentence.', embedding: vector })
    }
  }
]

describe.each(scenarios)('$name', ({ run }) => {
  beforeEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = ':memory:'
    configureMemoryItemProjectionTriggers(getDb(), 'dual')
  })

  afterEach(() => {
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('leaves the Phase 2 projection equal to its legacy sources', async () => {
    const check = () => {
      expect(getMemoryItemDriftCounts(getDb())).toEqual({ fact: 0, episode: 0, media: 0 })
      const report = migrateMemoryItems(getDb())
      expect(report.copied_items).toBe(0)
      expect(report.refreshed_items).toBe(0)
      expect(report.deleted_items).toBe(0)
      expect(report.copied_evidence).toBe(0)
      expect(report.copied_occurrences).toBe(0)
      expect(report.copied_payloads).toBe(0)
      expect(report.copied_embeddings).toBe(0)
      expect(report.checks_failed).toBe(0)
    }
    const seedClaim = (input: Partial<Parameters<typeof memoryClaims.assertClaim>[0]> = {}) => {
      const claim = memoryClaims.assertClaim({
        guildId: 'guild-fixture',
        subjectUserId: 'user-fixture',
        predicate: 'hobby',
        value: 'chess',
        sourceKind: 'explicit',
        observedAt: 100,
        ...input
      })
      check()
      return claim.id
    }
    const seedGuildClaim = () => {
      const claim = memoryClaims.assertGuildClaim({
        guildId: 'guild-fixture',
        predicate: 'upcoming_event',
        value: 'Workshop',
        expiresAt: 10_000,
        eventDate: '2026-11',
        sourceKind: 'explicit',
        observedAt: 100
      })
      check()
      return claim.id
    }
    const seedEpisode = (id = 501, summary = 'Synthetic episode.', endedAt = 200) => {
      memoryEpisodeStore.saveMemoryEpisode({
        id,
        guildId: 'guild-fixture',
        channelId: 'channel-fixture',
        startedAt: 100,
        endedAt,
        summary,
        embedding: null,
        createdAt: 300
      })
      check()
      return id
    }
    const seedDigest = (contentKey = 'fixture:key', summary = 'Synthetic media summary.') => {
      const digest = mediaDigestStore.saveMediaDigest({
        guildId: 'guild-fixture',
        contentKey,
        kind: 'video',
        label: 'Fixture media',
        summary,
        digestJson: '{}',
        createdAt: 300
      })
      expect(digest).not.toBeNull()
      check()
      return digest!.id
    }

    await run({ seedClaim, seedGuildClaim, seedEpisode, seedDigest, check })
    check()
  })
})
