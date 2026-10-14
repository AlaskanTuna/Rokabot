/**
 * Samples shadow recall turns from a COPY of the production database and writes every candidate the
 * unified recall considered for them, with the per-kind floors lifted (#262).
 *
 * Usage: ROKABOT_DB_PATH=<second-copy.sqlite> npx tsx scripts/recall-calibration-sample.ts <db-copy.sqlite> <out-dir>
 *        [--turns 150] [--seed 1]
 *
 * The turns come from <db-copy.sqlite>, opened read-only. Recall reads memories through `getDb()`, which writes WAL
 * pragmas and migrations, so ROKABOT_DB_PATH must name a second, disposable copy of the same database.
 * Recall's own query embedding is behind an injected `embed`, and the default one takes its key from
 * GRAPHIFY_GEMINI_API_KEY: a calibration run must not spend the bot's own quota.
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'
import { createGeminiEmbeddingClient } from '../src/agent/memory/embeddings/gemini.js'
import { embedEpisodeText } from '../src/agent/memory/episodeEmbeddings.js'
import { type RecallCandidate, type RecallInput, recallCandidates } from '../src/agent/memory/recall.js'
import { config } from '../src/config.js'
import { getLocalDate } from '../src/utils/timezone.js'

export type Embed = (text: string) => Promise<readonly number[] | null>

export type SampleOptions = Readonly<{ dbPath: string; outDir: string; turns: number; seed: number }>

export type CandidateRow = Readonly<{
  sourceId: number
  channelId: string
  subjectUserId: string
  guildId: string
  createdAt: number
  /** The sampled turn's own text, so a pair names the message the memory answered. */
  message: string
  durationMs: number | null
  tokensEst: number | null
  fallback: boolean
  selected: Array<readonly [string, number, number]>
}>

/** Millisecond timestamps from older production builds that stored seconds instead. */
const SECOND_MS_MAX = 100_000_000_000

/** The speaker's own user message sits within a couple of seconds of the shadow row it caused. */
export const MATCH_WINDOW_MS = 120_000

export function parseArgs(argv: readonly string[]): SampleOptions {
  const positional: string[] = []
  let turns = 150
  let seed = 1
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--turns' || argument === '--seed') {
      const value = Number(argv[++index])
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${argument} must be a non-negative integer`)
      if (argument === '--turns') turns = value
      else seed = value
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown argument: ${argument}`)
    } else {
      positional.push(argument)
    }
  }
  const [dbPath, outDir] = positional
  if (!dbPath || !outDir) {
    throw new Error('Usage: recall-calibration-sample <db-copy.sqlite> <out-dir> [--turns 150] [--seed 1]')
  }
  return { dbPath, outDir, turns, seed }
}

export function toMillis(timestamp: number): number {
  return timestamp < SECOND_MS_MAX ? timestamp * 1000 : timestamp
}

export function turnRef(channelId: string, createdAt: number): string {
  return createHash('sha256').update(`${channelId}|${createdAt}`).digest('hex').slice(0, 16)
}

/** Deterministic PRNG, so the same seed picks the same turns from the same database. */
export function seededRandom(seed: number): () => number {
  let state = (seed ^ 0x6d2b79f5) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

function parseDetail(detail: string): { fallback: boolean; selected: Array<readonly [string, number, number]> } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(detail)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { fallback, selected } = parsed as Record<string, unknown>
  if (typeof fallback !== 'boolean' || !Array.isArray(selected)) return null
  const tuples: Array<readonly [string, number, number]> = []
  for (const entry of selected) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[2] !== 'number') return null
    tuples.push([entry[0], Number(entry[1]), entry[2]])
  }
  return { fallback, selected: tuples }
}

function requiredColumns(table: string, database: Database.Database, names: readonly string[]): void {
  const columns = new Set(
    (database.prepare(`PRAGMA table_info('${table}')`).all() as Array<{ name: string }>).map(({ name }) => name)
  )
  for (const name of names) {
    if (!columns.has(name))
      throw new Error(`${table} has no ${name} column; this does not look like a rokabot database`)
  }
}

