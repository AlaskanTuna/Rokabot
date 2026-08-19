/** Generic tool-trigger benchmark rig: seeds a labelled dialogue set and measures whether a real
 * live model call fires a given tool. Shared across future case sets (e.g. search_web, issue #19). */

import { assertClaim } from '../../src/agent/memory/memoryClaims.js'
import { destroySession, generateResponse } from '../../src/agent/roka.js'
import { saveMessage } from '../../src/storage/sessionStore.js'
import { upsertUserName } from '../../src/storage/userNames.js'
import type { CaseObservations, CaseSetHeader, ToolTriggerCase } from './toolTriggerScoring.js'

// A fired tool costs two back-to-back Gemini calls inside one generateResponse (initial ->
// function call -> tool result -> final text), so worst case is 2 calls / 12s = 10 RPM against
// the 15 RPM cap (config.rateLimit.rpm) — the rig bypasses the handlers' RateLimiter entirely,
// so this pacing is the only limiter. Gate-1 amendment (human, 2026-07-29): do not tune below
// 12000 — the plan's original 8000 sits at exactly 15 RPM, leaving no headroom for a real gate.
const TRIAL_PACING_FLOOR_MS = 12000

/** Raise-only override. The 2-calls-per-turn worst case above predates the safety de-escalation ladder
 * (#81), which can spend further attempts inside one turn, so a run competing with live production traffic
 * on the same project quota can still trip the 15 RPM cap. Lowering is refused rather than clamped silently:
 * the floor is the human's Gate-1 amendment, so it is enforced here rather than left in a comment. */
export const TRIAL_PACING_MS = Math.max(
  TRIAL_PACING_FLOOR_MS,
  Number(process.env.ROKABOT_TRIAL_PACING_MS) || TRIAL_PACING_FLOOR_MS
)

/** Seeds the shared world state (user_names, memory_claim) and one trial channel's session_history —
 * the exact triple that reaches the prompt via retrieveForTurn + getAllUserNames. Claims and members
 * are idempotent upserts, so re-seeding per trial channel is safe; history is channel-scoped and must
 * be re-seeded per trial. */
export function seedWorld(header: CaseSetHeader, channelId: string): void {
  for (const member of header.members) {
    upsertUserName(member.id, member.username, member.displayName)
  }

  for (const claim of header.claims) {
    assertClaim({
      guildId: header.guildId,
      subjectUserId: claim.subjectId,
      predicate: claim.predicate,
      value: claim.value,
      sourceKind: 'human'
    })
  }

  const membersById = new Map(header.members.map((member) => [member.id, member]))
  for (const line of header.history) {
    const speaker = membersById.get(line.speakerId)
    if (!speaker) throw new Error(`Tool-trigger history references unknown member "${line.speakerId}"`)
    saveMessage(channelId, 'user', speaker.displayName, line.content, speaker.id, speaker.username)
  }
}

export interface RunCaseSetOptions {
  trials: number
}

/** `transientRetries` rides along with the observations rather than staying in the log, so a run that
 * needed retries to reach its verdict says so next to the verdict. It counts every retried attempt across
 * the case set even though the budget is per trial — the budget decides when to stop, the count is what a
 * reader needs to know how much of the verdict was recovered rather than measured first time. */
export interface CaseSetRun {
  observations: CaseObservations
  transientRetries: number
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs))
}

/** How many times one trial may be re-run after a transient before the run is abandoned.
 *
 * Not a retry-until-green dial. A prompt that genuinely makes the model return nothing would otherwise
 * hide behind unlimited retries and score as though it never had, which is the failure this file's own
 * guard exists to prevent.
 *
 * Budgeted per trial rather than across the run, because the variable that separates the two failures is
 * **concentration on one case**, not total volume: noise on the wire lands one-each on scattered cases,
 * a broken prompt lands repeatedly on the same one, and a run-level count sums that distinction away —
 * it cannot tell three unlucky cases from one broken one. Per-trial is tighter where it should be (a
 * broken case aborts on its own third failure, rather than waiting for a fourth failure anywhere) and
 * looser where it should be (four scattered transients never accumulate into an abort). It also needs no
 * fitted rate to justify it: "this trial failed three times running" is a statement about the trial. */
const MAX_TRIAL_RETRIES = 2

