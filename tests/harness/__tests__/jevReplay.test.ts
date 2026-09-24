import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseReplayArgs, runReplayCli } from '../../../scripts/replay-jev.js'
import type { TurnJudgment } from '../../../src/agent/jev/judgments.js'
import {
  type JevReplayTurn,
  loadDatabaseReplayTurns,
  loadJevReplayTurns,
  renderJevReplayReport,
  runJevReplay
} from '../jevReplay.js'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function createSnapshot(): string {
  const directory = mkdtempSync(join(process.cwd(), '.jev-replay-test-'))
  temporaryDirectories.push(directory)
  const databasePath = join(directory, 'snapshot.db')
  const database = new Database(databasePath)
  database.exec(
    'CREATE TABLE session_history (channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL, timestamp INTEGER NOT NULL)'
  )
  database.close()
  return databasePath
}

function replayTurn(overrides: Partial<JevReplayTurn> = {}): JevReplayTurn {
  return {
    source: 'transcript',
    channelId: 'hidden-channel-id',
    speakerName: 'Hidden Speaker',
    message: 'synthetic hidden message',
    recentLines: [],
    ruleTone: 'playful',
    ruleFired: true,
    containsCjk: false,
    ...overrides
  }
}

function judgment(tone: NonNullable<TurnJudgment['tone']>): TurnJudgment {
  return { tone, referents: [], needsLookup: null, latencyMs: 18, inputTokens: 12 }
}

describe('Jev replay loader', () => {
  it('maps database history into bounded turns with prior lines and a rule-fired marker', () => {
    const database = new Database(':memory:')
    database.exec(
      'CREATE TABLE session_history (channel_id TEXT NOT NULL, role TEXT NOT NULL, display_name TEXT NOT NULL, content TEXT NOT NULL, timestamp INTEGER NOT NULL)'
    )
    database
      .prepare('INSERT INTO session_history VALUES (?, ?, ?, ?, ?)')
      .run('private-channel', 'assistant', 'ignored-name', '先にお茶の話をしました', 1)
    database
      .prepare('INSERT INTO session_history VALUES (?, ?, ?, ?, ?)')
      .run('private-channel', 'user', 'Mio', '今日は花がきれいです', 2)
    database
      .prepare('INSERT INTO session_history VALUES (?, ?, ?, ?, ?)')
      .run('private-channel', 'user', 'Mio', '明日も晴れるといいな', 3)

    const turns = loadDatabaseReplayTurns(database, 1)
    database.close()

    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({
      source: 'database',
      channelId: 'private-channel',
      speakerName: 'Mio',
      recentLines: ['[Roka]: 先にお茶の話をしました'],
      ruleTone: 'playful',
      ruleFired: false,
      containsCjk: true
    })
  })

  it('includes mixed Japanese and English transcript turns', async () => {
    const databasePath = createSnapshot()
    const turns = await loadJevReplayTurns(databasePath, resolve('tests/harness/transcripts'), 100)
    const cjkTurns = turns.filter((turn) => turn.source === 'transcript' && turn.containsCjk)

    expect(cjkTurns.length).toBeGreaterThan(0)
    expect(cjkTurns.some(({ message }) => /[A-Za-z]/u.test(message))).toBe(true)
  })

  it('round-robins database and transcript turns before applying the cap', async () => {
    const databasePath = createSnapshot()
    const database = new Database(databasePath)
    database
      .prepare('INSERT INTO session_history VALUES (?, ?, ?, ?, ?)')
      .run('private-channel', 'user', 'Mio', 'synthetic database turn', 1)
    database.close()

    const turns = await loadJevReplayTurns(databasePath, resolve('tests/harness/transcripts'), 2)

    expect(turns.map(({ source }) => source)).toEqual(['database', 'transcript'])
  })
})

