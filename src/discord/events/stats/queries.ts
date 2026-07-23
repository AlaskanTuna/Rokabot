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

export interface CountByTrigger {
  trigger: string
  count: number
}

export interface BusiestChannel {
  channelId: string
  count: number
}

export interface ChannelCount {
  channelId: string
  count: number
}

export interface MostActiveDay {
  day: string
  count: number
}

export interface StreakSummary {
  current: number
  best: number
}

export interface ToolUsage {
  tool: string
  count: number
}

export interface CountByPredicate {
  predicate: string
  count: number
}

export interface RememberedMember {
  userId: string
  count: number
  predicate: string
}

export interface MemoryGrowthPoint {
  day: string
  cumulative: number
}

export interface LatencyE2e {
  p50: number
  p95: number
  min: number
  max: number
  total: number
}

export interface SuccessRate {
  ok: number
  total: number
  failures: CountByOutcome[]
}

export interface P95ByDay {
  day: string
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
    "SELECT COUNT(DISTINCT subject_user_id) AS count FROM memory_claim WHERE guild_id = ? AND status = 'active'"
} as const

export const MEMORY_DETAIL_SQL = {
  topPredicates: `SELECT predicate, COUNT(*) AS count
                  FROM memory_claim
                  WHERE guild_id = ? AND status = 'active' AND first_seen_at >= ?
                  GROUP BY predicate
                  ORDER BY count DESC, predicate ASC
                  LIMIT 3`,
  topRememberedMembers: `WITH active_claims AS (
                            SELECT subject_user_id, predicate, salience
                            FROM memory_claim
                            WHERE guild_id = ? AND status = 'active' AND first_seen_at >= ?
                          ), member_counts AS (
                            SELECT subject_user_id, COUNT(*) AS count
                            FROM active_claims
                            GROUP BY subject_user_id
                          ), highest_salience AS (
                            SELECT subject_user_id, predicate,
                                   ROW_NUMBER() OVER (
                                     PARTITION BY subject_user_id
                                     ORDER BY salience DESC, predicate ASC
                                   ) AS rank
                            FROM active_claims
                          )
                          SELECT member_counts.subject_user_id AS userId, member_counts.count, highest_salience.predicate
                          FROM member_counts
                          JOIN highest_salience ON highest_salience.subject_user_id = member_counts.subject_user_id
                          WHERE highest_salience.rank = 1
                          ORDER BY member_counts.count DESC, userId ASC
                          LIMIT 5`
} as const

const WINDOW_SQL = 'WHERE guild_id = ? AND created_at >= ?'

function percentile(values: number[], rank: number): number {
  if (values.length === 0) return 0
  return values[Math.ceil(values.length * rank) - 1]
}