/** Read-only shadow rows: one guild turn each, with the text-free selection the unified recall logged. */
export function loadShadowRows(dbPath: string): CandidateRow[] {
  const database = new Database(resolve(dbPath), { readonly: true, fileMustExist: true })
  try {
    requiredColumns('memory_events', database, ['kind', 'guild_id', 'channel_id', 'subject_user_id', 'detail'])
    requiredColumns('session_history', database, ['channel_id', 'role', 'display_name', 'content', 'timestamp'])
    const rows = database
      .prepare(
        `SELECT id, guild_id, channel_id, subject_user_id, detail, duration_ms, tokens_est, created_at
         FROM memory_events
         WHERE kind = 'recall_shadow' AND detail IS NOT NULL AND guild_id IS NOT NULL
           AND channel_id IS NOT NULL AND subject_user_id IS NOT NULL
         ORDER BY created_at, id`
      )
      .all() as Array<{
      id: number
      guild_id: string
      channel_id: string
      subject_user_id: string
      detail: string
      duration_ms: number | null
      tokens_est: number | null
      created_at: number
    }>

    const turns: CandidateRow[] = []
    for (const row of rows) {
      const detail = parseDetail(row.detail)
      if (!detail) continue
      const createdAt = toMillis(row.created_at)
      // The same guard as matchTurnMessage: a DM channel or guild never has session text to match.
      if (row.channel_id.startsWith('dm:') || row.guild_id.startsWith('dm:')) continue
      const message = matchTurnMessage(database, row.channel_id, row.subject_user_id, createdAt)
      if (!message) continue
      turns.push({
        sourceId: row.id,
        channelId: row.channel_id,
        subjectUserId: row.subject_user_id,
        guildId: row.guild_id,
        createdAt,
        message,
        durationMs: row.duration_ms,
        tokensEst: row.tokens_est,
        fallback: detail.fallback,
        selected: detail.selected
      })
    }
    return turns
  } finally {
    database.close()
  }
}

/**
 * The turn's own text: the speaker's user message nearest before the row, inside the window. The row records the
 * speaker as `subject_user_id`, but session_history only carries `user_id` on rows written since that column
 * existed, so an ownerless (legacy) row stands in when the identified match finds nothing. A slash-command `/ask`
 * turn writes no shadow row, and a failed turn writes no history row, so the window is the only thing keeping a
 * neighbouring message from standing in for a missing one.
 */
export function matchTurnMessage(
  database: Database.Database,
  channelId: string,
  subjectUserId: string,
  createdAt: number
): string | undefined {
  const nearest = (userId: string | null): string | undefined =>
    (
      database
        .prepare(
          `SELECT content FROM session_history
       WHERE channel_id = ? AND role = 'user' AND timestamp <= ? AND timestamp >= ?
         AND (? IS NULL OR user_id = ? OR user_id IS NULL)
       ORDER BY timestamp DESC, rowid DESC LIMIT 1`
        )
        .get(channelId, createdAt, createdAt - MATCH_WINDOW_MS, userId, userId) as { content: string } | undefined
    )?.content
  return nearest(subjectUserId) ?? nearest(null)
}

