import Database from 'better-sqlite3'
import {
  flushOpenEpisodes,
  recordEpisodeMessage,
  resetEpisodeTrackerForTest
} from '../../src/agent/memory/episodeTracker.js'
import type { ExtractionOutput } from '../../src/agent/memory/extractionSchema.js'
import type { OperationApplicationReport } from '../../src/agent/memory/extractor.js'
import { stopExtractionScheduler } from '../../src/agent/memory/scheduler.js'
import { resetAllBuffers } from '../../src/agent/passiveBuffer.js'
import { beginShutdown, isShuttingDown, resetForTest as resetShutdown } from '../../src/agent/shutdownSignal.js'
import { closeDb, getDb } from '../../src/storage/database.js'
import type { EpisodeLine, ExtractionEpisode, ExtractionQueueJob } from '../../src/storage/extractionQueue.js'

export type MemoryEpisodeReplayLine = EpisodeLine & Readonly<{ guildId: string; channelId: string }>

export type EpisodeReplayContext = Readonly<{
  guildId: string
  channelId: string
  episode: ExtractionEpisode
}>

export type MemoryEpisodeReplayAdapters = Readonly<{
  admission: (context: EpisodeReplayContext) => Promise<boolean>
  extraction: (context: EpisodeReplayContext) => Promise<ExtractionOutput>
  verification: (
    context: EpisodeReplayContext & { output: ExtractionOutput }
  ) => Promise<Pick<OperationApplicationReport, 'appliedOps' | 'droppedOps' | 'duplicateOps'>>
  networkCalls?: () => number
}>

export type GapDistribution = Readonly<{
  sampleCount: number
  zeroGapTies: number
  positiveCount: number
  p50Ms: number | null
  p75Ms: number | null
  p90Ms: number | null
  p95Ms: number | null
  p99Ms: number | null
}>

export type MemoryEpisodeReplayReport = Readonly<{
  admittedEpisodes: number
  droppedEpisodes: number
  opsPerEpisode: number[]
  duplicatesAvoided: number
  gapDistribution: GapDistribution
  networkCalls: number
}>

export type SessionHistoryReplayReport = Readonly<{
  lines: MemoryEpisodeReplayLine[]
  unmappedRows: number
  ambiguousRows: number
}>

function percentile(sortedValues: number[], quantile: number): number | null {
  if (sortedValues.length === 0) return null
  const position = (sortedValues.length - 1) * quantile
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower)
}

export function measureEpisodeGaps(lines: readonly MemoryEpisodeReplayLine[]): GapDistribution {
  const channels = new Map<string, MemoryEpisodeReplayLine[]>()
  for (const line of lines) {
    const key = `${line.guildId}\u0000${line.channelId}`
    const channel = channels.get(key) ?? []
    channel.push(line)
    channels.set(key, channel)
  }

  const gaps: number[] = []
  for (const channel of channels.values()) {
    channel.sort((left, right) => left.timestamp - right.timestamp)
    for (let index = 1; index < channel.length; index++)
      gaps.push(channel[index].timestamp - channel[index - 1].timestamp)
  }
  const positiveGaps = gaps.filter((gap) => gap > 0).sort((left, right) => left - right)
  return {
    sampleCount: gaps.length,
    zeroGapTies: gaps.filter((gap) => gap === 0).length,
    positiveCount: positiveGaps.length,
    p50Ms: percentile(positiveGaps, 0.5),
    p75Ms: percentile(positiveGaps, 0.75),
    p90Ms: percentile(positiveGaps, 0.9),
    p95Ms: percentile(positiveGaps, 0.95),
    p99Ms: percentile(positiveGaps, 0.99)
  }
}

