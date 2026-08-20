import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaseSetHeader, ToolTriggerCase } from '../toolTriggerScoring.js'

vi.mock('../../../src/agent/roka.js', () => ({
  generateResponse: vi.fn(),
  destroySession: vi.fn(async () => {})
}))
vi.mock('../../../src/agent/memory/memoryClaims.js', () => ({ assertClaim: vi.fn() }))
vi.mock('../../../src/storage/sessionStore.js', () => ({ saveMessage: vi.fn() }))
vi.mock('../../../src/storage/userNames.js', () => ({ upsertUserName: vi.fn() }))
// Stubbed rather than allowed through: diagnoseKey spends a real generateContent request, and a unit test
// that reached the network to produce an error message would be measuring the wire.
vi.mock('../quotaDiagnostic.js', () => ({ diagnoseKey: vi.fn(async () => 'STUBBED DIAGNOSIS') }))
vi.mock('../gateRecord.js', () => ({ emitTrialRecord: vi.fn() }))

const { destroySession, generateResponse } = await import('../../../src/agent/roka.js')
const { diagnoseKey } = await import('../quotaDiagnostic.js')
const { emitTrialRecord } = await import('../gateRecord.js')
const { runCaseSet } = await import('../toolTrigger.js')

// The rig sleeps TRIAL_PACING_MS (>=12s) before every turn but the first, so even a three-trial run is
// most of a minute of real wall clock. Timers are faked rather than the pacing lowered: TRIAL_PACING_MS
// is raise-only by a human's Gate-1 amendment because it is the only thing holding a live run under 15
// RPM, and there is no live call here to pace. Driving the clock leaves that floor exactly as it is.
vi.useFakeTimers()

/** Runs the rig with the pacing sleeps driven rather than waited. `runAllTimersAsync` keeps draining as
 * each awaited turn schedules the next sleep, so it follows the loop to the end. */
async function runPaced(trials: number) {
  const run = runCaseSet(header, cases, { trials })
  const settled = run.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  )
  await vi.runAllTimersAsync()
  const outcome = await settled
  if ('error' in outcome) throw outcome.error
  return outcome.value
}

const header: CaseSetHeader = {
  type: 'header',
  tool: 'recall_user',
  guildId: 'eval-guild',
  members: [{ id: 'sora', username: 'sora', displayName: 'Sora' }],
  claims: [],
  history: []
}

const cases: ToolTriggerCase[] = [
  { type: 'case', id: 'F1', tool: 'recall_user', shouldFire: true, speakerId: 'sora', message: 'what about Sora?' }
]

const turn = (outcome: string, kind: string, toolsUsed: string[] = []) => ({
  toolsUsed,
  metrics: { outcome, kind }
})

const ok = (toolsUsed: string[] = ['recall_user']) => turn('ok', 'ok', toolsUsed)

beforeEach(() => {
  vi.mocked(generateResponse).mockReset()
  vi.mocked(destroySession).mockClear()
  vi.mocked(diagnoseKey).mockClear()
  vi.mocked(emitTrialRecord).mockClear()
})