/** Seeded sample spread over guilds and calendar days, then shuffled so judge order carries no signal. */
export function pickSample(turns: readonly CandidateRow[], wanted: number, seed: number): CandidateRow[] {
  const inOrder = [...turns].sort((left, right) => left.createdAt - right.createdAt || left.sourceId - right.sourceId)
  // One per (guild, day) bucket first, so no single busy day or server can fill the budget.
  const buckets = new Map<string, CandidateRow[]>()
  for (const turn of inOrder) {
    const key = `${turn.guildId}|${getLocalDate(turn.createdAt)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(turn)
    else buckets.set(key, [turn])
  }
  const random = seededRandom(seed)
  const spread: CandidateRow[] = []
  for (const bucket of buckets.values()) spread.push(bucket[Math.floor(random() * bucket.length)])
  const chosen = spread.length <= wanted ? spread.slice() : pickRandom(spread, wanted, random)
  if (chosen.length < wanted) {
    const picked = new Set(chosen.map(({ sourceId }) => sourceId))
    const rest = inOrder.filter((turn) => !picked.has(turn.sourceId))
    chosen.push(...pickRandom(rest, wanted - chosen.length, random))
  }
  for (let index = chosen.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1))
    ;[chosen[index], chosen[swap]] = [chosen[swap], chosen[index]]
  }
  return chosen
}

function pickRandom(pool: readonly CandidateRow[], count: number, random: () => number): CandidateRow[] {
  const remaining = pool.slice()
  const picked: CandidateRow[] = []
  while (picked.length < count && remaining.length > 0) {
    picked.push(...remaining.splice(Math.floor(random() * remaining.length), 1))
  }
  return picked
}

export type PairLine = Readonly<{
  pairId: string
  turnRef: string
  kind: string
  message: string
  memoryText: string
  similarity: number
  score: number
  keptByCurrentFloor: boolean
}>

export type Summary = Readonly<{
  sampledTurns: number
  totalPairs: number
  memoriesPerTurnMedian: number
  memoriesPerTurnMax: number
  avgTokensEst: number
  avgDurationMs: number
  fallbackTurns: number
  selectedByKind: Record<string, number>
}>

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarise(
  selectedByKind: Record<string, number>,
  perTurn: readonly number[],
  tokens: readonly number[],
  durations: readonly number[],
  fallbacks: number,
  totalPairs: number
): Summary {
  return {
    sampledTurns: perTurn.length,
    totalPairs,
    memoriesPerTurnMedian: median(perTurn),
    memoriesPerTurnMax: perTurn.length === 0 ? 0 : Math.max(...perTurn),
    avgTokensEst: mean(tokens),
    avgDurationMs: mean(durations),
    fallbackTurns: fallbacks,
    selectedByKind
  }
}

function pairLines(turn: CandidateRow, candidates: readonly RecallCandidate[]): PairLine[] {
  const reference = turnRef(turn.channelId, turn.createdAt)
  return candidates.map((candidate) => ({
    pairId: `${reference}-${candidate.kind}-${candidate.id}`,
    turnRef: reference,
    kind: candidate.kind,
    message: candidate.message,
    memoryText: candidate.text,
    similarity: candidate.similarity,
    score: candidate.score,
    keptByCurrentFloor: candidate.keptByCurrentFloor
  }))
}

/** One shared turn budget, so both runs order candidates identically and only the floors differ. */
function recallInputFor(turn: CandidateRow, queryEmbedding: readonly number[] | null): RecallInput {
  return {
    scope: { guildId: turn.guildId, channelId: turn.channelId },
    speakerId: turn.subjectUserId,
    participantIds: [],
    namedIds: [],
    message: turn.message,
    queryEmbedding,
    now: turn.createdAt
  }
}

export async function runSample(options: SampleOptions, embed: Embed): Promise<Summary> {
  const all = loadShadowRows(options.dbPath)
  const sample = pickSample(all, options.turns, options.seed)
  console.log(`${all.length} text-matched shadow turns, sampling ${sample.length}`)

  const lines: PairLine[] = []
  const perTurn: number[] = []
  const tokens: number[] = []
  const durations: number[] = []
  const selectedByKind: Record<string, number> = {}
  let fallbacks = 0
  // The free embedding tier allows 100 requests a minute, so turns embed one at a time.
  const batches = chunk(sample, 1)
  for (const batch of batches) {
    await Promise.all(
      batch.map(async (turn) => {
        const queryEmbedding = await embed(turn.message)
        const candidates = recallCandidates(recallInputFor(turn, queryEmbedding))
        lines.push(...pairLines(turn, candidates))
        perTurn.push(candidates.length)
        if (turn.tokensEst !== null) tokens.push(turn.tokensEst)
        if (turn.durationMs !== null) durations.push(turn.durationMs)
        if (turn.fallback) fallbacks += 1
        for (const [kind] of turn.selected) selectedByKind[kind] = (selectedByKind[kind] ?? 0) + 1
      })
    )
    console.log(`  ${lines.length} pairs`)
  }

  lines.sort(
    (left, right) =>
      left.turnRef.localeCompare(right.turnRef) ||
      left.kind.localeCompare(right.kind) ||
      left.pairId.localeCompare(right.pairId)
  )
  await mkdir(options.outDir, { recursive: true })
  await writeFile(
    join(options.outDir, 'pairs.jsonl'),
    lines.map((line) => JSON.stringify(line)).join('\n') + (lines.length > 0 ? '\n' : ''),
    'utf8'
  )
  const summary = summarise(selectedByKind, perTurn, tokens, durations, fallbacks, lines.length)
  await writeFile(join(options.outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  return summary
}

/** Reads the key from GRAPHIFY_GEMINI_API_KEY only: the bot's own key funds live replies, not calibration. */
function configuredEmbed(): Embed {
  if (config.embeddings.provider !== 'gemini') {
    return async (text) => (await embedEpisodeText({ text, role: 'RETRIEVAL_QUERY' })).values
  }
  const key = process.env.GRAPHIFY_GEMINI_API_KEY
  if (!key) throw new Error('Set GRAPHIFY_GEMINI_API_KEY (never GEMINI_API_KEY) before sampling')
  const client = createGeminiEmbeddingClient({ ...config.embeddings, apiKey: key })
  return async (text) => {
    await new Promise((done) => setTimeout(done, 750))
    try {
      return (await client.embed(text, 'query')).values
    } catch {
      await new Promise((done) => setTimeout(done, 30_000))
      return (await client.embed(text, 'query')).values
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const summary = await runSample(options, configuredEmbed())
  console.log(JSON.stringify(summary, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
