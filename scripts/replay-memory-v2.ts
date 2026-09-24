import { readFile, readdir } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import type { ExtractionEpisode } from '../src/storage/extractionQueue.js'
import type { MemoryEpisodeReplayAdapters, MemoryEpisodeReplayLine } from '../tests/harness/memoryEpisodeReplay.js'

const DUMMY = 'rokabot-offline-replay-dummy'

type ReplayArgs = {
  live: boolean
  transcripts: string
  sessionHistory?: string
}

type ReplayMetrics = {
  networkCalls: number
  latencyMs: number
  inputTokensEstimate: number
  outputTokensEstimate: number
}

function argumentsFrom(argv: string[]): ReplayArgs {
  const args: ReplayArgs = { live: false, transcripts: 'tests/harness/transcripts' }
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--live') args.live = true
    else if (argument === '--transcripts' && argv[index + 1]) args.transcripts = argv[++index]
    else if (argument === '--session-history' && argv[index + 1]) args.sessionHistory = argv[++index]
    else throw new Error(`Unknown or incomplete argument: ${argument}`)
  }
  return args
}

async function transcriptFiles(path: string): Promise<string[]> {
  const target = resolve(path)
  const entries = await readdir(target, { withFileTypes: true })
  if (!entries.some((entry) => entry.isFile())) return []
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name) === '.jsonl')
    .map((entry) => join(target, entry.name))
    .sort()
}

async function loadTranscriptLines(path: string): Promise<MemoryEpisodeReplayLine[]> {
  const paths = await transcriptFiles(path)
  const lines: MemoryEpisodeReplayLine[] = []
  for (const file of paths) {
    const rows = (await readFile(file, 'utf8')).split(/\r?\n/).filter((line) => line.trim().length > 0)
    rows.forEach((raw, index) => {
      let value: unknown
      try {
        value = JSON.parse(raw)
      } catch {
        throw new Error(`Invalid JSON in ${basename(file)} line ${index + 1}`)
      }
      if (!value || typeof value !== 'object') throw new Error(`Invalid transcript row in ${basename(file)}`)
      const row = value as Record<string, unknown>
      if (row.kind === 'slash') return
      for (const key of ['guildId', 'channelId', 'userId', 'displayName', 'content'] as const) {
        if (typeof row[key] !== 'string' || row[key].length === 0) {
          throw new Error(`Transcript ${basename(file)} line ${index + 1} requires ${key}`)
        }
      }
      const timestamp = typeof row.timestamp === 'number' ? row.timestamp : lines.length * 60_000
      lines.push({
        guildId: row.guildId as string,
        channelId: row.channelId as string,
        messageId: `transcript-${basename(file)}-${index + 1}`,
        userId: row.userId as string,
        displayName: row.displayName as string,
        content: (row.content as string).replace(/<@!?roka>/gi, '').trim(),
        timestamp,
        isBot: false
      })
    })
  }
  return lines
}

function inputText(episode: ExtractionEpisode): string {
  return [...episode.context, ...episode.messages]
    .map(({ userId, displayName, content }) => `[${userId}|${displayName}]: ${content}`)
    .join('\n')
}

function estimatedTokens(value: string): number {
  return Math.ceil(value.length / 4)
}

function offlineAdapters(): { adapters: MemoryEpisodeReplayAdapters; metrics: ReplayMetrics } {
  const metrics = { networkCalls: 0, latencyMs: 0, inputTokensEstimate: 0, outputTokensEstimate: 0 }
  return {
    metrics,
    adapters: {
      admission: async () => true,
      extraction: async () => ({ ops: [], summary: 'Offline replay stub' }),
      verification: async () => ({ appliedOps: 0, droppedOps: 0, duplicateOps: 0 }),
      networkCalls: () => metrics.networkCalls
    }
  }
}

