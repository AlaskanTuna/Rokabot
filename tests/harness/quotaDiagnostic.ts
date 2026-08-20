/** Turns a transient-abort into a statement about WHY, by asking the key one question.
 *
 * `geminiReliability` collapses every 429 into `transient_http`, which is right for production — the ladder
 * retries and deflects if it cannot recover. It is wrong for the gate, where the same status carries three
 * situations with three different remedies, and the abort message names none of them: it blames the case
 * (#150). Two of the three were seen in a single night — a key spent for the day (#150), and a run outpacing
 * the per-minute cap (#166) — and in both the fixture was fine.
 *
 * The error text never reaches `ResponseMetrics`; only `outcome` and `kind` do. Plumbing a quota ID through
 * production types to improve a harness message would put test concerns in the wrong file, so the harness
 * asks for itself instead: one call, only on a path that has already given up. */

import { GoogleGenAI } from '@google/genai'

import { config } from '../../src/config.js'

export const SPENT_FOR_THE_DAY =
  'this key is spent for the day, so the run is not a measurement — name another with ROKABOT_HARNESS_KEY'
export const OUTPACING_THE_CAP =
  'the run is asking faster than the per-minute cap allows, so the fixture is not what failed — raise ' +
  'ROKABOT_TRIAL_PACING_MS, or lower gemini.maxLlmCalls'
// Deliberately does not conclude the fixture is at fault. A per-minute refusal recovers in seconds, so a
// probe run after the ladder gave up cannot rule one out — reporting what was observed beats inferring an
// absence from a later success.
// Google's own capacity, not ours. A 503 reaches here because `geminiReliability`'s transient pattern
// matches 500/503/504 alongside 429, and the verbatim branch below would report it accurately while burying
// the one thing the operator needs: nothing about this run is theirs to fix. Payload copied from the
// 2026-08-21 03:20 runs, where both keys took 503s with zero quota refusals between them.
export const BACKEND_OUT_OF_CAPACITY =
  'Gemini reports the model is out of capacity, which is neither the key nor the fixture nor the pacing — ' +
  'this run is not a measurement, and the only remedy is to run it again when capacity returns'
export const KEY_IS_LIVE =
  'a diagnostic call succeeded, so the key is not spent for the day — but a per-minute refusal recovers ' +
  "within seconds and this probe ran after the fact, so check the run's calls/min before blaming the fixture"

/** How long the probe may take before its answer is worth less than the delay. A spent key answers in
 * milliseconds; anything approaching this is a hung socket, and a diagnostic that hangs costs the whole
 * run — the gate stops producing a verdict rather than producing a wrong one. */
export const DIAGNOSTIC_TIMEOUT_MS = 10_000

/** Spends one request to ask the key what is wrong with it, on a path that has already given up.
 *
 * Never rejects. The caller is mid-abort, so a diagnostic that threw would replace the finding with an
 * error about the tool that was fetching it — the misdirection this module exists to remove, one level up.
 * The client construction is inside the try for the same reason: `new GoogleGenAI` throws on a missing or
 * malformed key, which is exactly the state a spent-key run is most likely to be near. */
export async function diagnoseKey(): Promise<string> {
  try {
    const client = new GoogleGenAI({ apiKey: config.gemini.apiKey })
    await client.models.generateContent({
      model: config.gemini.model,
      contents: 'ping',
      config: { abortSignal: AbortSignal.timeout(DIAGNOSTIC_TIMEOUT_MS) }
    })
    return KEY_IS_LIVE
  } catch (error) {
    return describeQuotaFailure(error)
  }
}

/** Classifies the error a diagnostic call came back with. Separated from the call itself so the branch that
 * matters is testable without spending a request, and so the caller stays one line. */
export function describeQuotaFailure(error: unknown): string {
  const text = errorText(error)
  // Matched on the quota ID rather than on the 429, because both situations are 429s and the ID is the only
  // thing in the payload that separates them. `RequestsPerDay` vs `RequestsPerMinute`, per Google's
  // `quotaId` values (`GenerateRequestsPerDayPerProjectPerModel-FreeTier` and its per-minute twin).
  if (/RequestsPerDay/i.test(text)) return SPENT_FOR_THE_DAY
  if (/RequestsPerMinute/i.test(text)) return OUTPACING_THE_CAP
  // After the quota IDs, never before: a 429 payload names its quota and says nothing about availability,
  // so the order cannot mask one with the other, and a capacity 503 carries no quota ID to be confused by.
  if (/UNAVAILABLE|"code":\s*50[034]/i.test(text)) return BACKEND_OUT_OF_CAPACITY
  // Anything else is reported verbatim rather than bucketed. A diagnostic that guessed would recreate the
  // problem it exists to fix.
  return `the diagnostic call failed with something other than a quota error: ${text.slice(0, 300)}`
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}
