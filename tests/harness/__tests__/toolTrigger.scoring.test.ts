import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isKnownPredicate } from '../../../src/agent/memory/predicates.js'
import {
  type CaseObservations,
  MIN_PRECISION,
  MIN_RECALL,
  type ToolTriggerCase,
  type ToolTriggerReport,
  loadCaseSet,
  meetsLiveVerdict,
  recallFloorFor,
  scoreCaseSet
} from '../toolTriggerScoring.js'

const fixturePath = resolve('tests/harness/tool-trigger/recall-user.jsonl')
const rememberFixturePath = resolve('tests/harness/tool-trigger/remember-user.jsonl')
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
  // The remember_user set had no offline assertion of any kind until #182, which is how a question about
  // two of its cases had to be answered by re-reading run logs. These cost nothing and run on every
  // `npm test`.
  it('loads the shipped remember_user set with its documented world state', async () => {
    const { header, cases } = await loadCaseSet(rememberFixturePath)

    expect(cases).toHaveLength(12)
    expect(cases.filter((testCase) => testCase.shouldFire)).toHaveLength(6)
    expect(cases.filter((testCase) => !testCase.shouldFire)).toHaveLength(6)

    const memberIds = new Set(header.members.map((member) => member.id))
    expect(cases.every((testCase) => memberIds.has(testCase.speakerId))).toBe(true)
    expect(header.claims.every((claim) => isKnownPredicate(claim.predicate))).toBe(true)
  })

  // R6 collides with its own seeded world on purpose. That is normally a fixture defect — the 2026-07-29
  // rule in docs/decisions.md says a live-eval case must not restate what the world already holds — and it
  // is the stated exception, because #118's carve-out ("call it even if you already know the fact") cannot
  // be exercised by a case whose fact is new. Asserting the collision keeps a future tidy-up from removing
  // the only thing testing that clause.
  it('keeps R6 asking her to remember a fact already seeded for its own speaker (issue #118)', async () => {
    const { header, cases } = await loadCaseSet(rememberFixturePath)
    const r6 = cases.find((testCase) => testCase.id === 'R6')

    const seededForSpeaker = header.claims.filter((claim) => claim.subjectId === r6?.speakerId)
    expect(seededForSpeaker.some((claim) => r6?.message.includes(claim.value))).toBe(true)
  })

  it('keeps R6 the only should-fire case that restates a seeded claim, so the carve-out has one clean test', async () => {
    const { header, cases } = await loadCaseSet(rememberFixturePath)

    const restatingSeeded = cases
      .filter((testCase) => testCase.shouldFire)
      .filter((testCase) =>
        header.claims.some((claim) => claim.subjectId === testCase.speakerId && testCase.message.includes(claim.value))
      )
    expect(restatingSeeded.map((testCase) => testCase.id)).toEqual(['R6'])
  })

  // R2 is the set's weakest case at 5/9 pooled and was reported as a possible mislabel. It is not: its
  // phrasing is one the tool description enumerates by name, and `nickname` is one of the description's own
  // fact_key examples, so relabelling it would delete coverage of a phrasing #118 was written to catch
  // (#182).
  it('keeps R2 phrased as the request form the tool description enumerates (issue #118)', async () => {
    const { cases } = await loadCaseSet(rememberFixturePath)
    const r2 = cases.find((testCase) => testCase.id === 'R2')

    expect(r2?.message).toContain('I want you to remember')
    expect(r2?.shouldFire).toBe(true)
  })

  it('keeps R3 phrased as the trailing do-not-forget form, the other phrasing #118 added', async () => {
    const { cases } = await loadCaseSet(rememberFixturePath)
    const r3 = cases.find((testCase) => testCase.id === 'R3')

    expect(r3?.message).toContain("don't forget")
    expect(r3?.shouldFire).toBe(true)
  })

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
      'a claim subjectId outside members',
      [{ ...header, claims: [{ subjectId: 'mio', predicate: 'likes', value: 'popcorn' }] }],
      /line 1 claim subjectId "mio" is not a declared member/
    ],
    [
      'a case tool that does not match the header tool',
      [header, { ...testCase, tool: 'search_web' }],
      /line 2 case tool "search_web" does not match header tool "recall_user"/
    ]
  ])('rejects %s with its real error message', async (_description, lines, messagePattern) => {
    await expect(loadCaseSet(await writeFixture(lines))).rejects.toThrow(messagePattern)
  })

  it('reports the true file line number across a blank separator line', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rokabot-tool-trigger-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'fixture.jsonl')
    const content = [JSON.stringify(header), '', JSON.stringify({ ...testCase, shouldFire: 'yes' })].join('\n')
    await writeFile(path, `${content}\n`)

    await expect(loadCaseSet(path)).rejects.toThrow(/line 3 requires a boolean shouldFire/)
  })
})

