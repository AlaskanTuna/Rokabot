import { getLocalHour } from '../../src/utils/timezone.js'

/** One JSON line per live-gate ATTEMPT, so a finished run answers questions nobody thought to ask while it
 * was running.
 *
 * A gate emits ~2 MB of ANSI-coloured prose, and every conclusion drawn from those logs so far was extracted
 * by a hand-written grep. Two of them were wrong: one from a comparison window chosen by hand, one from a
 * substring that matched the fixtures as well as the field. In both cases the evidence that refuted them was
 * already on disk and simply not readable (#156). These records cost no quota — the run has already made the
 * call — and they are per ATTEMPT rather than per trial, so a retried turn shows both attempts instead of
 * only the one that survived.
 *
 * The prefix is the whole interface: `grep '^\[gate-trial\] ' run.log | cut -c14- | jq`. */
const PREFIX = '[gate-trial] '

export interface TrialRecord {
  tool: string
  case: string
  shouldFire: boolean
  trial: number
  /** Case-set attempt index, 0-based: the retry loop from #146 that re-runs a trial on a fresh channel. */
  caseAttempt: number
  fired: boolean
  toolsUsed: string[]
  outcome: string
  kind: string
  /** In-turn safety/reliability ladder retries, from `ResponseMetrics.retries`. A different quantity from
   * `caseAttempt` and not summable with it: model calls for one trial is the sum over its attempts of
   * `ladderRetries + 1`, so neither field alone answers "how often did this trial reach the model". */
  ladderRetries: number
  channel: string
}

export function formatTrialRecord(record: TrialRecord): string {
  // `hour` is read at EMIT time, which is after the turn ran — not plumbed from the moment the prompt was
  // assembled. Under the harness pin the two are the same value by construction. Without the pin they can
  // differ by a turn's duration at a boundary: a prompt assembled at 04:59:55 saying "late night" is
  // recorded here as hour 5. Said plainly because analysing exactly that skew is what these records are for,
  // and a field quietly disagreeing with the prompt it describes would send the next reader down the 05:00
  // path that was already retracted once. Plumbing the assembly-time value through `GenerateResult` is more
  // machinery than the honesty is worth; naming the limit costs a comment.
  return `${PREFIX}${JSON.stringify({ ...record, hour: getLocalHour() })}`
}

export function emitTrialRecord(record: TrialRecord): void {
  console.log(formatTrialRecord(record))
}
