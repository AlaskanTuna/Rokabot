/** Pure, offline half of the tool-trigger rig: the fixture loader, the case/report types, the
 * scorer, and the live-gate verdict rule. No database, no socket, no `src/agent/roka.js` — kept in
 * its own module so the default `npm test` gate (via toolTrigger.scoring.test.ts) never transitively
 * constructs the ADK agent that `toolTrigger.ts`'s live runner needs. */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isKnownPredicate } from '../../src/agent/memory/predicates.js'
import { getLocalHour } from '../../src/utils/timezone.js'

const DEFAULT_CASE_SET_PATH = resolve('tests/harness/tool-trigger/recall-user.jsonl')

export type FixtureMember = Readonly<{ id: string; username: string; displayName: string }>
export type FixtureClaim = Readonly<{ subjectId: string; predicate: string; value: string }>
export type FixtureHistoryLine = Readonly<{ speakerId: string; content: string }>

export type CaseSetHeader = Readonly<{
  type: 'header'
  tool: string
  guildId: string
  members: FixtureMember[]
  claims: FixtureClaim[]
  history: FixtureHistoryLine[]
}>

export type ToolTriggerCase = Readonly<{
  type: 'case'
  id: string
  tool: string
  shouldFire: boolean
  speakerId: string
  message: string
}>

export type ToolTriggerCaseSet = Readonly<{ header: CaseSetHeader; cases: ToolTriggerCase[] }>

