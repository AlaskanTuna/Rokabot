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
  attempt: number
  fired: boolean
  toolsUsed: string[]
  outcome: string
  kind: string
  retries: number
  channel: string
}

export function formatTrialRecord(record: TrialRecord): string {
  // `hour` is read here rather than passed in, because it is the value the prompt was actually assembled
  // from — the same field the confusion matrix records. Reading it at emit time keeps the record honest if
  // the pin is ever absent: an unpinned run writes whatever the clock said, rather than a blank.
  return `${PREFIX}${JSON.stringify({ ...record, hour: getLocalHour() })}`
}

export function emitTrialRecord(record: TrialRecord): void {
  console.log(formatTrialRecord(record))
}
