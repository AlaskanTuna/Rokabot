import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isKnownPredicate } from '../../../src/agent/memory/predicates.js'
import {
  type CaseObservations,
  MIN_ACCURACY,
  type ToolTriggerCase,
  type ToolTriggerReport,
  loadCaseSet,
  meetsLiveVerdict,
  scoreCaseSet
} from '../toolTriggerScoring.js'

const fixturePath = resolve('tests/harness/tool-trigger/recall-user.jsonl')
const trials = 3
const temporaryDirectories: string[] = []

const header = {
  type: 'header',
  tool: 'recall_user',
  guildId: 'eval-guild',
  members: [{ id: 'sora', username: 'sora', displayName: 'Sora' }],
  claims: [],
  history: []
}

const testCase = {
  type: 'case',
  id: 'F1',
  tool: 'recall_user',
  shouldFire: true,
  speakerId: 'sora',
  message: 'what do you know about Sora?'
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function writeFixture(lines: unknown[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'rokabot-tool-trigger-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'fixture.jsonl')
  await writeFile(path, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`)
  return path
}

function observationsFor(
  cases: ToolTriggerCase[],
  resultsForCase: (testCase: ToolTriggerCase) => boolean[]
): CaseObservations {
  return new Map(cases.map((testCase) => [testCase.id, resultsForCase(testCase)]))
}

describe('tool-trigger fixture integrity', () => {
  it('loads the shipped recall_user set with its documented world state', async () => {
    const { header, cases } = await loadCaseSet(fixturePath)

    expect(cases).toHaveLength(12)
    expect(cases.filter((testCase) => testCase.shouldFire)).toHaveLength(6)
    expect(cases.filter((testCase) => !testCase.shouldFire)).toHaveLength(6)

    const memberIds = new Set(header.members.map((member) => member.id))
    expect(cases.every((testCase) => memberIds.has(testCase.speakerId))).toBe(true)
    expect(header.claims.every((claim) => isKnownPredicate(claim.predicate))).toBe(true)
    expect(header.claims.filter((claim) => claim.subjectId === 'ren')).toEqual([])
  })

  it.each([
    ['a missing header', [testCase], /line 1 must begin with a header/],
    ['an unknown type', [header, { type: 'unexpected' }], /line 2 must be a case/],
    ['a non-boolean shouldFire', [header, { ...testCase, shouldFire: 'yes' }], /line 2 requires a boolean shouldFire/],
    [
      'a speakerId outside members',
      [header, { ...testCase, speakerId: 'mio' }],
      /line 2 case speakerId "mio" is not a declared member/
    ],
    [
      'an unknown predicate',
      [{ ...header, claims: [{ subjectId: 'sora', predicate: 'unknown', value: 'x' }] }],
      /line 1 has an unknown predicate "unknown"/
    ],
    [
      'a case tool that does not match the header tool',
      [header, { ...testCase, tool: 'search_web' }],
      /line 2 case tool "search_web" does not match header tool "recall_user"/
    ]
  ])('rejects %s with its real error message', async (_description, lines, messagePattern) => {
    await expect(loadCaseSet(await writeFixture(lines))).rejects.toThrow(messagePattern)
  })
})

describe('tool-trigger scoring verdict', () => {
  it('passes perfect observations with exact trial counts', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => Array(trials).fill(testCase.shouldFire))
    )

    expect(report.accuracy).toBe(1)
    expect(report.precision).toBe(1)
    expect(report.recall).toBe(1)
    expect(report.caseCount).toBe(12)
    expect(report.trials).toBe(3)
    expect(report.systematicFailures).toEqual([])
    expect(report.perCase).toEqual(
      cases.map((testCase) => ({
        id: testCase.id,
        shouldFire: testCase.shouldFire,
        fired: testCase.shouldFire ? 3 : 0,
        correct: 3
      }))
    )
    expect(meetsLiveVerdict(report)).toBe(true)
  })

  it('fails the verdict when the tool never fires', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, () => Array(trials).fill(false))
    )

    expect(report.accuracy).toBe(0.5)
    expect(report.recall).toBe(0)
    expect(report.systematicFailures).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6'])
    expect(meetsLiveVerdict(report)).toBe(false)
  })

  it('fails the verdict when the tool always fires', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, () => Array(trials).fill(true))
    )

    expect(report.accuracy).toBe(0.5)
    expect(report.precision).toBe(0.5)
    expect(report.systematicFailures).toEqual(['N1', 'N2', 'N3', 'N4', 'N5', 'N6'])
    expect(meetsLiveVerdict(report)).toBe(false)
  })

  it('fails the accuracy floor when every case is correct on two of three trials', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => [testCase.shouldFire, testCase.shouldFire, !testCase.shouldFire])
    )

    expect(report.perCase.every((entry) => entry.correct === 2)).toBe(true)
    expect(report.systematicFailures).toEqual([])
    expect(report.accuracy).toBeCloseTo(0.667, 3)
    expect(report.accuracy).toBeLessThan(MIN_ACCURACY)
    expect(meetsLiveVerdict(report)).toBe(false)
  })

  it('pins report.trials to the observed trial count, not a hardcoded default', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const fiveTrials = 5
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => Array(fiveTrials).fill(testCase.shouldFire))
    )

    expect(report.trials).toBe(fiveTrials)
  })

  it('fails on one systematically bad case despite eleven perfect cases', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => Array(trials).fill(testCase.id === 'F1' ? false : testCase.shouldFire))
    )

    expect(report.accuracy).toBeCloseTo(0.917, 3)
    expect(report.accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY)
    expect(report.systematicFailures).toEqual(['F1'])
    expect(meetsLiveVerdict(report)).toBe(false)
  })

  it('keeps the same arithmetic for a different tool', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const searchWebCases = cases.map((testCase) => ({ ...testCase, tool: 'search_web' }))
    const observations = observationsFor(searchWebCases, (testCase) => Array(trials).fill(testCase.shouldFire))
    const report = scoreCaseSet(searchWebCases, observations)

    expect(report).toMatchObject({
      tool: 'search_web',
      caseCount: 12,
      trials: 3,
      truePositives: 18,
      falsePositives: 0,
      trueNegatives: 18,
      falseNegatives: 0,
      accuracy: 1,
      precision: 1,
      recall: 1
    })
    expect(report.systematicFailures).toEqual([])
    expect(meetsLiveVerdict(report)).toBe(true)
  })

  it('applies the exported MIN_ACCURACY as the verdict floor, not a redefinition of it', () => {
    const reportAt: ToolTriggerReport = {
      tool: 'recall_user',
      caseCount: 12,
      trials: 3,
      perCase: [],
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      accuracy: MIN_ACCURACY,
      precision: 0,
      recall: 0,
      systematicFailures: [],
      hour: 0
    }
    const reportBelow: ToolTriggerReport = { ...reportAt, accuracy: MIN_ACCURACY - 0.0001 }

    expect(meetsLiveVerdict(reportAt)).toBe(true)
    expect(meetsLiveVerdict(reportBelow)).toBe(false)
  })
})
