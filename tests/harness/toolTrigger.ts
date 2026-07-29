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
export const TRIAL_PACING_MS = 12000

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

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs))
}

/** Runs every case for `options.trials` trials against the live model, one unique channel per trial
 * so nothing carries over between them, and paced at TRIAL_PACING_MS. Aborts the entire run the
 * instant a call does not come back as a genuine model turn (metrics.outcome !== 'ok') — that covers
 * a retry-exhausted fallback (transient_http/network/empty_text) and also a deflection (safety,
 * recitation, session_corrupt, or terminal, e.g. an expired/revoked GRAPHIFY_GEMINI_API_KEY) — rather
 * than recording an empty toolsUsed as a genuine no-fire. A deflected turn is not an observation of
 * the trigger rule at all, and every fixture message is benign, so a safety block here is itself a
 * reportable anomaly, not a data point; scoring it would be a false negative indistinguishable from a
 * real one, biasing accuracy downward silently. */
export async function runCaseSet(
  header: CaseSetHeader,
  cases: ToolTriggerCase[],
  options: RunCaseSetOptions
): Promise<CaseObservations> {
  const membersById = new Map(header.members.map((member) => [member.id, member]))
  const observations: CaseObservations = new Map(cases.map((testCase) => [testCase.id, []]))

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
        if (!isFirstCall) await sleep(TRIAL_PACING_MS)
        isFirstCall = false

        const channelId = `live-${testCase.id}-${trial}`
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

          if (result.metrics.outcome !== 'ok') {
            throw new Error(
              `Rate-limit/reliability guard: case "${testCase.id}" trial ${trial} returned outcome=` +
                `${result.metrics.outcome} (kind=${result.metrics.kind}) instead of a genuine model turn — ` +
                'aborting the run rather than scoring a corrupted observation.'
            )
          }

          observations.get(testCase.id)!.push(result.toolsUsed.includes(header.tool))
        } finally {
          await destroySession(channelId)
        }
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

  return observations
}
