import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaseSetHeader, ToolTriggerCase } from '../toolTriggerScoring.js'

vi.mock('../../../src/agent/roka.js', () => ({
  generateResponse: vi.fn(),
  destroySession: vi.fn(async () => {})
}))
vi.mock('../../../src/agent/memory/memoryClaims.js', () => ({ assertClaim: vi.fn() }))
vi.mock('../../../src/storage/sessionStore.js', () => ({ saveMessage: vi.fn() }))
vi.mock('../../../src/storage/userNames.js', () => ({ upsertUserName: vi.fn() }))

const { destroySession, generateResponse } = await import('../../../src/agent/roka.js')
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

  it('aborts immediately on a deflection rather than retrying it', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('deflection', 'safety') as never)

    await expect(runPaced(1)).rejects.toThrow(/was deflected \(kind=safety\)/)
    // One call, not four: a benign fixture message that trips a safety block is a report, not a flake.
    expect(vi.mocked(generateResponse)).toHaveBeenCalledTimes(1)
  })

  it('aborts once the transient budget is spent, naming the count', async () => {
    vi.mocked(generateResponse).mockResolvedValue(turn('fallback', 'transient_http') as never)

    await expect(runPaced(1)).rejects.toThrow(/spent 4 transient retries/)
    // Budget of 3 means three retried turns plus the one that exceeds it.
    expect(vi.mocked(generateResponse)).toHaveBeenCalledTimes(4)
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