export function loadSessionHistorySnapshot(path: string): SessionHistoryReplayReport {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const guildRows = db
      .prepare(
        'SELECT channel_id, MIN(guild_id) AS guild_id, COUNT(DISTINCT guild_id) AS guild_count FROM response_events GROUP BY channel_id'
      )
      .all() as Array<{ channel_id: string; guild_id: string; guild_count: number }>
    const guildByChannel = new Map<string, string>()
    const ambiguousChannels = new Set<string>()
    for (const row of guildRows) {
      if (row.guild_count === 1) guildByChannel.set(row.channel_id, row.guild_id)
      else ambiguousChannels.add(row.channel_id)
    }

    const rows = db
      .prepare(
        'SELECT rowid, channel_id, role, display_name, content, timestamp, user_id FROM session_history ORDER BY channel_id, timestamp, rowid'
      )
      .all() as Array<{
      rowid: number
      channel_id: string
      role: string
      display_name: string
      content: string
      timestamp: number
      user_id: string | null
    }>
    const report = { lines: [] as MemoryEpisodeReplayLine[], unmappedRows: 0, ambiguousRows: 0 }
    for (const row of rows) {
      if (ambiguousChannels.has(row.channel_id)) {
        report.ambiguousRows++
        continue
      }
      const guildId = guildByChannel.get(row.channel_id)
      if (!guildId) {
        report.unmappedRows++
        continue
      }
      if (row.role === 'assistant') {
        report.lines.push({
          guildId,
          channelId: row.channel_id,
          messageId: `session-${row.channel_id}-${row.rowid}`,
          userId: 'bot',
          displayName: row.display_name,
          content: row.content,
          timestamp: row.timestamp,
          isBot: true
        })
      } else if (row.role === 'user' && row.user_id) {
        report.lines.push({
          guildId,
          channelId: row.channel_id,
          messageId: `session-${row.channel_id}-${row.rowid}`,
          userId: row.user_id,
          displayName: row.display_name,
          content: row.content,
          timestamp: row.timestamp,
          isBot: false
        })
      } else {
        report.unmappedRows++
      }
    }
    return report
  } finally {
    db.close()
  }
}

export async function replayEpisodes(
  lines: readonly MemoryEpisodeReplayLine[],
  adapters: MemoryEpisodeReplayAdapters
): Promise<MemoryEpisodeReplayReport> {
  const originalDatabasePath = process.env.ROKABOT_DB_PATH
  const originalDateNow = Date.now
  const shutdownWasStarted = isShuttingDown()
  const indexedLines = lines.map((line, index) => ({ line, index }))
  const sortedLines = indexedLines.sort(
    (left, right) => left.line.timestamp - right.line.timestamp || left.index - right.index
  )
  const report: {
    admittedEpisodes: number
    droppedEpisodes: number
    opsPerEpisode: number[]
    duplicatesAvoided: number
    gapDistribution: GapDistribution
    networkCalls: number
  } = {
    admittedEpisodes: 0,
    droppedEpisodes: 0,
    opsPerEpisode: [],
    duplicatesAvoided: 0,
    gapDistribution: measureEpisodeGaps(lines),
    networkCalls: 0
  }

  try {
    closeDb()
    process.env.ROKABOT_DB_PATH = ':memory:'
    resetEpisodeTrackerForTest()
    resetAllBuffers()
    resetShutdown()
    beginShutdown()
    getDb()

    let clock = sortedLines[0]?.line.timestamp ?? originalDateNow()
    Date.now = () => clock
    for (const { line } of sortedLines) {
      clock = line.timestamp
      recordEpisodeMessage({ guildId: line.guildId, channelId: line.channelId, message: line })
    }
    flushOpenEpisodes()
    stopExtractionScheduler()

    const rows = getDb()
      .prepare(
        'SELECT id, guild_id, channel_id, payload, status, attempts, enqueued_at FROM extraction_queue ORDER BY id'
      )
      .all() as Array<{
      id: number
      guild_id: string
      channel_id: string
      payload: string
      status: 'pending' | 'processing'
      attempts: number
      enqueued_at: number
    }>
    for (const row of rows) {
      const context: EpisodeReplayContext = {
        guildId: row.guild_id,
        channelId: row.channel_id,
        episode: JSON.parse(row.payload) as ExtractionEpisode
      }
      if (!(await adapters.admission(context))) {
        report.droppedEpisodes++
        report.opsPerEpisode.push(0)
        continue
      }

      report.admittedEpisodes++
      const output = await adapters.extraction(context)
      report.opsPerEpisode.push(output.ops.filter((op) => op.op !== 'noop').length)
      const verification = await adapters.verification({ ...context, output })
      report.duplicatesAvoided += verification.duplicateOps
    }
    report.networkCalls = adapters.networkCalls?.() ?? 0
    return report
  } finally {
    Date.now = originalDateNow
    stopExtractionScheduler()
    resetEpisodeTrackerForTest()
    resetAllBuffers()
    resetShutdown()
    if (shutdownWasStarted) beginShutdown()
    closeDb()
    if (originalDatabasePath === undefined) process.env.ROKABOT_DB_PATH = undefined
    else process.env.ROKABOT_DB_PATH = originalDatabasePath
  }
}