describe('Jev replay report', () => {
  it('runs sequentially and reports overall, rule-fired, CJK, probability, and confusion counts', async () => {
    const turns = [
      replayTurn({ ruleTone: 'playful', ruleFired: true, containsCjk: false, message: 'message-one' }),
      replayTurn({ ruleTone: 'sincere', ruleFired: false, containsCjk: true, message: 'message-two' }),
      replayTurn({ ruleTone: 'sincere', ruleFired: true, containsCjk: true, message: 'message-three' }),
      replayTurn({ ruleTone: 'playful', ruleFired: false, containsCjk: false, message: 'message-four' })
    ]
    const answers = [
      judgment({ tone: 'playful', confidence: 0.9, probability: 0.91 }),
      judgment({ tone: 'playful', confidence: 0.8, probability: 0.8 }),
      judgment({ tone: 'sincere', confidence: 0.7, probability: 0.75 }),
      null
    ]
    let activeJudges = 0
    let maximumActiveJudges = 0
    let answerIndex = 0
    const judge = vi.fn(async () => {
      activeJudges += 1
      maximumActiveJudges = Math.max(maximumActiveJudges, activeJudges)
      await Promise.resolve()
      activeJudges -= 1
      return answers[answerIndex++]
    })
    const wait = vi.fn(async () => undefined)

    const report = await runJevReplay(turns, judge, wait)
    const cutoff = report.cutoffRows.find(({ minimumProbability }) => minimumProbability === 0.75)
    const rendered = renderJevReplayReport(report)

    expect(judge).toHaveBeenCalledTimes(4)
    expect(maximumActiveJudges).toBe(1)
    expect(wait).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledWith(1_000)
    expect(report.totalTurns).toBe(4)
    expect(report.missingJudgments).toBe(1)
    expect(report.overallAgreement).toBeCloseTo(2 / 3)
    expect(report.probabilityBins.missing).toBe(1)
    expect(report.probabilityBins.bins.find(({ min }) => min === 0.9)?.count).toBe(1)
    expect(report.confusionMatrix.find(({ ruleTone }) => ruleTone === 'playful')?.counts.playful).toBe(1)
    expect(report.confusionMatrix.find(({ ruleTone }) => ruleTone === 'sincere')?.counts.playful).toBe(1)
    expect(report.confusionMatrix.find(({ ruleTone }) => ruleTone === 'sincere')?.counts.sincere).toBe(1)
    expect(cutoff).toEqual({
      minimumProbability: 0.75,
      n: 3,
      coverage: 0.75,
      agreement: 2 / 3,
      firedN: 2,
      firedAgreement: 1,
      cjkN: 2,
      cjkAgreement: 0.5
    })
    expect(rendered).toContain('firedN')
    expect(rendered).toContain('firedAgreement')
    expect(rendered).toContain('cjkAgreement')
    expect(rendered).not.toContain('synthetic hidden message')
    expect(rendered).not.toContain('hidden-channel-id')
    expect(rendered).not.toContain('Hidden Speaker')
    for (const message of ['message-one', 'message-two', 'message-three', 'message-four']) {
      expect(rendered).not.toContain(message)
    }
  })

  it('parses a default cap and rejects missing paths or caps outside one through one hundred', () => {
    expect(parseReplayArgs(['snapshot.db'])).toEqual({ databasePath: 'snapshot.db', maxTurns: 100 })
    expect(() => parseReplayArgs([])).toThrow('Usage: npm run replay:jev -- data/rokabot.db --max-turns 100')
    expect(() => parseReplayArgs(['snapshot.db', '--max-turns', '0'])).toThrow('integer from 1 through 100')
    expect(() => parseReplayArgs(['snapshot.db', '--max-turns', '101'])).toThrow('integer from 1 through 100')
  })

  it('does not load the live judge without a TypeSafe API key', async () => {
    const loadJudge = vi.fn()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await expect(runReplayCli(['snapshot.db'], undefined, loadJudge)).resolves.toBe(1)

    expect(loadJudge).not.toHaveBeenCalled()
  })

  it('runs the CLI through an injected judge and renders no turn content', async () => {
    const databasePath = createSnapshot()
    const database = new Database(databasePath)
    database
      .prepare('INSERT INTO session_history VALUES (?, ?, ?, ?, ?)')
      .run('secret-channel', 'user', 'Secret Name', 'synthetic private text', 1)
    database.close()
    const judge = vi.fn(async () => judgment({ tone: 'playful', confidence: 0.9, probability: 0.91 }))
    const loadJudge = vi.fn(async () => judge)
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await expect(runReplayCli([databasePath, '--max-turns', '1'], 'test-key', loadJudge)).resolves.toBe(0)

    const output = stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
    expect(loadJudge).toHaveBeenCalledOnce()
    expect(judge).toHaveBeenCalledOnce()
    expect(output).toContain('totalTurns: 1')
    expect(output).not.toContain('synthetic private text')
    expect(output).not.toContain('secret-channel')
    expect(output).not.toContain('Secret Name')
  })
})
