import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../../utils/logger.js', () => ({
  logger: { info: vi.fn() }
}))

import { closeDb, getDb } from '../../../../storage/database.js'
import * as statsQueries from '../queries.js'
import {
  MEMORY_STATS_SQL,
  activeClaimCount,
  activityByDay,
  busiestChannel,
  chatsSince,
  distinctRememberedUsers,
  hourHistogram,
  outcomeBreakdown,
  retrySummary,
  tokenTotals,
  topTones
} from '../queries.js'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const now = Date.UTC(2026, 6, 23, 12)
const sinceMs = now - 7 * DAY_MS
const monthSinceMs = now - 30 * DAY_MS

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
  userId = 'user-1',
  trigger = 'mention',
  tone = 'playful',
  outcome = 'ok',
  e2eMs = 10,
  generateMs = 10,
  llmMs = 5,
  retryLatencyMs = 0,
  retries = 0,
  tokensInEst = 10,
  tokensOutEst = 1,
  createdAt = sinceMs,
  toolsUsed = null
}: {
  guildId?: string
  channelId?: string
  userId?: string
  trigger?: string
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
  toolsUsed?: string | null
} = {}): void {
  getDb()
    .prepare(
      `INSERT INTO response_events (
        guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
        retry_latency_ms, retries, tokens_in_est, tokens_out_est, tools_used, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      guildId,
      channelId,
      userId,
      trigger,
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
      toolsUsed,
      createdAt
    )
}

function insertClaim({
  guildId = 'guild-1',
  userId,
  predicate,
  status = 'active',
  salience = 0.5,
  firstSeenAt = now
}: {
  guildId?: string
  userId: string
  predicate: string
  status?: string
  salience?: number
  firstSeenAt?: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO memory_claim (
        guild_id, subject_user_id, predicate, value, source_kind, status, salience, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(guildId, userId, predicate, 'private value', 'explicit', status, salience, firstSeenAt, firstSeenAt)
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
    expect(retrySummary('guild-1', sinceMs)).toEqual({ totalRetries: 0, retriedChats: 0, retryLatencyMs: 0 })
    expect(outcomeBreakdown('guild-1', sinceMs)).toEqual([])
    expect(tokenTotals('guild-1', sinceMs)).toEqual({ input: 0, output: 0, total: 0 })

    seedMemory()

    expect(activeClaimCount('guild-1', 'roka-user')).toBe(3)
    expect(distinctRememberedUsers('guild-1', 'roka-user')).toBe(2)
    expect(activeClaimCount('guild-2', 'roka-user')).toBe(1)
    expect(distinctRememberedUsers('guild-2', 'roka-user')).toBe(1)
  })

  it('keeps memory stats queries count-only and value-free', () => {
    for (const sql of Object.values(MEMORY_STATS_SQL)) {
      expect(sql).toMatch(/^\s*SELECT\s+COUNT/i)
      expect(sql).not.toMatch(/\b(value|predicate|fact_value)\b/i)
    }
  })

  it('returns fixed-window overview metrics, including a gap-aware streak and JSON tool tally', () => {
    insertResponse({ userId: 'user-1', createdAt: now, toolsUsed: '["weather", "time"]' })
    insertResponse({ userId: 'user-2', createdAt: now - DAY_MS, toolsUsed: '["weather"]' })
    insertResponse({ userId: 'user-3', createdAt: now - 3 * DAY_MS, trigger: 'reply' })
    insertResponse({ userId: 'user-4', createdAt: now - 4 * DAY_MS, trigger: 'name_keyword' })
    insertResponse({ userId: 'user-5', createdAt: now - 5 * DAY_MS, trigger: 'slash' })
    insertResponse({ userId: 'user-1', createdAt: now - 5 * DAY_MS + HOUR_MS })
    insertResponse({ userId: 'old-user', createdAt: monthSinceMs - 1, toolsUsed: '["weather"]' })

    expect(statsQueries.uniqueChatters('guild-1', monthSinceMs)).toBe(5)
    expect(statsQueries.mostActiveDay('guild-1', monthSinceMs)).toEqual({ day: 'Jul 18', count: 2 })
    expect(statsQueries.mostActiveHour('guild-1', monthSinceMs)).toEqual({ hour: 12, count: 5 })
    expect(statsQueries.currentAndBestStreak('guild-1', monthSinceMs, now)).toEqual({ current: 2, best: 3 })
    expect(statsQueries.mostUsedTool('guild-1', monthSinceMs)).toEqual({ tool: 'weather', count: 2 })
    expect(statsQueries.triggerSplit('guild-1', monthSinceMs)).toEqual([
      { trigger: 'mention', count: 3 },
      { trigger: 'name_keyword', count: 1 },
      { trigger: 'reply', count: 1 },
      { trigger: 'slash', count: 1 }
    ])
    expect(statsQueries.mostUsedTool('guild-2', monthSinceMs)).toBeNull()
  })

  it('returns value-free memory details ordered by active claim count', () => {
    insertClaim({ userId: 'user-1', predicate: 'favorite_anime', salience: 0.9, firstSeenAt: monthSinceMs })
    insertClaim({ userId: 'user-1', predicate: 'hobby', salience: 0.2, firstSeenAt: now - DAY_MS })
    insertClaim({ userId: 'user-2', predicate: 'favorite_food', salience: 0.7, firstSeenAt: now - 2 * DAY_MS })
    insertClaim({ userId: 'user-2', predicate: 'hobby', salience: 0.3, firstSeenAt: now - 2 * DAY_MS })
    insertClaim({ userId: 'user-3', predicate: 'preference', salience: 0.6, firstSeenAt: now - 3 * DAY_MS })
    insertClaim({ userId: 'user-4', predicate: 'game', salience: 0.5, firstSeenAt: now - 4 * DAY_MS })
    insertClaim({ userId: 'user-5', predicate: 'music', salience: 0.4, firstSeenAt: now - 5 * DAY_MS })
    insertClaim({ userId: 'user-6', predicate: 'ignored', status: 'candidate', firstSeenAt: now })
    insertClaim({ userId: 'old-user', predicate: 'hobby', salience: 1, firstSeenAt: monthSinceMs - 1 })
    insertClaim({ userId: 'roka-user', predicate: 'likes', salience: 1, firstSeenAt: now })
    insertClaim({ userId: 'roka-user', predicate: 'hobby', salience: 1, firstSeenAt: now })

    expect(statsQueries.activeClaimCount('guild-1', 'roka-user')).toBe(8)
    expect(statsQueries.distinctRememberedUsers('guild-1', 'roka-user')).toBe(6)
    expect(statsQueries.newClaimsThisMonth('guild-1', monthSinceMs, 'roka-user')).toBe(7)
    expect(statsQueries.topPredicates('guild-1', monthSinceMs, 'roka-user')).toEqual([
      { predicate: 'hobby', count: 2 },
      { predicate: 'favorite_anime', count: 1 },
      { predicate: 'favorite_food', count: 1 }
    ])
    expect(statsQueries.topRememberedMembers('guild-1', monthSinceMs, 'roka-user')).toEqual([
      { userId: 'user-1', count: 2, predicate: 'favorite_anime' },
      { userId: 'user-2', count: 2, predicate: 'favorite_food' },
      { userId: 'user-3', count: 1, predicate: 'preference' },
      { userId: 'user-4', count: 1, predicate: 'game' },
      { userId: 'user-5', count: 1, predicate: 'music' }
    ])
    expect(statsQueries.memoryGrowthSeries('guild-1', monthSinceMs, 'roka-user')).toEqual([
      { day: '2026-06-23', cumulative: 1 },
      { day: '2026-07-18', cumulative: 2 },
      { day: '2026-07-19', cumulative: 3 },
      { day: '2026-07-20', cumulative: 4 },
      { day: '2026-07-21', cumulative: 6 },
      { day: '2026-07-22', cumulative: 7 }
    ])

    for (const sql of Object.values(statsQueries.MEMORY_DETAIL_SQL)) {
      expect(sql).toMatch(/\b(predicate|salience)\b/i)
      expect(sql).not.toMatch(/\b(value|fact_value)\b/i)
    }
  })

  it('returns e2e-only latency and success metrics with a per-day p95 series', () => {
    insertResponse({ e2eMs: 10, outcome: 'ok', createdAt: monthSinceMs })
    insertResponse({ e2eMs: 20, outcome: 'ok', createdAt: monthSinceMs })
    insertResponse({ e2eMs: 30, outcome: 'fallback', createdAt: now - DAY_MS })
    insertResponse({ e2eMs: 40, outcome: 'safety', createdAt: now - DAY_MS })

    expect(statsQueries.latencyE2e('guild-1', monthSinceMs)).toEqual({
      p50: 20,
      p95: 40,
      min: 10,
      max: 40,
      total: 100
    })
    expect(statsQueries.successRate('guild-1', monthSinceMs)).toEqual({
      ok: 2,
      total: 4,
      failures: [
        { outcome: 'fallback', count: 1 },
        { outcome: 'safety', count: 1 }
      ]
    })
    expect(statsQueries.p95ByDay('guild-1', monthSinceMs)).toEqual([
      { day: '2026-06-23', p95: 20 },
      { day: '2026-07-22', p95: 40 }
    ])
  })
})