function nonEmptyString(value: unknown, line: number, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Tool-trigger fixture line ${line} requires a non-empty ${field}`)
  }
  return value
}

function asMember(value: unknown, line: number): FixtureMember {
  if (!value || typeof value !== 'object') throw new Error(`Tool-trigger fixture line ${line} has an invalid member`)
  const member = value as Partial<FixtureMember>
  return {
    id: nonEmptyString(member.id, line, 'member id'),
    username: nonEmptyString(member.username, line, 'member username'),
    displayName: nonEmptyString(member.displayName, line, 'member displayName')
  }
}

function asClaim(value: unknown, line: number): FixtureClaim {
  if (!value || typeof value !== 'object') throw new Error(`Tool-trigger fixture line ${line} has an invalid claim`)
  const claim = value as Partial<FixtureClaim>
  const predicate = nonEmptyString(claim.predicate, line, 'claim predicate')
  if (!isKnownPredicate(predicate)) {
    throw new Error(`Tool-trigger fixture line ${line} has an unknown predicate "${predicate}"`)
  }
  return {
    subjectId: nonEmptyString(claim.subjectId, line, 'claim subjectId'),
    predicate,
    value: nonEmptyString(claim.value, line, 'claim value')
  }
}

function asHistoryLine(value: unknown, line: number, memberIds: Set<string>): FixtureHistoryLine {
  if (!value || typeof value !== 'object') {
    throw new Error(`Tool-trigger fixture line ${line} has an invalid history line`)
  }
  const entry = value as Partial<FixtureHistoryLine>
  const speakerId = nonEmptyString(entry.speakerId, line, 'history speakerId')
  if (!memberIds.has(speakerId)) {
    throw new Error(`Tool-trigger fixture line ${line} history speakerId "${speakerId}" is not a declared member`)
  }
  return { speakerId, content: nonEmptyString(entry.content, line, 'history content') }
}

function asHeader(value: unknown, line: number): CaseSetHeader {
  if (!value || typeof value !== 'object' || (value as Partial<CaseSetHeader>).type !== 'header') {
    throw new Error(`Tool-trigger fixture line ${line} must begin with a header`)
  }
  const header = value as Partial<CaseSetHeader>
  if (!Array.isArray(header.members) || !Array.isArray(header.claims) || !Array.isArray(header.history)) {
    throw new Error(`Tool-trigger fixture line ${line} header requires members, claims, and history arrays`)
  }
  const members = header.members.map((member) => asMember(member, line))
  const memberIds = new Set(members.map((member) => member.id))
  return {
    type: 'header',
    tool: nonEmptyString(header.tool, line, 'header tool'),
    guildId: nonEmptyString(header.guildId, line, 'header guildId'),
    members,
    claims: header.claims.map((claim) => asClaim(claim, line)),
    history: header.history.map((entry) => asHistoryLine(entry, line, memberIds))
  }
}

function asCase(value: unknown, line: number, memberIds: Set<string>, headerTool: string): ToolTriggerCase {
  if (!value || typeof value !== 'object' || (value as Partial<ToolTriggerCase>).type !== 'case') {
    throw new Error(`Tool-trigger fixture line ${line} must be a case`)
  }
  const candidate = value as Partial<ToolTriggerCase>
  if (typeof candidate.shouldFire !== 'boolean') {
    throw new Error(`Tool-trigger fixture line ${line} requires a boolean shouldFire`)
  }
  const speakerId = nonEmptyString(candidate.speakerId, line, 'case speakerId')
  if (!memberIds.has(speakerId)) {
    throw new Error(`Tool-trigger fixture line ${line} case speakerId "${speakerId}" is not a declared member`)
  }
  const tool = nonEmptyString(candidate.tool, line, 'case tool')
  if (tool !== headerTool) {
    throw new Error(`Tool-trigger fixture line ${line} case tool "${tool}" does not match header tool "${headerTool}"`)
  }
  return {
    type: 'case',
    id: nonEmptyString(candidate.id, line, 'case id'),
    tool,
    shouldFire: candidate.shouldFire,
    speakerId,
    message: nonEmptyString(candidate.message, line, 'case message')
  }
}

/** Load the JSONL fixture: header first (shared world state), then labelled cases. Throws with the
 * offending line number on any malformation so a broken fixture fails offline, never mid-way through
 * a paid live run. */
export async function loadCaseSet(path: string = DEFAULT_CASE_SET_PATH): Promise<ToolTriggerCaseSet> {
  const rows = (await readFile(path, 'utf8'))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch {
        throw new Error(`Tool-trigger fixture line ${index + 1} is not valid JSON`)
      }
    })

  const [first, ...rest] = rows
  if (!first) throw new Error('Tool-trigger fixture is empty')
  const header = asHeader(first, 1)
  const memberIds = new Set(header.members.map((member) => member.id))
  const cases = rest.map((row, index) => asCase(row, index + 2, memberIds, header.tool))
  return { header, cases }
}

export type CaseObservations = Map<string, boolean[]>

export interface ToolTriggerCaseResult {
  id: string
  shouldFire: boolean
  fired: number
  correct: number
}

export interface ToolTriggerReport {
  tool: string
  caseCount: number
  trials: number
  perCase: ToolTriggerCaseResult[]
  truePositives: number
  falsePositives: number
  trueNegatives: number
  falseNegatives: number
  accuracy: number
  precision: number
  recall: number
  systematicFailures: string[]
  hour: number
}

export const MIN_ACCURACY = 0.75 // calibration runs (2026-07-29): 0.8333, 0.8056, 0.7500 — lowest in [0.75, 0.90), so kept at 0.75

/** The live gate's pass/fail rule, in one place: an accuracy floor AND zero systematic failures.
 * toolTrigger.live.test.ts and toolTrigger.scoring.test.ts both import this rather than
 * re-implementing it, so a threshold change here can never drift out of sync with what the
 * mutation pin (toolTrigger.scoring.test.ts) validates. */
export function meetsLiveVerdict(report: ToolTriggerReport): boolean {
  return report.accuracy >= MIN_ACCURACY && report.systematicFailures.length === 0
}

/** Pure scorer over recorded fire/no-fire booleans — no database, no socket, no injected clock — so
 * task 129 can pin the verdict by feeding it synthetic observations offline and free, on every
 * `npm test`, forever. `fired` and `correct` on each perCase row are trial counts, not booleans, so a
 * report can show "fired 2 of 3" rather than collapsing multi-trial evidence into one bit. */
export function scoreCaseSet(cases: ToolTriggerCase[], observations: CaseObservations): ToolTriggerReport {
  let truePositives = 0
  let falsePositives = 0
  let trueNegatives = 0
  let falseNegatives = 0
  let trials = 0

  const perCase = cases.map((testCase) => {
    const trialResults = observations.get(testCase.id) ?? []
    trials = Math.max(trials, trialResults.length)

    let fired = 0
    let correct = 0
    for (const didFire of trialResults) {
      if (didFire) fired++
      if (didFire === testCase.shouldFire) correct++

      if (testCase.shouldFire && didFire) truePositives++
      else if (testCase.shouldFire && !didFire) falseNegatives++
      else if (!testCase.shouldFire && didFire) falsePositives++
      else trueNegatives++
    }

    return { id: testCase.id, shouldFire: testCase.shouldFire, fired, correct }
  })

  const totalTrials = truePositives + falsePositives + trueNegatives + falseNegatives
  const accuracy = totalTrials === 0 ? 0 : (truePositives + trueNegatives) / totalTrials
  const precision = truePositives + falsePositives === 0 ? 0 : truePositives / (truePositives + falsePositives)
  const recall = truePositives + falseNegatives === 0 ? 0 : truePositives / (truePositives + falseNegatives)
  const systematicFailures = perCase.filter((entry) => entry.correct === 0).map((entry) => entry.id)

  return {
    tool: cases[0]?.tool ?? '',
    caseCount: cases.length,
    trials,
    perCase,
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    accuracy,
    precision,
    recall,
    systematicFailures,
    hour: getLocalHour()
  }
}
