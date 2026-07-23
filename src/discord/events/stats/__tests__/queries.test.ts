import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger.js', () => ({
  logger: { info: vi.fn() }
}))

import { closeDb, getDb } from '../../../../storage/database.js'
import {
  MEMORY_STATS_SQL,
  activeClaimCount,
  activityByDay,
  busiestChannel,
  chatsSince,
  distinctRememberedUsers,
  hourHistogram,
  latencyPercentiles,
  legacyFactCount,
  outcomeBreakdown,
  retrySummary,
  tokenTotals,
  topTones
} from '../queries.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const now = Date.UTC(2026, 6, 23, 12)
const sinceMs = now - 7 * DAY_MS

beforeEach(() => {
  vi.stubEnv('ROKABOT_DB_PATH', ':memory:')
  getDb()
})

afterEach(() => {
  closeDb()
  vi.unstubAllEnvs()
})

function insertResponse({
  guildId = 'guild-1',
  channelId = 'channel-1',
  tone = 'playful',
  outcome = 'ok',
  e2eMs = 10,
  generateMs = 10,
  llmMs = 5,
  retryLatencyMs = 0,
  retries = 0,
  tokensInEst = 10,
  tokensOutEst = 1,
  createdAt = sinceMs
}: {
  guildId?: string
  channelId?: string
  tone?: string
  outcome?: string
  e2eMs?: number
  generateMs?: number
  llmMs?: number
  retryLatencyMs?: number
  retries?: number
  tokensInEst?: number
  tokensOutEst?: number
  createdAt?: number
} = {}): void {
  getDb()
    .prepare(
      `INSERT INTO response_events (
        guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
        retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      guildId,
      channelId,
      'user-1',
      'mention',
      tone,
      outcome,
      outcome,
      e2eMs,
      generateMs,
      llmMs,
      retryLatencyMs,
      retries,
      tokensInEst,
      tokensOutEst,
      createdAt
    )
}

function seedMemory(): void {
  const db = getDb()
  const claim = db.prepare(
    `INSERT INTO memory_claim (
      guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  claim.run('guild-1', 'user-1', 'likes', 'tea', 'explicit', 'active', now, now)
  claim.run('guild-1', 'user-1', 'likes', 'cake', 'explicit', 'active', now, now)
  claim.run('guild-1', 'user-2', 'plays', 'chess', 'explicit', 'active', now, now)
  claim.run('guild-1', 'user-3', 'likes', 'coffee', 'explicit', 'candidate', now, now)
  claim.run('guild-2', 'user-4', 'likes', 'ramen', 'explicit', 'active', now, now)

  const fact = db.prepare(
    'INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  fact.run('guild-1', 'user-1', 'favorite_food', 'curry', now)
  fact.run('guild-1', 'user-2', 'favorite_drink', 'tea', now)
  fact.run('guild-2', 'user-4', 'favorite_food', 'ramen', now)
}

describe('stats queries', () => {
  it('returns guild-scoped, windowed response metrics with the cutoff included', () => {
    const tones = [
      'playful',
      'playful',
      'playful',
      'playful',
      'playful',
      'sincere',
      'sincere',
      'sincere',
      'domestic',
      'domestic'
    ]
    const retries = [0, 1, 0, 2, 0, 0, 1, 0, 0, 0]
    const outcomes = ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'fallback', 'fallback', 'safety']

    for (let index = 0; index < tones.length; index++) {
      insertResponse({
        channelId: index < 6 ? 'channel-1' : 'channel-2',
        tone: tones[index],
        outcome: outcomes[index],
        e2eMs: (index + 1) * 10,
        generateMs: (index + 1) * 8,
        llmMs: (index + 1) * 5,
        retryLatencyMs: retries[index] * 10,
        retries: retries[index],
        tokensInEst: (index + 1) * 10,
        tokensOutEst: index + 1,
        createdAt: sinceMs + (index < 5 ? index : index + 24) * HOUR_MS
      })
    }
    insertResponse({ createdAt: sinceMs - 1, channelId: 'old-channel', tone: 'old-tone', e2eMs: 999 })
    insertResponse({ guildId: 'guild-2', channelId: 'other-guild', tone: 'other-tone', e2eMs: 999 })

    expect(chatsSince('guild-1', sinceMs)).toBe(10)
    expect(topTones('guild-1', sinceMs)).toEqual([
      { tone: 'playful', count: 5 },
      { tone: 'sincere', count: 3 },
      { tone: 'domestic', count: 2 }
    ])
    expect(busiestChannel('guild-1', sinceMs)).toEqual({ channelId: 'channel-1', count: 6 })
    expect(activityByDay('guild-1', sinceMs)).toEqual([
      { day: '2026-07-16', count: 5 },
      { day: '2026-07-17', count: 5 }
    ])
    expect(hourHistogram('guild-1', sinceMs)).toEqual([
      { hour: 12, count: 1 },
      { hour: 13, count: 1 },
      { hour: 14, count: 1 },
      { hour: 15, count: 1 },
      { hour: 16, count: 1 },
      { hour: 17, count: 1 },
      { hour: 18, count: 1 },
      { hour: 19, count: 1 },
      { hour: 20, count: 1 },
      { hour: 21, count: 1 }
    ])
    expect(latencyPercentiles('guild-1', sinceMs)).toEqual({
      e2e: { p50: 50, p95: 100 },
      generate: { p50: 40, p95: 80 },
      llm: { p50: 25, p95: 50 }
    })
    expect(retrySummary('guild-1', sinceMs)).toEqual({ totalRetries: 4, retriedChats: 3, retryLatencyMs: 40 })
    expect(outcomeBreakdown('guild-1', sinceMs)).toEqual([
      { outcome: 'ok', count: 7 },
      { outcome: 'fallback', count: 2 },
      { outcome: 'safety', count: 1 }
    ])
    expect(tokenTotals('guild-1', sinceMs)).toEqual({ input: 550, output: 55, total: 605 })
  })

  it('returns empty-safe response metrics and guild-scoped memory counts', () => {
    expect(topTones('guild-1', sinceMs)).toEqual([])
    expect(chatsSince('guild-1', sinceMs)).toBe(0)
    expect(busiestChannel('guild-1', sinceMs)).toBeNull()
    expect(activityByDay('guild-1', sinceMs)).toEqual([])
    expect(hourHistogram('guild-1', sinceMs)).toEqual([])
    expect(latencyPercentiles('guild-1', sinceMs)).toEqual({
      e2e: { p50: 0, p95: 0 },
      generate: { p50: 0, p95: 0 },
      llm: { p50: 0, p95: 0 }
    })
    expect(retrySummary('guild-1', sinceMs)).toEqual({ totalRetries: 0, retriedChats: 0, retryLatencyMs: 0 })
    expect(outcomeBreakdown('guild-1', sinceMs)).toEqual([])
    expect(tokenTotals('guild-1', sinceMs)).toEqual({ input: 0, output: 0, total: 0 })

    seedMemory()

    expect(activeClaimCount('guild-1')).toBe(3)
    expect(distinctRememberedUsers('guild-1')).toBe(2)
    expect(legacyFactCount('guild-1')).toBe(2)
    expect(activeClaimCount('guild-2')).toBe(1)
    expect(distinctRememberedUsers('guild-2')).toBe(1)
    expect(legacyFactCount('guild-2')).toBe(1)
  })

  it('keeps memory stats queries count-only and value-free', () => {
    for (const sql of Object.values(MEMORY_STATS_SQL)) {
      expect(sql).toMatch(/^\s*SELECT\s+COUNT/i)
      expect(sql).not.toMatch(/\b(value|predicate|fact_value)\b/i)
    }
  })
})