/** Only `tool`, `precision` and `recall` reach `meetsLiveVerdict`; the rest is shape. Built directly rather
 * than scored from a fixture, because the point is the threshold, and routing a specific recall through a
 * case set would make the number an artefact of the fixture instead of the input. */
function reportWith(tool: string, recall: number, precision = 1): ToolTriggerReport {
  return {
    tool,
    caseCount: 12,
    trials: 3,
    perCase: [],
    truePositives: 0,
    falsePositives: 0,
    trueNegatives: 0,
    falseNegatives: 0,
    accuracy: 0,
    precision,
    recall,
    systematicFailures: [],
    hour: 14
  }
}

describe('per-tool recall floors', () => {
  // Gate H, 2026-08-21: 13 of 18 should-fire trials. Under the shared 0.80 floor this failed, on a tool
  // whose pooled rate over three pinned runs is 0.796 — a floor inside its own confidence interval (#141).
  it('passes remember_user at the rate three pinned runs actually measured', () => {
    expect(meetsLiveVerdict(reportWith('remember_user', 13 / 18))).toBe(true)
  })

  // The floor still bites. 11 of 18 is below 0.65 and fails, so this is a recalibration rather than a
  // removal.
  it('still fails remember_user below its own floor', () => {
    expect(meetsLiveVerdict(reportWith('remember_user', 11 / 18))).toBe(false)
  })

  // What 0.65 is actually for. It is a COLLAPSE detector: 12 of 18 passes, and the comment on
  // RECALL_FLOOR_BY_TOOL says plainly that a genuine degradation is caught 12-45% of the time. Pinned so
  // that a future reader who expects this gate to catch a regression meets the limit here rather than in
  // production.
  it('admits a degraded remember_user, which is the limit this floor is documented to have', () => {
    expect(meetsLiveVerdict(reportWith('remember_user', 12 / 18))).toBe(true)
  })

  // The argument for lowering it, made checkable: the mutation-probe collapse to recall 0.111 is the
  // regression this floor was validated against, and 0.70 catches it exactly as 0.80 did. If lowering the
  // floor had cost the gate its purpose, this is where that would show.
  it('still catches the collapse the floor was validated against', () => {
    expect(meetsLiveVerdict(reportWith('remember_user', 0.111))).toBe(false)
  })

  // Scoped to one tool. recall_user and search_web measure 0.944 to 1.000, where 0.80 is correctly
  // calibrated, so the same recall that now passes remember_user must still fail them.
  it.each(['recall_user', 'search_web'])('leaves %s judged against the shared floor', (tool) => {
    expect(meetsLiveVerdict(reportWith(tool, 13 / 18))).toBe(false)
  })

  // The floor is written out, not derived, so a change to it has to be made deliberately here too (#160).
  it('pins remember_user to the floor its measured rate supports', () => {
    expect(recallFloorFor('remember_user')).toBe(0.65)
  })

  // A tool nobody has calibrated gets the strict floor, not the lenient one.
  it('defaults an unlisted tool to the shared floor', () => {
    expect(recallFloorFor('some_future_tool')).toBe(MIN_RECALL)
  })

  // Precision is untouched by any of this; a tool over-firing fails on precision whatever its recall floor.
  it('does not let a per-tool recall floor rescue bad precision', () => {
    expect(meetsLiveVerdict(reportWith('remember_user', 1, 0.5))).toBe(false)
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

  it('fails the verdict when every case is correct on two of three trials', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => [testCase.shouldFire, testCase.shouldFire, !testCase.shouldFire])
    )

    expect(report.perCase.every((entry) => entry.correct === 2)).toBe(true)
    expect(report.accuracy).toBeCloseTo(0.667, 3)
    expect(report.precision).toBeLessThan(MIN_PRECISION)
    expect(report.recall).toBeLessThan(MIN_RECALL)
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

  it('passes despite one systematically bad case, an accepted tradeoff, while still reporting it', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => Array(trials).fill(testCase.id === 'F1' ? false : testCase.shouldFire))
    )

    expect(report.accuracy).toBeCloseTo(0.917, 3)
    expect(report.recall).toBeCloseTo(0.833, 3)
    expect(report.systematicFailures).toEqual(['F1'])
    expect(meetsLiveVerdict(report)).toBe(true)
  })

  it('fails when two dead should-fire cases drag recall below the floor', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const deadCases = new Set(['F1', 'F2'])
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => Array(trials).fill(deadCases.has(testCase.id) ? false : testCase.shouldFire))
    )

    expect(report.recall).toBeCloseTo(0.667, 3)
    expect(report.recall).toBeLessThan(MIN_RECALL)
    expect(report.systematicFailures).toEqual(['F1', 'F2'])
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

  it('applies the exported MIN_PRECISION and MIN_RECALL as the verdict floors, not a redefinition of them', () => {
    const base: ToolTriggerReport = {
      tool: 'recall_user',
      caseCount: 12,
      trials: 3,
      perCase: [],
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      accuracy: 1,
      precision: 1,
      recall: 1,
      systematicFailures: [],
      hour: 0
    }

    expect(meetsLiveVerdict({ ...base, precision: MIN_PRECISION })).toBe(true)
    expect(meetsLiveVerdict({ ...base, precision: MIN_PRECISION - 0.0001 })).toBe(false)
    expect(meetsLiveVerdict({ ...base, recall: MIN_RECALL })).toBe(true)
    expect(meetsLiveVerdict({ ...base, recall: MIN_RECALL - 0.0001 })).toBe(false)
  })

  it('pins the precision floor at observation granularity, holding recall at 1.000: 4 false positives of 18 true positives passes, 5 fails', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const fpFourObservations = observationsFor(cases, (testCase) => {
      if (testCase.id === 'N1') return [true, true, true]
      if (testCase.id === 'N2') return [true, false, false]
      return Array(trials).fill(testCase.shouldFire)
    })
    const reportAtFourFp = scoreCaseSet(cases, fpFourObservations)

    expect(reportAtFourFp.falsePositives).toBe(4)
    expect(reportAtFourFp.recall).toBe(1)
    expect(reportAtFourFp.precision).toBeCloseTo(18 / 22, 6)
    expect(meetsLiveVerdict(reportAtFourFp)).toBe(true)

    const fpFiveObservations = observationsFor(cases, (testCase) => {
      if (testCase.id === 'N1') return [true, true, true]
      if (testCase.id === 'N2') return [true, true, false]
      return Array(trials).fill(testCase.shouldFire)
    })
    const reportAtFiveFp = scoreCaseSet(cases, fpFiveObservations)

    expect(reportAtFiveFp.falsePositives).toBe(5)
    expect(reportAtFiveFp.recall).toBe(1)
    expect(reportAtFiveFp.precision).toBeCloseTo(18 / 23, 6)
    expect(meetsLiveVerdict(reportAtFiveFp)).toBe(false)
  })

  it('pins the recall floor at observation granularity: 15 true positives of 18 passes, 14 fails', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const tpFifteenObservations = observationsFor(cases, (testCase) => {
      if (testCase.id === 'F1') return [false, false, false]
      return Array(trials).fill(testCase.shouldFire)
    })
    const reportAtFifteenTp = scoreCaseSet(cases, tpFifteenObservations)

    expect(reportAtFifteenTp.truePositives).toBe(15)
    expect(reportAtFifteenTp.recall).toBeCloseTo(15 / 18, 6)
    expect(meetsLiveVerdict(reportAtFifteenTp)).toBe(true)

    const tpFourteenObservations = observationsFor(cases, (testCase) => {
      if (testCase.id === 'F1') return [false, false, false]
      if (testCase.id === 'F2') return [true, true, false]
      return Array(trials).fill(testCase.shouldFire)
    })
    const reportAtFourteenTp = scoreCaseSet(cases, tpFourteenObservations)

    expect(reportAtFourteenTp.truePositives).toBe(14)
    expect(reportAtFourteenTp.recall).toBeCloseTo(14 / 18, 6)
    expect(meetsLiveVerdict(reportAtFourteenTp)).toBe(false)
  })

  it('passes when a single no-fire case fires every trial against an otherwise-clean baseline — the aggregate floor residual blindness (see toolTriggerScoring.ts), reported via systematicFailures', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) =>
        testCase.id === 'N5' ? [true, true, true] : Array(trials).fill(testCase.shouldFire)
      )
    )

    expect(report.truePositives).toBe(18)
    expect(report.falsePositives).toBe(3)
    expect(report.precision).toBeCloseTo(18 / 21, 6)
    expect(report.recall).toBe(1)
    expect(report.systematicFailures).toEqual(['N5'])
    expect(meetsLiveVerdict(report)).toBe(true)
  })

  // main's per-case fire rates (docs/progress.md:529), rounded to trial counts at 3 trials: N1
  // 7/9->2/3, N2 2/9->1/3, N3 1/9->0/3, N4 0/9->0/3, N5 9/9->3/3, N6 3/9->1/3 — FP=7, the modal
  // total, now attributed to the case (N5) that actually drives it. main is red in 98.47% of real
  // runs, not deterministically: the exact central-95% interval for FP is [5, 10] (not a normal
  // approximation), every value in that range fails, and P(FP <= 4) is the 1.53% pass rate already
  // documented in toolTriggerScoring.ts.
  it('fails on a modal-total reconstruction of mains measured rates (TP=18, FP=7) and names N5 as the culprit', async () => {
    const { cases } = await loadCaseSet(fixturePath)
    const report = scoreCaseSet(
      cases,
      observationsFor(cases, (testCase) => {
        if (testCase.id === 'N1') return [true, true, false]
        if (testCase.id === 'N2') return [true, false, false]
        if (testCase.id === 'N3') return [false, false, false]
        if (testCase.id === 'N4') return [false, false, false]
        if (testCase.id === 'N5') return [true, true, true]
        if (testCase.id === 'N6') return [true, false, false]
        return Array(trials).fill(testCase.shouldFire)
      })
    )

    expect(report.truePositives).toBe(18)
    expect(report.falsePositives).toBe(7)
    expect(report.precision).toBeCloseTo(18 / 25, 6)
    expect(report.recall).toBe(1)
    expect(report.systematicFailures).toContain('N5')
    expect(meetsLiveVerdict(report)).toBe(false)
  })
})

