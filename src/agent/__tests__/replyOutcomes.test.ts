import { describe, expect, it } from 'vitest'
import { recordReplyOutcome, withReplyOutcomes } from '../replyOutcomes.js'

describe('reply outcomes', () => {
  it('reports none when no replies were read', async () => {
    expect(await withReplyOutcomes(async () => 1)).toEqual([1, 'none'])
  })

  it('keeps found once any call in the turn found replies', async () => {
    const [, outcome] = await withReplyOutcomes(async () => {
      recordReplyOutcome('failed')
      recordReplyOutcome('found')
      recordReplyOutcome('failed')
    })

    expect(outcome).toBe('found')
  })

  it('reports failed when every call failed, and ignores calls outside a turn', async () => {
    recordReplyOutcome('found')
    const [, outcome] = await withReplyOutcomes(async () => recordReplyOutcome('failed'))

    expect(outcome).toBe('failed')
  })
})
