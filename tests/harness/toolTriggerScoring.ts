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

function asClaim(value: unknown, line: number, memberIds: Set<string>): FixtureClaim {
  if (!value || typeof value !== 'object') throw new Error(`Tool-trigger fixture line ${line} has an invalid claim`)
  const claim = value as Partial<FixtureClaim>
  const predicate = nonEmptyString(claim.predicate, line, 'claim predicate')
  if (!isKnownPredicate(predicate)) {
    throw new Error(`Tool-trigger fixture line ${line} has an unknown predicate "${predicate}"`)
  }
  const subjectId = nonEmptyString(claim.subjectId, line, 'claim subjectId')
  if (!memberIds.has(subjectId)) {
    throw new Error(`Tool-trigger fixture line ${line} claim subjectId "${subjectId}" is not a declared member`)
  }
  return {
    subjectId,
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
    claims: header.claims.map((claim) => asClaim(claim, line, memberIds)),
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
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => entry.line.trim().length > 0)
    .map((entry) => {
      try {
        return { value: JSON.parse(entry.line) as unknown, number: entry.number }
      } catch {
        throw new Error(`Tool-trigger fixture line ${entry.number} is not valid JSON`)
      }
    })

  const [first, ...rest] = rows
  if (!first) throw new Error('Tool-trigger fixture is empty')
  const header = asHeader(first.value, first.number)
  const memberIds = new Set(header.members.map((member) => member.id))
  const cases = rest.map((row) => asCase(row.value, row.number, memberIds, header.tool))
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
  /** Case ids scoring 0 of N trials. Diagnostic only (issue #49) — does not gate meetsLiveVerdict. */
  systematicFailures: string[]
  hour: number
}

// Floor placed at the *target* behaviour, not the pre-fix baseline (exact Binomial convolution over
// main's per-case fire rates, docs/progress.md:529): main's measured precision is 0.7105, so this
// floor sits above the known-defective baseline by construction, not beneath it. All figures below
// are at full recall (TP=18), where precision >= 0.8 is exactly FP <= 4; at TP=15 the same floor
// permits only FP <= 3.
//   P(pass) on main:                            1.53%  (honestly and reproducibly red)
//   P(pass) once no-fire rate reaches q=0.05:   99.85%
//   P(pass) once no-fire rate reaches q=0.10:   97.18%
//   P(pass) once no-fire rate reaches q=0.15:   87.94%
// Rejected 0.85 (99.89% red on main, but only 90.18% green once #39's fix lands at q=0.10 — a
// 1-in-10 false failure re-creates the dismissal risk issue #49 exists to remove) and 0.75 (28.15%
// pass on main — too close to the defective baseline to separate it). The gate is expected RED on
// main until #39 lands; that is the design, not a bug — see the pin against main's own observation
// counts in toolTrigger.scoring.test.ts.
//
// The "expected RED on main" premise leans heavily on one case: relabelling N5 as
// shouldFire: true reads main green 80.11%; removing N5 entirely reads it green 55.91%. N5's
// label is nonetheless correct, for two independent reasons (relevant to #39's open question):
// (i) N5's speakerId is sora asking about Roka, so even the licensed no-arg self-recall
// (src/agent/tools/index.ts: omit user_name to recall facts about the current speaker) would
// return Sora's facts, not answer the question — wrong person either way, not a legitimate
// self-recall firing; (ii) Phase 21's mutation probe deleted only core.ts:65 (the proactive-recall
// rule) and left that self-recall description untouched, yet N5 still fell to 0/3 — so N5's firing
// is driven by the proactive rule under test, not the self-recall licence.
export const MIN_PRECISION = 0.8

// 0.80 false-fails 0.00% at the measured rate, 1.41% at the 95% Clopper-Pearson lower bound
// (r=0.9460 from 54/54 observed should-fire trials); 0.90 false-fails 25.33% at that same
// pessimistic rate — too high. Catches the mutation-probe collapse to recall 0.111 with
// probability 1.0000. Budget, not per-case: tolerates up to 3 of the 18 should-fire trials missing
// in total (15/18=0.833 passes, 14/18=0.778 fails) — one dead should-fire case (3 of 3 trials
// missing) spends that entire budget by itself, so the floor only lets it through when no other
// should-fire trial also misses.
export const MIN_RECALL = 0.8

