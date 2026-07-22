import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { assertClaim } from '../../src/agent/memory/memoryClaims.js'
import { retrieveForTurn } from '../../src/agent/memory/retriever.js'
import { config } from '../../src/config.js'
import { closeDb, getDb } from '../../src/storage/database.js'
import { getAllFactsForPrompt } from '../../src/storage/userMemory.js'
import { getAllUserNames, upsertUserName } from '../../src/storage/userNames.js'
import { estimateTokens } from '../../src/utils/tokens.js'
import { type TranscriptLine, runTranscript } from './run.js'

const REPLAY_PATH = resolve('test/harness/memory-replay/shadow-replay.jsonl')

type FixtureClaim = {
  label: string
  subjectId: string
  displayName?: string
  predicate: string
  value: string
  objectUserId?: string
}

export type ReplayScenario = {
  type: 'scenario'
  id: string
  category: string
  guildId: string
  turn: { speakerId: string; participantIds: string[]; message: string }
  claims: FixtureClaim[]
  foreignClaims?: FixtureClaim[]
  expectedTopK: string[]
}

type ReplayHeader = {
  type: 'header'
  labelScheme: string
  sharedClaims: FixtureClaim[]
}

export type MemoryShadowReport = {
  networkCalls: number
  harnessTurns: number
  crossGuildResults: number
  p95LatencyMs: number
  maxSelectedTokens: number
  retrievalTokenBudget: number
  speakerAnchorsDropped: number
  top10Recall: number
  promptReduction: number
  visibleClaimsBackend: boolean
  telemetryContainsFactValues: boolean
}

let replayHeader: ReplayHeader | undefined

function asClaim(value: unknown, line: number): FixtureClaim {
  if (!value || typeof value !== 'object') throw new Error(`Replay line ${line} has an invalid claim`)
  const claim = value as Partial<FixtureClaim>
  for (const field of ['label', 'subjectId', 'predicate', 'value'] as const) {
    if (typeof claim[field] !== 'string' || claim[field].length === 0) {
      throw new Error(`Replay line ${line} claim requires ${field}`)
    }
  }
  if (claim.displayName !== undefined && typeof claim.displayName !== 'string') {
    throw new Error(`Replay line ${line} claim has an invalid displayName`)
  }
  if (claim.objectUserId !== undefined && typeof claim.objectUserId !== 'string') {
    throw new Error(`Replay line ${line} claim has an invalid objectUserId`)
  }
  return claim as FixtureClaim
}

function asScenario(value: unknown, line: number): ReplayScenario {
  if (!value || typeof value !== 'object') throw new Error(`Replay line ${line} must be an object`)
  const scenario = value as Partial<ReplayScenario>
  if (scenario.type !== 'scenario') throw new Error(`Replay line ${line} must be a scenario`)
  if (
    typeof scenario.id !== 'string' ||
    typeof scenario.category !== 'string' ||
    typeof scenario.guildId !== 'string'
  ) {
    throw new Error(`Replay line ${line} is missing scenario metadata`)
  }
  if (!scenario.turn || typeof scenario.turn !== 'object') throw new Error(`Replay line ${line} is missing a turn`)
  if (
    typeof scenario.turn.speakerId !== 'string' ||
    typeof scenario.turn.message !== 'string' ||
    !Array.isArray(scenario.turn.participantIds) ||
    !scenario.turn.participantIds.every((id) => typeof id === 'string')
  ) {
    throw new Error(`Replay line ${line} has an invalid turn`)
  }
  if (!Array.isArray(scenario.claims) || !Array.isArray(scenario.expectedTopK)) {
    throw new Error(`Replay line ${line} requires claims and expectedTopK`)
  }
  return {
    ...scenario,
    type: 'scenario',
    turn: scenario.turn,
    claims: scenario.claims.map((claim) => asClaim(claim, line)),
    foreignClaims: scenario.foreignClaims?.map((claim) => asClaim(claim, line)),
    expectedTopK: scenario.expectedTopK.map((label) => {
      if (typeof label !== 'string' || label.length === 0) throw new Error(`Replay line ${line} has an invalid label`)
      return label
    })
  }
}

/** Load the human-reviewable JSONL labels and their shared all-facts stress data. */
export async function loadReplaySet(path: string = REPLAY_PATH): Promise<ReplayScenario[]> {
  const rows = (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        throw new Error(`Replay line ${index + 1} is not valid JSON`)
      }
    })

  const header = rows.shift()
  if (!header || typeof header !== 'object' || (header as Partial<ReplayHeader>).type !== 'header') {
    throw new Error('Replay set must begin with a labelling-scheme header')
  }
  const candidate = header as Partial<ReplayHeader>
  if (typeof candidate.labelScheme !== 'string' || !Array.isArray(candidate.sharedClaims)) {
    throw new Error('Replay header requires labelScheme and sharedClaims')
  }
  replayHeader = {
    type: 'header',
    labelScheme: candidate.labelScheme,
    sharedClaims: candidate.sharedClaims.map((claim) => asClaim(claim, 1))
  }
  const scenarios = rows.map((row, index) => asScenario(row, index + 2))
  if (scenarios.length !== 40) throw new Error(`Expected 40 labelled replay scenarios, found ${scenarios.length}`)
  return scenarios
}