function dayFor(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function formatCalendarDay(day: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`)
  )
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

export function uniqueChatters(guildId: string, sinceMs: number): number {
  return (
    getDb()
      .prepare(`SELECT COUNT(DISTINCT user_id) AS count FROM response_events ${WINDOW_SQL}`)
      .get(guildId, sinceMs) as { count: number }
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

export function topChannels(guildId: string, sinceMs: number): ChannelCount[] {
  return getDb()
    .prepare(
      `SELECT channel_id AS channelId, COUNT(*) AS count FROM response_events ${WINDOW_SQL}
       GROUP BY channel_id ORDER BY count DESC, channel_id ASC LIMIT 6`
    )
    .all(guildId, sinceMs) as ChannelCount[]
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

export function mostActiveDay(guildId: string, sinceMs: number): MostActiveDay | null {
  const row = getDb()
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
       FROM response_events ${WINDOW_SQL}
       GROUP BY day ORDER BY count DESC, day ASC LIMIT 1`
    )
    .get(guildId, sinceMs) as CountByDay | undefined
  return row ? { ...row, day: formatCalendarDay(row.day) } : null
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

export function mostActiveHour(guildId: string, sinceMs: number): CountByHour | null {
  return (
    [...hourHistogram(guildId, sinceMs)].sort((left, right) => right.count - left.count || left.hour - right.hour)[0] ??
    null
  )
}

export function currentAndBestStreak(guildId: string, sinceMs: number, nowMs: number = Date.now()): StreakSummary {
  const activeDays = new Set(activityByDay(guildId, sinceMs).map((entry) => entry.day))
  let current = 0
  for (let timestamp = nowMs; activeDays.has(dayFor(timestamp)); timestamp -= 24 * 60 * 60 * 1000) current++

  let best = 0
  let run = 0
  let previousDay = ''
  for (const day of [...activeDays].sort()) {
    run = previousDay && day === dayFor(Date.parse(`${previousDay}T00:00:00Z`) + 24 * 60 * 60 * 1000) ? run + 1 : 1
    best = Math.max(best, run)
    previousDay = day
  }

  return { current, best }
}

export function mostUsedTool(guildId: string, sinceMs: number): ToolUsage | null {
  const row = getDb()
    .prepare(
      `SELECT json_each.value AS tool, COUNT(*) AS count
       FROM response_events
       JOIN json_each(response_events.tools_used)
         ON response_events.tools_used IS NOT NULL AND json_valid(response_events.tools_used)
       ${WINDOW_SQL}
       GROUP BY tool ORDER BY count DESC, tool ASC LIMIT 1`
    )
    .get(guildId, sinceMs) as ToolUsage | undefined
  return row ?? null
}

export function triggerSplit(guildId: string, sinceMs: number): CountByTrigger[] {
  return getDb()
    .prepare(
      `SELECT trigger, COUNT(*) AS count FROM response_events ${WINDOW_SQL}
       GROUP BY trigger ORDER BY count DESC, trigger ASC`
    )
    .all(guildId, sinceMs) as CountByTrigger[]
}

export function latencyE2e(guildId: string, sinceMs: number): LatencyE2e {
  const e2e = (
    getDb().prepare(`SELECT e2e_ms FROM response_events ${WINDOW_SQL}`).all(guildId, sinceMs) as Array<{
      e2e_ms: number
    }>
  )
    .map((row) => row.e2e_ms)
    .sort((left, right) => left - right)

  return {
    p50: percentile(e2e, 0.5),
    p95: percentile(e2e, 0.95),
    min: e2e[0] ?? 0,
    max: e2e.at(-1) ?? 0,
    total: e2e.reduce((sum, value) => sum + value, 0)
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

export function successRate(guildId: string, sinceMs: number): SuccessRate {
  const outcomes = outcomeBreakdown(guildId, sinceMs)
  return {
    ok: outcomes.find(({ outcome }) => outcome === 'ok')?.count ?? 0,
    total: outcomes.reduce((total, { count }) => total + count, 0),
    failures: outcomes.filter(({ outcome }) => outcome !== 'ok')
  }
}

export function p95ByDay(guildId: string, sinceMs: number): P95ByDay[] {
  const rows = getDb()
    .prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, e2e_ms
       FROM response_events ${WINDOW_SQL}
       ORDER BY day ASC, e2e_ms ASC`
    )
    .all(guildId, sinceMs) as Array<{ day: string; e2e_ms: number }>
  const valuesByDay = new Map<string, number[]>()
  for (const row of rows) valuesByDay.set(row.day, [...(valuesByDay.get(row.day) ?? []), row.e2e_ms])

  return [...valuesByDay].map(([day, values]) => ({ day, p95: percentile(values, 0.95) }))
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

export function newClaimsThisMonth(guildId: string, sinceMs: number): number {
  return (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS count FROM memory_claim WHERE guild_id = ? AND status = 'active' AND first_seen_at >= ?"
      )
      .get(guildId, sinceMs) as { count: number }
  ).count
}

export function topPredicates(guildId: string, sinceMs: number): CountByPredicate[] {
  return getDb().prepare(MEMORY_DETAIL_SQL.topPredicates).all(guildId, sinceMs) as CountByPredicate[]
}

export function topRememberedMembers(guildId: string, sinceMs: number): RememberedMember[] {
  return getDb().prepare(MEMORY_DETAIL_SQL.topRememberedMembers).all(guildId, sinceMs) as RememberedMember[]
}

export function memoryGrowthSeries(guildId: string, sinceMs: number): MemoryGrowthPoint[] {
  const rows = getDb()
    .prepare(
      `SELECT strftime('%Y-%m-%d', first_seen_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
       FROM memory_claim
       WHERE guild_id = ? AND status = 'active' AND first_seen_at >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .all(guildId, sinceMs) as CountByDay[]
  let cumulative = 0
  const points: MemoryGrowthPoint[] = []
  for (const { day, count } of rows) {
    cumulative += count
    points.push({ day, cumulative })
  }
  return points
}