/** Runs every case for `options.trials` trials against the live model, one unique channel per trial
 * so nothing carries over between them, and paced at TRIAL_PACING_MS.
 *
 * A call that does not come back as a genuine model turn is never scored — recording an empty
 * toolsUsed as a real no-fire would be a false negative indistinguishable from a true one, biasing
 * accuracy downward silently. But the two ways that happens are not the same event, and treating them
 * alike cost two entire runs:
 *
 * - **A deflection** (safety, recitation, session_corrupt, terminal — e.g. an expired or revoked
 *   GRAPHIFY_GEMINI_API_KEY) aborts immediately. Every fixture message is benign, so a safety block
 *   here is itself a reportable anomaly rather than a data point, and retrying it would only bury the
 *   report.
 * - **A transient fallback** (transient_http, network, empty_text) retries the trial on a fresh
 *   channel. It says nothing about the trigger rule and nothing about the prompt — it is one bad
 *   minute on the wire. Aborting on it discarded ~40 minutes and ~108 requests over a single case out
 *   of 108, and it happened on two consecutive runs for two different kinds, which made the project's
 *   own two-green-runs bar for a prompt change unreachable in practice.
 *
 * The invariant is unchanged: no corrupted observation is ever scored. Only the recovery differs. */
export async function runCaseSet(
  header: CaseSetHeader,
  cases: ToolTriggerCase[],
  options: RunCaseSetOptions
): Promise<CaseSetRun> {
  const membersById = new Map(header.members.map((member) => [member.id, member]))
  const observations: CaseObservations = new Map(cases.map((testCase) => [testCase.id, []]))
  let transientRetries = 0

  // src/config.ts imports dotenv/config, so a developer's real Tavily key is live in harness runs;
  // recall_user's tool declaration is the thing under test, so search_web must stay unreachable.
  const originalTavilyKey = process.env.TAVILY_API_KEY
  // biome-ignore lint/performance/noDelete: assigning undefined would coerce to the string "undefined", leaving searchWeb's `if (!apiKey)` guard truthy
  delete process.env.TAVILY_API_KEY

  let isFirstCall = true
  try {
    for (const testCase of cases) {
      const speaker = membersById.get(testCase.speakerId)
      if (!speaker) throw new Error(`Case "${testCase.id}" references unknown speaker "${testCase.speakerId}"`)

      for (let trial = 0; trial < options.trials; trial++) {
        let fired: boolean | undefined

        // A retry gets its own channel rather than reusing the trial's, so the retried turn is as
        // clean an observation as a first attempt — the failed one already wrote session state.
        for (let retry = 0; fired === undefined; retry++) {
          if (!isFirstCall) await sleep(TRIAL_PACING_MS)
          isFirstCall = false

          const channelId = `live-${testCase.id}-${trial}${retry > 0 ? `-retry${retry}` : ''}`
          seedWorld(header, channelId)
          try {
            const result = await generateResponse({
              channelId,
              guildId: header.guildId,
              userMessage: testCase.message,
              displayName: speaker.displayName,
              username: speaker.username,
              userId: speaker.id
            })

            if (result.metrics.outcome === 'deflection') {
              throw new Error(
                `Reliability guard: case "${testCase.id}" trial ${trial} was deflected (kind=` +
                  `${result.metrics.kind}) instead of returning a genuine model turn — aborting the run. ` +
                  'Every fixture message is benign, so this is an anomaly to report, not a turn to retry.'
              )
            }

            if (result.metrics.outcome !== 'ok') {
              transientRetries++
              if (retry >= MAX_TRIAL_RETRIES) {
                throw new Error(
                  `Reliability guard: case "${testCase.id}" trial ${trial} returned outcome=` +
                    `${result.metrics.outcome} (kind=${result.metrics.kind}) on all ` +
                    `${MAX_TRIAL_RETRIES + 1} of its attempts — aborting. Failing this consistently on one ` +
                    'case is not one bad minute on the wire.'
                )
              }
              console.warn(
                `[tool-trigger] case "${testCase.id}" trial ${trial} returned ${result.metrics.outcome} ` +
                  `(kind=${result.metrics.kind}); retrying on a fresh channel ` +
                  `(attempt ${retry + 2} of ${MAX_TRIAL_RETRIES + 1}, ${transientRetries} retried so far).`
              )
              continue
            }

            fired = result.toolsUsed.includes(header.tool)
          } finally {
            await destroySession(channelId)
          }
        }

        observations.get(testCase.id)!.push(fired)
      }
    }
  } finally {
    if (originalTavilyKey === undefined) {
      // biome-ignore lint/performance/noDelete: see the pre-run deletion above
      delete process.env.TAVILY_API_KEY
    } else {
      process.env.TAVILY_API_KEY = originalTavilyKey
    }
  }

  return { observations, transientRetries }
}