describe('runCaseSet transient recovery', () => {
  it('retries a transient fallback on a fresh channel instead of discarding the run', async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(turn('fallback', 'empty_text') as never)
      .mockResolvedValue(ok() as never)

    const { observations, transientRetries } = await runPaced(2)

    expect(observations.get('F1')).toEqual([true, true])
    expect(transientRetries).toBe(1)
    // A retry that reused the trial's channel would score a turn whose session already held the
    // failed attempt, so the fresh id is the point rather than a detail.
    expect(vi.mocked(destroySession).mock.calls.map((call) => call[0])).toEqual([
      'live-F1-0',
      'live-F1-0-retry1',
      'live-F1-1'
    ])
  })

  // #156: a record written only on the success path would be missing exactly the attempts anyone would
  // later want to read — the failed ones. Emitted per attempt, before the branches that end the run.
  it('records the attempt that failed as well as the one that replaced it', async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(turn('fallback', 'empty_text') as never)
      .mockResolvedValue(ok() as never)

    await runPaced(1)

    const attempts = vi.mocked(emitTrialRecord).mock.calls.map((call) => call[0])
    expect(attempts.map((a) => a.caseAttempt)).toEqual([0, 1])
    expect(attempts.map((a) => a.outcome)).toEqual(['fallback', 'ok'])
    expect(attempts.map((a) => a.fired)).toEqual([false, true])
  })

  // The gap the branch records do not cover: `generateResponse` throwing skips the emit entirely, so the one
  // attempt guaranteed to matter — the one that ended the run — would be the only one absent from the log.
  it('records an attempt that threw, rather than leaving the fatal one unlogged', async () => {
    vi.mocked(generateResponse).mockRejectedValue(new TypeError('session exploded'))

    await expect(runPaced(1)).rejects.toThrow(/session exploded/)

    const records = vi.mocked(emitTrialRecord).mock.calls.map((call) => call[0])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ outcome: 'threw', kind: 'TypeError', fired: false })
  })

  // The discriminating case for the dedup flag's SCOPE, which neither test above reaches: the one-attempt
  // tests cannot see a stale flag, and the two-attempt test has neither attempt throw. Declared outside the
  // retry loop, attempt 0 returning would leave `recorded` true and silently suppress attempt 1's throw —
  // the absence the catch exists to prevent, reintroduced by a declaration moving five lines.
  it('records a later attempt that threw even after an earlier one returned', async () => {
    vi.mocked(generateResponse)
      .mockResolvedValueOnce(turn('fallback', 'empty_text') as never)
      .mockRejectedValue(new RangeError('second attempt exploded'))

    await expect(runPaced(1)).rejects.toThrow(/second attempt exploded/)

    const records = vi.mocked(emitTrialRecord).mock.calls.map((call) => call[0])
    expect(records.map((r) => r.outcome)).toEqual(['fallback', 'threw'])
    expect(records.map((r) => r.caseAttempt)).toEqual([0, 1])
  })

  // The reliability guard emits before it throws, so the catch must not write a second record for the same
  // attempt — an abort would otherwise appear twice and inflate any count taken from these lines.
  it('does not double-record an attempt the reliability guard aborted', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('deflection', 'safety') as never)

    await expect(runPaced(1)).rejects.toThrow(/was deflected/)

    expect(vi.mocked(emitTrialRecord)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(emitTrialRecord).mock.calls[0][0].outcome).toBe('deflection')
  })

  it('aborts immediately on a deflection rather than retrying it', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('deflection', 'safety') as never)

    await expect(runPaced(1)).rejects.toThrow(/was deflected \(kind=safety\)/)
    // One call, not four: a benign fixture message that trips a safety block is a report, not a flake.
    expect(vi.mocked(generateResponse)).toHaveBeenCalledTimes(1)
  })

  it('aborts when one trial fails every attempt, naming how many it had', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('fallback', 'transient_http') as never)

    await expect(runPaced(1)).rejects.toThrow(/on all 3 of its attempts/)
    // A budget of 2 retries is 3 attempts, and no more: the abort is what stops it, not exhaustion.
    expect(vi.mocked(generateResponse)).toHaveBeenCalledTimes(3)
  })

  // #150: every 429 arrives as transient_http, so this message used to blame the fixture for a spent key
  // and for a run outpacing its own cap alike. The diagnosis is what separates them, and it has to reach
  // the thrown message — a diagnostic nobody reads is the comment-instead-of-a-check mistake again.
  it('carries a diagnosis into the abort when the failure was an HTTP transient', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('fallback', 'transient_http') as never)

    await expect(runPaced(1)).rejects.toThrow(/Diagnostic call reports: STUBBED DIAGNOSIS/)
    expect(vi.mocked(diagnoseKey)).toHaveBeenCalledTimes(1)
  })

  // The diagnostic must never eat the finding. This line runs while an abort is being assembled, so a
  // rejecting probe would surface as an error about the tool that was fetching the explanation instead of
  // the explanation — #150's own failure mode, one level up and harder to see because the message would
  // look like a real error rather than a misleading one.
  it('still reports the abort when the diagnostic itself fails', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('fallback', 'transient_http') as never)
    vi.mocked(diagnoseKey).mockRejectedValueOnce(new Error('probe exploded'))

    await expect(runPaced(1)).rejects.toThrow(/on all 3 of its attempts/)
  })

  it('says the diagnostic failed rather than staying silent about why there is no diagnosis', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('fallback', 'transient_http') as never)
    vi.mocked(diagnoseKey).mockRejectedValueOnce(new Error('probe exploded'))

    await expect(runPaced(1)).rejects.toThrow(/diagnostic call itself failed.*probe exploded/)
  })

  // The control, and the reason the diagnosis is gated on `kind` rather than run on every abort: a socket
  // that keeps dropping is not a quota question, and spending a request to ask would answer nothing.
  it('does not spend a request diagnosing a failure that was never a quota refusal', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('fallback', 'network') as never)

    await expect(runPaced(1)).rejects.toThrow(/on all 3 of its attempts/)
    await expect(runPaced(1)).rejects.not.toThrow(/Diagnostic call reports/)
    expect(vi.mocked(diagnoseKey)).not.toHaveBeenCalled()
  })

  // The distinction the per-trial budget exists to make. Scattered noise is not a finding; the same case
  // failing over and over is. A run-level count could not tell these two apart.
  it('does not accumulate scattered transients into an abort', async () => {
    const spread: ToolTriggerCase[] = ['A', 'B', 'C', 'D'].map((id) => ({
      type: 'case',
      id,
      tool: 'recall_user',
      shouldFire: true,
      speakerId: 'sora',
      message: 'what about Sora?'
    }))
    // One transient per case, four in total — more than any run-level budget worth setting would allow.
    vi.mocked(generateResponse).mockImplementation((async (input: { channelId: string }) =>
      input.channelId.includes('-retry') ? ok() : turn('fallback', 'network')) as never)

    const run = runCaseSet(header, spread, { trials: 1 })
    const settled = run.then(
      (value) => ({ value }),
      (error: unknown) => ({ error })
    )
    await vi.runAllTimersAsync()
    const outcome = await settled
    if ('error' in outcome) throw outcome.error

    expect(outcome.value.transientRetries).toBe(4)
    expect([...outcome.value.observations.values()]).toEqual([[true], [true], [true], [true]])
  })

  it('reports zero retries on a clean run, so the count distinguishes clean from recovered', async () => {
    vi.mocked(generateResponse).mockResolvedValue(ok() as never)

    const { transientRetries } = await runPaced(3)

    expect(transientRetries).toBe(0)
  })

  it('still records a genuine no-fire as a no-fire', async () => {
    vi.mocked(generateResponse).mockResolvedValue(ok([]) as never)

    const { observations } = await runPaced(2)

    expect(observations.get('F1')).toEqual([false, false])
  })
})
