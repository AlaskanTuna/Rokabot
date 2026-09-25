import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../env.js'

const mocks = vi.hoisted(() => ({ judgeEpisodeOperations: vi.fn() }))

vi.mock('../../../src/agent/jev/judgments.js', () => ({ judgeEpisodeOperations: mocks.judgeEpisodeOperations }))

import type { ExtractionOutput } from '../../../src/agent/memory/extractionSchema.js'
import { verifyAndApplyOperations } from '../../../src/agent/memory/extractor.js'
import { getActiveGuildClaims } from '../../../src/agent/memory/memoryClaims.js'
import { config } from '../../../src/config.js'
import { closeDb, getDb } from '../../../src/storage/database.js'
import type { MemoryEpisodeReplayLine } from '../memoryEpisodeReplay.js'
import { replayEpisodes } from '../memoryEpisodeReplay.js'

const transcriptPath = join(process.cwd(), 'tests/harness/transcripts/game-night.jsonl')
const originalTimezone = config.timezone

function setTimezone(timezone: string | undefined): void {
  Object.assign(config, { timezone })
}

function loadTranscript(): MemoryEpisodeReplayLine[] {
  return readFileSync(transcriptPath, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((value) => JSON.parse(value) as MemoryEpisodeReplayLine)
}

beforeEach(() => {
  setTimezone('Asia/Singapore')
  mocks.judgeEpisodeOperations.mockReset()
  mocks.judgeEpisodeOperations.mockResolvedValue({
    answers: {
      durable_0: { noul: 0.9, confidence: null },
      guild_scoped_0: { noul: 0.9, confidence: null }
    },
    latencyMs: 1,
    inputTokens: 1
  })
  closeDb()
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  setTimezone(originalTimezone)
  vi.restoreAllMocks()
})

describe('guild fact memory replay', () => {
  it('stores one timezone-correct game-night plan without user claims or network calls', async () => {
    let extractedOutput: ExtractionOutput | undefined
    let activeGuildClaims: ReturnType<typeof getActiveGuildClaims> = []
    let userSubjectClaimCount = -1
    const networkCalls = 0
    const report = await replayEpisodes(loadTranscript(), {
      admission: async () => true,
      extraction: async () => {
        extractedOutput = {
          ops: [
            {
              op: 'add',
              subject: { kind: 'guild' },
              predicate: 'plan',
              value: 'Members planned a game night',
              date: { relative: 'tomorrow' }
            }
          ],
          summary: 'The members agreed to plan a game night.'
        }
        return extractedOutput
      },
      verification: async ({ guildId, channelId, episode, output }) => {
        const result = await verifyAndApplyOperations({
          guildId,
          channelId,
          episode,
          output,
          subjectIds: new Set(episode.messages.filter(({ isBot }) => !isBot).map(({ userId }) => userId))
        })
        activeGuildClaims = getActiveGuildClaims(guildId)
        userSubjectClaimCount = (
          getDb().prepare("SELECT COUNT(*) AS count FROM memory_claim WHERE subject_kind = 'user'").get() as {
            count: number
          }
        ).count
        return result
      },
      networkCalls: () => networkCalls
    })

    expect(report.admittedEpisodes).toBe(1)
    expect(report.droppedEpisodes).toBe(0)
    expect(report.opsPerEpisode).toEqual([1])
    expect(activeGuildClaims).toHaveLength(1)
    expect(activeGuildClaims).toMatchObject([
      {
        predicate: 'plan',
        value: 'Members planned a game night',
        expiresAt: Date.parse('2026-09-26T16:00:00Z')
      }
    ])
    expect(userSubjectClaimCount).toBe(0)
    expect(report.networkCalls).toBe(0)
    expect(extractedOutput?.ops).toEqual([
      {
        op: 'add',
        subject: { kind: 'guild' },
        predicate: 'plan',
        value: 'Members planned a game night',
        date: { relative: 'tomorrow' }
      }
    ])
    expect(mocks.judgeEpisodeOperations).toHaveBeenCalledOnce()
  })
})