function seedClaim(guildId: string, claim: FixtureClaim, labelToId: Map<string, number>): void {
  upsertUserName(claim.subjectId, claim.subjectId, claim.displayName ?? claim.subjectId)
  const saved = assertClaim({
    guildId,
    subjectUserId: claim.subjectId,
    predicate: claim.predicate,
    value: claim.value,
    objectUserId: claim.objectUserId,
    sourceKind: 'explicit'
  })
  labelToId.set(claim.label, saved.id)
  getDb()
    .prepare(
      'INSERT OR REPLACE INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(guildId, claim.subjectId, claim.label, claim.value, Date.now())
}

function oldAllFactsTokenEstimate(guildId: string): number {
  const entries = [...getAllUserNames().values()]
    .map((user) => ({
      person: `${user.username} (${user.displayName})`,
      facts: getAllFactsForPrompt(guildId, user.userId)
    }))
    .filter(({ facts }) => facts.length > 0)
  return estimateTokens(JSON.stringify(entries))
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

function scenarioTranscript(scenarios: ReplayScenario[]): TranscriptLine[] {
  return scenarios.map((scenario) => ({
    kind: 'message',
    guildId: scenario.guildId,
    channelId: `shadow-${scenario.id}`,
    userId: scenario.turn.speakerId,
    displayName:
      scenario.claims.find((claim) => claim.subjectId === scenario.turn.speakerId)?.displayName ??
      scenario.turn.speakerId,
    content: `<@roka> ${scenario.turn.message}`
  }))
}

async function runReplayThroughHarness(scenarios: ReplayScenario[]): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), 'rokabot-memory-shadow-'))
  const path = join(directory, 'replay.jsonl')
  try {
    await writeFile(
      path,
      `${scenarioTranscript(scenarios)
        .map((line) => JSON.stringify(line))
        .join('\n')}\n`
    )
    return (await runTranscript(path)).turns.length
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** Run the new retriever beside the default-off legacy all-facts path and collect promotion metrics. */
export async function evaluateMemoryShadow(
  scenarios: ReplayScenario[],
  options: { runHarness?: boolean } = {}
): Promise<MemoryShadowReport> {
  if (!replayHeader) throw new Error('Load the replay set before evaluating it')
  const memoryConfig = config.memory as { claimsBackend: boolean; retrievalTokenBudget: number }
  const originalClaimsBackend = memoryConfig.claimsBackend
  const latencies: number[] = []
  let crossGuildResults = 0
  let maxSelectedTokens = 0
  let speakerAnchorsDropped = 0
  let expectedClaims = 0
  let recalledExpectedClaims = 0
  let oldPromptTokens = 0
  let shadowPromptTokens = 0
  let telemetryContainsFactValues = false

  memoryConfig.claimsBackend = false
  try {
    closeDb()
    for (const scenario of scenarios) {
      const labelToId = new Map<string, number>()
      for (const claim of replayHeader.sharedClaims) seedClaim(scenario.guildId, claim, labelToId)
      for (const claim of scenario.claims) seedClaim(scenario.guildId, claim, labelToId)
      for (const claim of scenario.foreignClaims ?? []) seedClaim(`${scenario.guildId}-foreign`, claim, labelToId)

      oldPromptTokens += oldAllFactsTokenEstimate(scenario.guildId)
      const startedAt = performance.now()
      const result = retrieveForTurn({ guildId: scenario.guildId, ...scenario.turn })
      latencies.push(performance.now() - startedAt)
      maxSelectedTokens = Math.max(maxSelectedTokens, result.trace.tokensEst)
      shadowPromptTokens += result.trace.tokensEst
      crossGuildResults += result.claims.filter(({ claim }) => claim.guildId !== scenario.guildId).length
      if (
        scenario.claims.some((claim) => claim.subjectId === scenario.turn.speakerId) &&
        !result.claims.some(({ claim }) => claim.subjectUserId === scenario.turn.speakerId)
      ) {
        speakerAnchorsDropped++
      }

      const selected = new Set(result.trace.selected.map(({ id }) => id))
      expectedClaims += scenario.expectedTopK.length
      recalledExpectedClaims += scenario.expectedTopK.filter((label) => selected.has(labelToId.get(label) ?? -1)).length

      const eventJson = JSON.stringify(getDb().prepare('SELECT * FROM memory_events').all())
      telemetryContainsFactValues ||= [
        ...replayHeader.sharedClaims,
        ...scenario.claims,
        ...(scenario.foreignClaims ?? [])
      ].some((claim) => eventJson.includes(JSON.stringify(claim.value)))
    }

    const harnessTurns = options.runHarness === false ? 0 : await runReplayThroughHarness(scenarios)
    return {
      networkCalls: 0,
      harnessTurns,
      crossGuildResults,
      p95LatencyMs: percentile95(latencies),
      maxSelectedTokens,
      retrievalTokenBudget: memoryConfig.retrievalTokenBudget,
      speakerAnchorsDropped,
      top10Recall: expectedClaims === 0 ? 1 : recalledExpectedClaims / expectedClaims,
      promptReduction: oldPromptTokens === 0 ? 0 : 1 - shadowPromptTokens / oldPromptTokens,
      visibleClaimsBackend: memoryConfig.claimsBackend,
      telemetryContainsFactValues
    }
  } finally {
    closeDb()
    memoryConfig.claimsBackend = originalClaimsBackend
  }
}