async function liveAdapters(): Promise<{ adapters: MemoryEpisodeReplayAdapters; metrics: ReplayMetrics }> {
  if (process.env.ROKABOT_MEMORY_REPLAY_LIVE !== '1') {
    throw new Error('Live replay requires ROKABOT_MEMORY_REPLAY_LIVE=1')
  }
  if (!process.env.GEMINI_API_KEY || !process.env.TYPESAFE_API_KEY) {
    throw new Error('Live replay requires GEMINI_API_KEY and TYPESAFE_API_KEY')
  }

  const [{ admitEpisode }, { extractEpisode, verifyAndApplyOperations }] = await Promise.all([
    import('../src/agent/memory/admission.js'),
    import('../src/agent/memory/extractor.js')
  ])
  const metrics = { networkCalls: 0, latencyMs: 0, inputTokensEstimate: 0, outputTokensEstimate: 0 }

  async function measure<T>(
    episode: ExtractionEpisode,
    action: () => Promise<T>
  ): Promise<{ value: T; elapsedMs: number }> {
    const startedAt = performance.now()
    const value = await action()
    const elapsedMs = performance.now() - startedAt
    metrics.latencyMs += elapsedMs
    metrics.inputTokensEstimate += estimatedTokens(inputText(episode))
    metrics.outputTokensEstimate += estimatedTokens(JSON.stringify(value))
    return { value, elapsedMs }
  }

  const adapters: MemoryEpisodeReplayAdapters = {
    admission: async (context) => {
      const { value } = await measure(context.episode, () =>
        admitEpisode({ guildId: context.guildId, channelId: context.channelId, episode: context.episode })
      )
      if (value.reason === 'admitted' || value.reason === 'below_threshold') metrics.networkCalls++
      return value.admitted
    },
    extraction: async (context) => {
      metrics.networkCalls++
      return (
        await measure(context.episode, () =>
          extractEpisode({ guildId: context.guildId, channelId: context.channelId, episode: context.episode })
        )
      ).value
    },
    verification: async ({ guildId, channelId, episode, output }) => {
      if (output.ops.some((op) => op.op !== 'noop')) metrics.networkCalls++
      return (
        await measure(episode, () =>
          verifyAndApplyOperations({
            guildId,
            channelId,
            episode,
            output,
            subjectIds: new Set(episode.messages.filter((message) => !message.isBot).map((message) => message.userId))
          })
        )
      ).value
    },
    networkCalls: () => metrics.networkCalls
  }
  return { adapters, metrics }
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2))
  if (!args.live) {
    process.env.DOTENV_CONFIG_PATH = '/dev/null'
    process.env.DISCORD_TOKEN = DUMMY
    process.env.DISCORD_CLIENT_ID = DUMMY
    process.env.GEMINI_API_KEY = DUMMY
  } else if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
    process.env.DISCORD_TOKEN ??= DUMMY
    process.env.DISCORD_CLIENT_ID ??= DUMMY
  }

  const [{ replayEpisodes, loadSessionHistorySnapshot, measureEpisodeGaps }] = await Promise.all([
    import('../tests/harness/memoryEpisodeReplay.js')
  ])
  const transcriptLines = await loadTranscriptLines(args.transcripts)
  const snapshot = args.sessionHistory ? loadSessionHistorySnapshot(args.sessionHistory) : undefined
  const allLines = [...transcriptLines, ...(snapshot?.lines ?? [])]
  const { adapters, metrics } = args.live ? await liveAdapters() : offlineAdapters()
  const report = await replayEpisodes(allLines, adapters)
  console.log(
    JSON.stringify(
      {
        source_rows: allLines.length,
        transcript_rows: transcriptLines.length,
        snapshot_rows: snapshot?.lines.length ?? 0,
        unmapped_rows: snapshot?.unmappedRows ?? 0,
        ambiguous_rows: snapshot?.ambiguousRows ?? 0,
        admitted_episodes: report.admittedEpisodes,
        dropped_episodes: report.droppedEpisodes,
        ops_per_episode: report.opsPerEpisode,
        duplicates_avoided: report.duplicatesAvoided,
        gap_distribution: report.gapDistribution,
        snapshot_gap_distribution: snapshot ? measureEpisodeGaps(snapshot.lines) : null,
        network_calls: report.networkCalls,
        latency_ms: Math.round(metrics.latencyMs),
        input_tokens_estimate: metrics.inputTokensEstimate,
        output_tokens_estimate: metrics.outputTokensEstimate
      },
      null,
      2
    )
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
