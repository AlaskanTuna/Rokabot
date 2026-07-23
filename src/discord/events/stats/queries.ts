import { getDb } from '../../../storage/database.js'

export interface CountByTone {
  tone: string
  count: number
}

export interface CountByDay {
  day: string
  count: number
}

export interface CountByHour {
  hour: number
  count: number
}

export interface BusiestChannel {
  channelId: string
  count: number
}

export interface LatencyPercentiles {
  e2e: Percentiles
  generate: Percentiles
  llm: Percentiles
}

export interface Percentiles {
  p50: number
  p95: number
}

export interface RetrySummary {
  totalRetries: number
  retriedChats: number
  retryLatencyMs: number
}

export interface CountByOutcome {
  outcome: string
  count: number
}

export interface TokenTotals {
  input: number
  output: number
  total: number
}

export const MEMORY_STATS_SQL = {
  activeClaimCount: "SELECT COUNT(*) AS count FROM memory_claim WHERE guild_id = ? AND status = 'active'",
  distinctRememberedUsers:
    "SELECT COUNT(DISTINCT subject_user_id) AS count FROM memory_claim WHERE guild_id = ? AND status = 'active'",
  legacyFactCount: 'SELECT COUNT(*) AS count FROM user_memory WHERE guild_id = ?'
} as const

const WINDOW_SQL = 'WHERE guild_id = ? AND created_at >= ?'

function percentile(values: number[], rank: number): number {
  if (values.length === 0) return 0
  return values[Math.ceil(values.length * rank) - 1]
}

export function topTones(guildId: string, sinceMs: number): CountByTone[] {
  return getDb()
    .prepare(
      `SELECT tone, COUNT(*) AS count FROM response_events ${WINDOW_SQL}
       GROUP BY tone ORDER BY count DESC, tone ASC`
    )
    .all(guildId, sinceMs) as CountByTone[]
}

export function chatsSince(guildId: string, sinceMs: number): number {
  return (
    getDb().prepare(`SELECT COUNT(*) AS count FROM response_events ${WINDOW_SQL}`).get(guildId, sinceMs) as {
      count: number
    }
  ).count
}

export function busiestChannel(guildId: string, sinceMs: number): BusiestChannel | null {
  const row = getDb()
    .prepare(
      `SELECT channel_id AS channelId, COUNT(*) AS count FROM response_events ${WINDOW_SQL}
       GROUP BY channel_id ORDER BY count DESC, channel_id ASC LIMIT 1`
    )
    .get(guildId, sinceMs) as BusiestChannel | undefined
  return row ?? null
}

export function activityByDay(guildId: string, sinceMs: number): CountByDay[] {
  return getDb()
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
       FROM response_events ${WINDOW_SQL}
       GROUP BY day ORDER BY day ASC`
    )
    .all(guildId, sinceMs) as CountByDay[]
}

export function hourHistogram(guildId: string, sinceMs: number): CountByHour[] {
  return getDb()
    .prepare(
      `SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER) AS hour, COUNT(*) AS count
       FROM response_events ${WINDOW_SQL}
       GROUP BY hour ORDER BY hour ASC`
    )
    .all(guildId, sinceMs) as CountByHour[]
}

export function latencyPercentiles(guildId: string, sinceMs: number): LatencyPercentiles {
  const rows = getDb()
    .prepare(`SELECT e2e_ms, generate_ms, llm_ms FROM response_events ${WINDOW_SQL}`)
    .all(guildId, sinceMs) as Array<{ e2e_ms: number; generate_ms: number; llm_ms: number }>
  const e2e = rows.map((row) => row.e2e_ms).sort((left, right) => left - right)
  const generate = rows.map((row) => row.generate_ms).sort((left, right) => left - right)
  const llm = rows.map((row) => row.llm_ms).sort((left, right) => left - right)

  return {
    e2e: { p50: percentile(e2e, 0.5), p95: percentile(e2e, 0.95) },
    generate: { p50: percentile(generate, 0.5), p95: percentile(generate, 0.95) },
    llm: { p50: percentile(llm, 0.5), p95: percentile(llm, 0.95) }
  }
}

export function retrySummary(guildId: string, sinceMs: number): RetrySummary {
  return getDb()
    .prepare(
      `SELECT COALESCE(SUM(retries), 0) AS totalRetries,
              COALESCE(SUM(CASE WHEN retries > 0 THEN 1 ELSE 0 END), 0) AS retriedChats,
              COALESCE(SUM(retry_latency_ms), 0) AS retryLatencyMs
       FROM response_events ${WINDOW_SQL}`
    )
    .get(guildId, sinceMs) as RetrySummary
}

export function outcomeBreakdown(guildId: string, sinceMs: number): CountByOutcome[] {
  return getDb()
    .prepare(
      `SELECT outcome, COUNT(*) AS count FROM response_events ${WINDOW_SQL}
       GROUP BY outcome ORDER BY count DESC, outcome ASC`
    )
    .all(guildId, sinceMs) as CountByOutcome[]
}

export function tokenTotals(guildId: string, sinceMs: number): TokenTotals {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(tokens_in_est), 0) AS input, COALESCE(SUM(tokens_out_est), 0) AS output
       FROM response_events ${WINDOW_SQL}`
    )
    .get(guildId, sinceMs) as Omit<TokenTotals, 'total'>
  return { ...row, total: row.input + row.output }
}

export function activeClaimCount(guildId: string): number {
  return (getDb().prepare(MEMORY_STATS_SQL.activeClaimCount).get(guildId) as { count: number }).count
}

export function distinctRememberedUsers(guildId: string): number {
  return (getDb().prepare(MEMORY_STATS_SQL.distinctRememberedUsers).get(guildId) as { count: number }).count
}

export function legacyFactCount(guildId: string): number {
  return (getDb().prepare(MEMORY_STATS_SQL.legacyFactCount).get(guildId) as { count: number }).count
}
