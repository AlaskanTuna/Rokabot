import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertClaim } from '../../src/agent/memory/memoryClaims.js'
import { recallCandidates, recallForTurn } from '../../src/agent/memory/recall.js'
import { config } from '../../src/config.js'
import { closeDb, getDb } from '../../src/storage/database.js'
import { encodeFloat32Embedding } from '../../src/storage/memoryEpisodeStore.js'
import { saveMemoryEpisode } from '../../src/storage/memoryEpisodeStore.js'
import { setClaimEmbedding } from '../../src/storage/memoryRecallStore.js'
import {
  type CandidateRow,
  type Embed,
  loadShadowRows,
  matchTurnMessage,
  pickSample,
  runSample,
  turnRef
} from '../recall-calibration-sample.js'
import {
  chooseFloor,
  cohensKappa,
  parseLabels,
  parsePairs,
  reportKinds,
  main as thresholdsMain
} from '../recall-calibration-thresholds.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const GUILD = 'guild-calib'
const CHANNEL = 'chan-calib'

const axis = (index: number): number[] =>
  Array.from({ length: config.embeddings.dim }, (_, position) => (position === index ? 1 : 0))
const mix = (index: number, other: number, weight: number): number[] =>
  axis(index).map((value, position) => value * Math.sqrt(1 - weight * weight) + (position === other ? weight : 0))

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

let directory = ''