/**
 * Tools whose measured rate makes the shared floor unusable, and the floor that is honest for them.
 *
 * The comment above states the calibration premise outright: `r=0.9460 from 54/54 observed should-fire
 * trials`. 0.80 is well-calibrated against a tool running near 1.0, and `recall_user` and `search_web` do —
 * 0.944 to 1.000 across three pinned runs. `remember_user` does not: pooled **43/54 = 0.796** over the same
 * three runs, 95% CI [0.689, 0.904], with the floor sitting INSIDE its own confidence interval (#141).
 *
 * That shortfall is a rate, not one broken fixture — checked rather than assumed, because the two worlds
 * call for opposite fixes. Per case over 9 trials: R1 9/9, R2 5/9, R3 7/9, R4 7/9, R5 9/9, R6 6/9. No dead
 * case to repair, two cases clean, misses spread over four.
 *
 * R2 AND R6, RESOLVED (#182). Both were read before the floor moved rather than after, and neither is a
 * defect. R2 at 5/9 was reported as never clean; it is 3/3 in two earlier runs already on disk, so "never
 * clean" is a property of the E/G/H window someone chose and not of the case. Against its five siblings'
 * pooled 38/45 it is Fisher one-sided p=0.072, and R2 was picked for being the extreme of six, so adjusted
 * for that selection it is ~0.36. R6's 0-of-3 in run H is three genuine model no-fires rather than fallout
 * from that run's 17 RPM refusals — a non-`ok` turn is never scored, it retries on a fresh channel or it
 * aborts the run (`toolTrigger.ts`) — but one whole-run zero SOMEWHERE in the 18 case-slots is expected 0.44
 * times and arrives with probability 36.6% at the per-case rates above, and R2 was the likelier candidate
 * (0.26) than R6 (0.11). Both are what three runs of three trials produce from the rates already recorded
 * here. So neither fixture nor prompt is changed on this evidence. What is pinned instead, offline and free,
 * is that R2's and R6's phrasings cannot be deleted by accident: R6 is the only should-fire case whose
 * message repeats a claim already seeded for its own speaker, which makes it the sole live test of #118's
 * "call it even if you already know the fact" carve-out. See `toolTrigger.scoring.test.ts` and
 * `tokens.test.ts`.
 *
 * One caveat on the numbers above, which no arithmetic fixes: they describe a prompt that no longer ships.
 * `CORE_PROMPT` gained `## Audio and Video` in #183, after this floor was set from E/G/H. 0.796 is the last
 * measurement, not the current one.
 *
 * WHAT THIS FLOOR IS FOR, AND WHAT IT IS NOT. Computed from the per-case rates above rather than from an
 * assumed uniform one, degradation modelled as a proportional drop in every case:
 *
 *     floor  k   false-fail   det@0.75  det@0.70  det@0.65  det@0.111
 *      0.80  15      52.6%       71.1%     84.9%     93.0%    100.00%
 *      0.75  14      28.8%       48.6%     67.9%     82.2%    100.00%
 *      0.70  13      12.2%       27.3%     46.7%     65.3%    100.00%
 *      0.65  12       3.9%       12.3%     27.0%     45.1%    100.00%
 *
 * There is no good row. At any false-fail rate an operator would keep reading, detection of a genuine
 * degradation is 12-45% — a coin flip pointing the other way. **So this is a COLLAPSE detector, not a
 * regression detector**, and 0.65 is chosen for the only two columns that support a choice: a red run means
 * something (3.9%, one run in 25), and total collapse is still caught with certainty. A floor of 0.70 buys
 * detection at 0.65 of 65.3% against 45.1% for a false-fail rate three times higher — one red run in eight,
 * which is the rate at which people learn to re-run a gate instead of reading it.
 *
 * Do NOT read a green `remember_user` as evidence that nothing regressed. Making this a regression detector
 * needs the trial count moved, not the floor: holding false-fail at 5% and detection of a drop to 0.65 at
 * 90% is unreachable at n=18, 30, 40, 50 and 60, and first becomes possible at **n≈80, floor 0.72**. At ~240
 * generate calls a run and two runs per key per day, that is a quota decision rather than a threshold one.
 *
 * The floor and the trial count are one decision. At n=18 the achievable resolution is about +/-0.10 at 95%,
 * so any floor within 0.10 of a tool's true rate is a coin flip by construction. This is an OBSERVATION of
 * 2026-08-21 at n=54, not a specification: it is wrong if `remember_user`'s cases change, if the pooled rate
 * moves outside [0.689, 0.904], or if the trial count moves.
 */
export const RECALL_FLOOR_BY_TOOL: Record<string, number> = {
  remember_user: 0.65
}

/** The recall floor this tool is judged against. */
export function recallFloorFor(tool: string): number {
  return RECALL_FLOOR_BY_TOOL[tool] ?? MIN_RECALL
}

/** The live gate's pass/fail rule, in one place: a precision floor AND a recall floor, both
 * aggregate rates over the full observation set — an aggregate rate over 18 observations does not
 * flake the way a per-case count over 3 trials does (see the reproducibility note below).
 * toolTrigger.live.test.ts and toolTrigger.scoring.test.ts both import this rather than
 * re-implementing it, so a threshold change here can never drift out of sync with what the
 * mutation pin (toolTrigger.scoring.test.ts) validates.
 *
 * Reproducibility, quantified rather than assumed: two consecutive runs on identical code disagree
 * ~3.0% of the time on main and ~0.3% once #39 is fixed to q=0.05, against 45.07% for the retired
 * all-cases-must-pass rule on a p=0.7 borderline case. This gate is satisfied to that ~97%/~99.7%,
 * not absolutely.
 *
 * Power against a regression, with the model stated: an over-trigger that lifts every no-fire
 * case's fire rate to q=0.7 is caught 99.996% of the time (TP=18 fixed, FP ~ Binomial(18, 0.7),
 * gate fails at FP >= 5).
 *
 * Residual, stated rather than hidden by the aggregate framing: no aggregate floor can catch a
 * single no-fire case firing every trial against an otherwise-clean baseline (3 FP of 18 gives
 * precision ~0.86, above any floor a near-clean state must clear — see the mirror test in
 * toolTrigger.scoring.test.ts). Honest per-case gating needs 0.05^(1/k) > 0.5, i.e. k >= 5 to prove
 * one case's true fire rate exceeds 0.5 at 95% confidence — but across the 6 no-fire cases, and
 * evaluated at the q=0.5 decision boundary where a compliant case is hardest to distinguish, that
 * compounds to a 17.4% false-failure rate at N=5 (1-(1-0.5^5)^6), and only falls to ~0.6% at N~=10
 * (~200 calls/run). Those are worst-case boundary figures, not target-state ones: at q=0.15 the same
 * quantities are 0.046% at N=5 and ~0.0000035% at N=10. That is why the criterion here stays
 * aggregate at the trial counts this gate can afford; systematicFailures carries the
 * per-case signal as a diagnostic instead. */
export function meetsLiveVerdict(report: ToolTriggerReport): boolean {
  return report.precision >= MIN_PRECISION && report.recall >= recallFloorFor(report.tool)
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
