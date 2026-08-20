import { describe, expect, it, vi } from 'vitest'

import { type TrialRecord, formatTrialRecord } from '../gateRecord.js'

const record: TrialRecord = {
  tool: 'recall_user',
  case: 'R4',
  shouldFire: true,
  trial: 1,
  attempt: 0,
  fired: false,
  toolsUsed: [],
  outcome: 'ok',
  kind: 'ok',
  retries: 0,
  channel: 'live-R4-1'
}

describe('formatTrialRecord', () => {
  // The prefix IS the interface — `grep '^\[gate-trial\] ' run.log | cut -c14- | jq`. Written out rather
  // than imported from the module, so changing it fails here instead of silently orphaning every parser
  // anyone has written against a previous run's logs (#160).
  it('emits one line under a stable, greppable prefix', () => {
    const line = formatTrialRecord(record)

    expect(line.startsWith('[gate-trial] ')).toBe(true)
    expect(line).not.toContain('\n')
  })

  it('emits valid JSON after the prefix, so a run is parseable without a bespoke parser', () => {
    const parsed = JSON.parse(formatTrialRecord(record).slice('[gate-trial] '.length))

    expect(parsed).toMatchObject({ tool: 'recall_user', case: 'R4', trial: 1, attempt: 0, fired: false })
  })

  // The whole point of the record. `fired: false` on a `shouldFire: true` case is a false negative, and
  // three of them are what `remember_user`'s 0.833 recall is made of — a number that took two wrong
  // explanations before per-trial data settled it.
  it('carries what a case was expected to do alongside what it did', () => {
    const parsed = JSON.parse(formatTrialRecord(record).slice('[gate-trial] '.length))

    expect(parsed.shouldFire).toBe(true)
    expect(parsed.fired).toBe(false)
  })

  // Two runs at different hours score different prompts, so a record without the hour cannot be compared to
  // another run at all. Read at emit time from the same function the prompt is assembled from.
  it('stamps the hour the prompt was actually assembled from', async () => {
    vi.stubEnv('ROKABOT_HARNESS_LIVE', '1')
    vi.stubEnv('ROKABOT_FIXED_HOUR', '9')
    vi.resetModules()
    const { formatTrialRecord: fresh } = await import('../gateRecord.js')

    const parsed = JSON.parse(fresh(record).slice('[gate-trial] '.length))

    expect(parsed.hour).toBe(9)
    vi.unstubAllEnvs()
    vi.resetModules()
  })
})