function shadowRow(input: {
  id: number
  guildId?: string | null
  channelId?: string | null
  subjectUserId?: string | null
  detail?: string | null
  createdAt: number
  durationMs?: number | null
  tokensEst?: number | null
}): void {
  getDb()
    .prepare(
      `INSERT INTO memory_events (id, kind, guild_id, channel_id, subject_user_id, duration_ms, tokens_est, detail, created_at)
       VALUES (?, 'recall_shadow', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.guildId === undefined ? GUILD : input.guildId,
      input.channelId === undefined ? CHANNEL : input.channelId,
      input.subjectUserId === undefined ? 'alice' : input.subjectUserId,
      input.durationMs ?? 12,
      input.tokensEst ?? 40,
      input.detail === undefined ? detailOf([['fact', 1, 0.8]]) : input.detail,
      input.createdAt
    )
}

function detailOf(selected: Array<[string, number, number]>, fallback = false): string {
  return JSON.stringify({ mode: 'shadow', privacy: 'relaxed', fallback, gated: 0, selected })
}

function history(channelId: string, role: string, displayName: string, content: string, timestamp: number): void {
  getDb()
    .prepare(
      'INSERT INTO session_history (channel_id, role, display_name, content, timestamp, user_id, username) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(channelId, role, displayName, content, timestamp, role === 'user' ? 'alice' : null, null)
}

/** The production copy is a WAL database; the fixture is checkpointed so it reads as one file, like a .backup. */
function openFixture(): string {
  process.env.ROKABOT_DB_PATH = join(directory, 'copy.db')
  getDb()
  closeDb()
  return process.env.ROKABOT_DB_PATH
}

function reopenReadWrite(dbPath: string): void {
  const database = new Database(dbPath)
  database.pragma('wal_checkpoint(TRUNCATE)')
  database.close()
  process.env.ROKABOT_DB_PATH = dbPath
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'recall-calibration-'))
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
  rmSync(directory, { recursive: true, force: true })
})

describe('sampling shadow turns', () => {
  it('matches the speaker message nearest before the row inside two minutes', () => {
    const dbPath = openFixture()
    shadowRow({ id: 1, createdAt: NOW })
    shadowRow({ id: 2, guildId: null, channelId: null, subjectUserId: null, createdAt: NOW + 1000 })
    closeDb()
    reopenReadWrite(dbPath)
    getDb()
    history(CHANNEL, 'assistant', 'Roka', 'an earlier reply', NOW - 60_000)
    history(CHANNEL, 'user', 'Alice', 'far too old', NOW - 200_000)
    history(CHANNEL, 'user', 'Alice', 'the nearest one', NOW - 5_000)
    history(CHANNEL, 'user', 'Bob', 'someone else', NOW - 1_000)
    history(CHANNEL, 'user', 'Alice', 'after the row', NOW + 5_000)
    closeDb()

    const turns = loadShadowRows(dbPath)

    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ sourceId: 1, guildId: GUILD, channelId: CHANNEL, subjectUserId: 'alice' })
  })

  it('falls back to the nearest user message when the history row predates the user_id column', () => {
    const dbPath = openFixture()
    shadowRow({ id: 1, createdAt: NOW })
    closeDb()
    reopenReadWrite(dbPath)
    getDb()
    getDb()
      .prepare(
        'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
      )
      .run(CHANNEL, 'user', 'Alice', 'legacy row', NOW - 1000)
    closeDb()

    expect(loadShadowRows(dbPath)[0].message).toBe('legacy row')
  })

  it('drops rows whose text is gone, whose channel is a DM, or whose detail is unusable', () => {
    const dbPath = openFixture()
    shadowRow({ id: 1, createdAt: NOW })
    shadowRow({ id: 2, guildId: 'dm:1', channelId: 'dm:1', createdAt: NOW })
    shadowRow({ id: 3, detail: null, createdAt: NOW })
    shadowRow({ id: 4, detail: '{"mode":"shadow"}', createdAt: NOW })
    closeDb()
    reopenReadWrite(dbPath)
    getDb()
    // The nearest user message is older than the two-minute window, so row 1's turn text is gone too.
    history(CHANNEL, 'user', 'Alice', 'present', NOW - 200_000)
    closeDb()

    expect(loadShadowRows(dbPath)).toEqual([])
  })

  it('keeps the row counts, fallback flag and selection the turn logged, then reads seconds as milliseconds', () => {
    const dbPath = openFixture()
    shadowRow({
      id: 1,
      createdAt: (NOW - 1000) / 1000,
      durationMs: 31,
      tokensEst: 55,
      detail: detailOf(
        [
          ['fact', 7, 0.812],
          ['conversation', 3, 0.5]
        ],
        true
      )
    })
    closeDb()
    reopenReadWrite(dbPath)
    getDb()
    history(CHANNEL, 'user', 'Alice', 'hello', NOW - 1000)
    closeDb()

    const [turn] = loadShadowRows(dbPath)

    expect(turn).toMatchObject({
      createdAt: NOW - 1000,
      durationMs: 31,
      tokensEst: 55,
      fallback: true,
      selected: [
        ['fact', 7, 0.812],
        ['conversation', 3, 0.5]
      ]
    })
  })

  it('refuses a database without the tables it reads', () => {
    const dbPath = join(directory, 'not-rokabot.db')
    new Database(dbPath).close()

    expect(() => loadShadowRows(dbPath)).toThrow(/memory_events has no kind column/)
  })

  it('picks the same turns for the same seed and spreads them across guilds and days', () => {
    const turns: CandidateRow[] = []
    let sourceId = 0
    for (let day = 0; day < 40; day++) {
      for (const guild of ['guild-a', 'guild-b']) {
        for (let repeat = 0; repeat < 3; repeat++) {
          const createdAt = NOW + day * DAY + repeat * 60_000
          sourceId += 1
          turns.push({
            sourceId,
            channelId: `chan-${sourceId}`,
            subjectUserId: 'alice',
            guildId: guild,
            createdAt,
            durationMs: 12,
            tokensEst: 40,
            fallback: false,
            selected: []
          })
        }
      }
    }

    const first = pickSample(turns, 20, 7)
    const second = pickSample(turns, 20, 7)

    expect(first).toHaveLength(20)
    expect(first.map(({ sourceId }) => sourceId)).toEqual(second.map(({ sourceId }) => sourceId))
    expect(new Set(first.map(({ guildId }) => guildId)).size).toBe(2)
    expect(new Set(first.map(({ createdAt }) => Math.floor(createdAt / DAY))).size).toBeGreaterThan(10)
    // Every sampled turn is a distinct source row, whatever the buckets and the shuffle did.
    expect(new Set(first.map(({ sourceId }) => sourceId)).size).toBe(20)
  })

  it('hashes the turn reference so no channel or guild id reaches the output', () => {
    const reference = turnRef(CHANNEL, NOW)

    expect(reference).toMatch(/^[0-9a-f]{16}$/)
    expect(reference).not.toContain(CHANNEL)
    expect(turnRef(CHANNEL, NOW + 1)).not.toBe(reference)
  })

  it('leaves the database copy untouched while reading it', () => {
    const dbPath = openFixture()
    shadowRow({ id: 1, createdAt: NOW })
    closeDb()
    reopenReadWrite(dbPath)
    getDb()
    history(CHANNEL, 'user', 'Alice', 'hello', NOW)
    closeDb()
    const before = sha256(dbPath)

    loadShadowRows(dbPath)

    expect(sha256(dbPath)).toBe(before)
  })
})

describe('sampling pairs against the real schema', () => {
  const embed: Embed = async (text) => (text === 'hello there' ? axis(1) : axis(2))

  function seedGuild(): void {
    const claim = assertClaim({
      guildId: GUILD,
      subjectUserId: 'alice',
      predicate: 'hobby',
      value: 'restoring old clocks',
      sourceKind: 'passive',
      channelId: CHANNEL,
      observedAt: NOW
    })
    setClaimEmbedding({
      id: claim.id,
      embeddingText: 'hobby: restoring old clocks',
      embedding: {
        values: mix(1, 5, 0.9),
        modelId: config.embeddings.model,
        dim: config.embeddings.dim,
        fingerprint: config.embeddings.fingerprint
      }
    })
  }

  it('writes a pair for a memory the current floor discards, and a summary beside it', async () => {
    const dbPath = openFixture()
    shadowRow({
      id: 1,
      createdAt: NOW + 1000,
      tokensEst: 40,
      durationMs: 9,
      detail: detailOf([['fact', 1, 0.9]])
    })
    closeDb()
    reopenReadWrite(dbPath)
    getDb()
    history(CHANNEL, 'user', 'Alice', 'hello there', NOW)
    seedGuild()
    closeDb()

    const outDir = join(directory, 'out')
    const summary = await runSample({ dbPath, outDir, turns: 5, seed: 1 }, embed)
    const pairs = parsePairs(readFileSync(join(outDir, 'pairs.jsonl'), 'utf8'))

    expect(pairs).toHaveLength(1)
    expect(pairs[0].kind).toBe('fact')
    // mix(1, 5, 0.9) puts weight 0.9 on axis 5 and sqrt(0.19) on axis 1, so the similarity is ~0.436, below the
    // 0.65 fact floor: exactly the discarded-memory pair the test is named for.
    expect(pairs[0].similarity).toBeCloseTo(0.4359, 4)
    expect(pairs[0].keptByCurrentFloor).toBe(false)
    // The JSONL line itself carries the turn's text beside the numbers, so a pair reads on its own.
    const written = JSON.parse(readFileSync(join(outDir, 'pairs.jsonl'), 'utf8')) as Record<string, unknown>
    expect(written.memoryText).toBe('restoring old clocks')
    expect(written.message).toBe('hello there')
    expect(String(written.pairId)).toContain(turnRef(CHANNEL, NOW + 1000))
    expect(summary).toMatchObject({
      sampledTurns: 1,
      totalPairs: 1,
      memoriesPerTurnMedian: 1,
      memoriesPerTurnMax: 1,
      avgTokensEst: 40,
      avgDurationMs: 9,
      fallbackTurns: 0,
      selectedByKind: { fact: 1 }
    })
  })
})

describe('recallCandidates', () => {
  function fact(id: number, predicate: string, value: string, embedding: readonly number[]): void {
    const claim = assertClaim({
      guildId: GUILD,
      subjectUserId: 'alice',
      predicate,
      value,
      sourceKind: 'passive',
      channelId: CHANNEL,
      observedAt: NOW
    })
    setClaimEmbedding({
      id: claim.id,
      embeddingText: `${predicate}: ${value}`,
      embedding: {
        values: embedding,
        modelId: config.embeddings.model,
        dim: config.embeddings.dim,
        fingerprint: config.embeddings.fingerprint
      }
    })
    expect(claim.id).toBe(id)
  }

  const input = (queryEmbedding: readonly number[] | null) => ({
    scope: { guildId: GUILD, channelId: CHANNEL },
    speakerId: 'alice',
    participantIds: [],
    namedIds: [],
    message: 'hello there',
    queryEmbedding,
    now: NOW
  })

  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
  })

  it('lists every ranked candidate with its raw similarity, including one today’s floor drops', () => {
    fact(1, 'hobby', 'above the floor', axis(1))
    // mix(1, 5, 0.9) puts weight 0.9 on axis 5 and sqrt(0.19) on axis 1: similarity ~0.436, under the floor.
    fact(2, 'pet', 'below the floor', mix(1, 5, 0.9))

    const candidates = recallCandidates(input(axis(1)))
    const kept = recallForTurn(input(axis(1))).items

    expect(candidates.map(({ text }) => text)).toEqual(['above the floor', 'below the floor'])
    expect(candidates.map(({ similarity }) => similarity)[1]).toBeCloseTo(0.436, 3)
    expect(candidates.map(({ keptByCurrentFloor }) => keptByCurrentFloor)).toEqual([true, false])
    // The score carries the speaker and recency boosts on top of the similarity, as the block's ordering does.
    expect(candidates[1].score).toBeGreaterThan(candidates[1].similarity)
    expect(kept.map(({ id }) => id)).toEqual([1])
  })

  it('leaves core facts out, since no floor judges them', () => {
    fact(1, 'nickname', 'Ali', axis(1))
    fact(2, 'hobby', 'chess', axis(2))

    expect(recallCandidates(input(axis(2))).map(({ id }) => id)).toEqual([2])
  })

  it('surfaces candidates the token budget and the per-kind caps would have dropped', () => {
    for (let index = 1; index <= 10; index++) fact(index, 'hobby', `collecting clocks from era ${index}`, axis(1))
    for (let index = 1; index <= 5; index++) {
      saveMemoryEpisode({
        id: index,
        guildId: GUILD,
        channelId: CHANNEL,
        startedAt: NOW - 60_000,
        endedAt: NOW,
        summary: `a conversation about clocks ${index}`,
        embedding: {
          values: axis(1),
          modelId: config.embeddings.model,
          dim: config.embeddings.dim,
          fingerprint: config.embeddings.fingerprint
        }
      })
    }

    const candidates = recallCandidates(input(axis(1)))
    const selected = recallForTurn(input(axis(1))).items

    expect(candidates).toHaveLength(15)
    expect(candidates.filter(({ kind }) => kind === 'conversation')).toHaveLength(5)
    expect(candidates.every(({ keptByCurrentFloor }) => keptByCurrentFloor)).toBe(true)
    expect(selected.filter(({ kind }) => kind === 'conversation').length).toBeLessThanOrEqual(
      config.memory.episodeRecallK
    )
    expect(selected.length).toBeLessThan(candidates.length)
  })

  it('carries the turn text, and returns nothing without a usable query', () => {
    fact(1, 'hobby', 'chess', axis(1))

    expect(recallCandidates(input(axis(1))).map(({ message }) => message)).toEqual(['hello there'])
    expect(recallCandidates(input([1, 2, 3]))).toEqual([])
  })
})

describe('threshold maths', () => {
  it('agrees with a hand-computed kappa, and reports none when the judges cannot disagree', () => {
    const a = [true, true, true, true, false, false, false, false]
    const b = [true, true, false, false, true, true, false, false]

    expect(cohensKappa(a, b)).toBeCloseTo(0, 10)
    expect(cohensKappa(a, a)).toBe(1)
    expect(cohensKappa([true], [true])).toBeNull()
    expect(cohensKappa([], [])).toBeNull()
  })

  it('takes the lowest similarity that holds precision at 80%', () => {
    const pairs = parsePairs(
      [
        { pairId: 'a', kind: 'fact', similarity: 0.9 },
        { pairId: 'b', kind: 'fact', similarity: 0.8 },
        { pairId: 'c', kind: 'fact', similarity: 0.7 },
        { pairId: 'd', kind: 'fact', similarity: 0.6 }
      ]
        .map((row) => JSON.stringify({ ...row, keptByCurrentFloor: true }))
        .join('\n')
    )
    // 0.7 and 0.6 are relevant, 0.8 is not: only a floor above 0.8 keeps precision at 80%.
    const relevant = new Set(['a', 'd'])

    const chosen = chooseFloor(pairs, relevant)

    expect(chosen).toMatchObject({ floor: 0.8, precision: 1, recall: 0.5 })
    expect(chooseFloor(pairs, new Set(['c']))).toBeNull()
  })

  it('scores only the pairs both judges agree on, and calls a thin kind insufficient', () => {
    const rows = [
      { kind: 'fact', similarities: [0.9, 0.8, 0.7, 0.6] },
      { kind: 'media', similarities: [0.9, 0.8, 0.7] }
    ]
    const pairs = parsePairs(
      rows
        .flatMap(({ kind, similarities }) =>
          similarities.map((similarity, index) => ({ pairId: `${kind}-${index}`, kind, similarity }))
        )
        .map((row) => JSON.stringify({ ...row, keptByCurrentFloor: true }))
        .join('\n')
    )
    const factLabels = ['fact-0', 'fact-2'].map((pairId) => ({ pairId, relevant: true, reason: 'r' }))
    const extraFactLabels = [{ pairId: 'fact-1', relevant: false, reason: 'r' }]
    const mediaLabels = ['media-0', 'media-1'].map((pairId) => ({
      pairId,
      relevant: pairId === 'media-0',
      reason: 'r'
    }))
    const labels = (
      rows: Array<{ pairId: string; relevant: boolean; reason: string }>
    ): Map<string, { pairId: string; relevant: boolean; reason: string }> =>
      new Map(rows.map((row) => [row.pairId, row]))
    // Judge A misses one fact pair, judge B misses another, so only the shared labels score.
    const labelsA = labels([...factLabels, ...extraFactLabels, ...mediaLabels])
    const labelsB = labels([...factLabels, ...mediaLabels])

    const reports = reportKinds(pairs, labelsA, labelsB)
    const fact = reports.find(({ kind }) => kind === 'fact')
    const media = reports.find(({ kind }) => kind === 'media')

    // Agreed fact pairs are 0.9 and 0.7 (judge A never labelled 0.8, judge B never labelled 0.6); 0.7 is the
    // lone relevant one. A floor keeps it only below 0.7, and there precision is 0, so no candidate floor
    // reaches the target: the kind reports none, exactly as an all-irrelevant top pair would.
    expect(fact).toMatchObject({ agreed: [pairs[0], pairs[2]], currentFloor: config.memory.factMinSimilarity })
    expect(fact?.recommended).toBeNull()
    expect(media).toMatchObject({ currentFloor: config.memory.mediaMinSimilarity, recommended: null })
    expect(media?.agreed).toHaveLength(2)
  })

  it('prints coverage, kappa and a per-kind floor', () => {
    const pairs = Array.from({ length: 16 }, (_, index) => ({
      pairId: `fact-${index}`,
      kind: 'fact',
      similarity: 0.9 - index * 0.01,
      keptByCurrentFloor: index === 0
    }))
    const labels = Array.from({ length: 16 }, (_, index) => ({
      pairId: `fact-${index}`,
      relevant: index < 8,
      reason: 'r'
    }))
    const labelLines = (rows: readonly (typeof labels)[number][]): string =>
      rows.map((row) => JSON.stringify(row)).join('\n')
    const printed: string[] = []

    const reports = thresholdsMain(
      pairs.map((row) => JSON.stringify(row)).join('\n'),
      labelLines(labels),
      labelLines(labels.slice(0, 15)),
      (line) => printed.push(line)
    )

    expect(printed[0]).toBe('pairs: 16')
    expect(printed[1]).toBe('judge A coverage: 16/16 (100.0%)')
    expect(printed[2]).toBe('judge B coverage: 15/16 (93.8%)')
    expect(printed[3]).toBe("judges both labelled: 15; Cohen's kappa: 1.000")
    // Pairs are 0.90 down to 0.75 (judge B never labelled the 0.75 one), the first 8 relevant. Every floor
    // through 0.80 yields exactly 8 selected and 8 relevant: 80% precision, 100% recall — and 0.80 is the
    // lowest such similarity, so the recommended floor is 0.800.
    expect(printed.join('\n')).toContain('minimum floor for precision >= 0.8: 0.800 (precision 80.0%, recall 100.0%)')
    // At 0.650: above it sit the eight 0.75–0.90 pairs and the seven 0.66–0.74 ones; 8 of 15 are relevant.
    expect(printed.join('\n')).toContain("today's floor 0.650: precision 53.3%, recall 100.0%")
    expect(reports[0].recommended).toMatchObject({ floor: 0.8, precision: 0.8, recall: 1 })
  })

  it('rejects a pair file with no similarity before it reports anything', () => {
    expect(() => parsePairs('{"pairId":"a","kind":"fact"}')).toThrow(/numeric similarity/)
    expect(() => parseLabels('not json', 'labels-a')).toThrow(/Invalid JSON in labels-a line 1/)
  })
})