describe('tool-trigger live verdict determinism (issue #49)', () => {
  // Exhaustive, not sampled: N6 (a should-not-fire case) is the only case with free trials, and 3
  // free boolean trials has exactly 2^3 = 8 outcomes. Every other case is fixed at its correct
  // value — a clean idealisation, not a reproduction of the issue: both real live runs reported
  // FP=7, so cases other than N6 varied too in practice.
  const n6TrialOutcomes: boolean[][] = [
    [false, false, false],
    [false, false, true],
    [false, true, false],
    [false, true, true],
    [true, false, false],
    [true, false, true],
    [true, true, false],
    [true, true, true]
  ]

  // This isolates that the *retired* all-cases-must-pass rule was the flake source in #49's
  // evidence, not that the new precision/recall verdict is deterministic in general: it passes 8/8
  // here, but with only one FP observation of real headroom — the scenario's worst case (N6 3/3,
  // FP=3) sits at precision 18/21=0.8571, and the floor still admits FP=4 (18/22=0.8182) before
  // failing at FP=5 (18/23=0.7826, which this scenario can never realize). Raising MIN_PRECISION to
  // 0.9166 only passes 4 of these 8 outcomes. The verdict's own residual disagreement across
  // independent runs is quantified in toolTriggerScoring.ts — ~3.0% on main, ~0.3% once #39 is fixed
  // to q=0.05 — not zero.
  it('is true in 8 of 8 outcomes, where the retired all-cases rule was false in 1 of 8', async () => {
    const { cases } = await loadCaseSet(fixturePath)

    let verdictPassCount = 0
    let retiredRuleFailCount = 0
    let retiredRuleFailureReport: ToolTriggerReport | undefined

    for (const n6Trials of n6TrialOutcomes) {
      const observations = observationsFor(cases, (testCase) =>
        testCase.id === 'N6' ? n6Trials : Array(trials).fill(testCase.shouldFire)
      )
      const report = scoreCaseSet(cases, observations)

      if (meetsLiveVerdict(report)) verdictPassCount++

      // Written against systematicFailures directly, not meetsLiveVerdict: this is what documents
      // the defect, since meetsLiveVerdict no longer gates on it.
      const retiredRulePasses = report.systematicFailures.length === 0
      if (!retiredRulePasses) {
        retiredRuleFailCount++
        retiredRuleFailureReport = report
      }
    }

    expect(verdictPassCount).toBe(8)
    expect(retiredRuleFailCount).toBe(1)
    expect(retiredRuleFailureReport?.systematicFailures).toEqual(['N6'])
  })
})
