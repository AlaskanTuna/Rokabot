import type { LlmRequest } from '@google/adk'
import { describe, expect, it, vi } from 'vitest'
import { type CallUsage, WORKLOAD_LABEL, onUsage, recordUsage, workloadOf } from '../usage.js'

const call: CallUsage = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  workload: 'reply',
  inputTokens: 10,
  outputTokens: 5
}

describe('usage', () => {
  it('delivers each recorded call to every listener until it unsubscribes', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = onUsage(first)
    const stopSecond = onUsage(second)

    recordUsage(call)
    stopFirst()
    recordUsage(call)
    stopSecond()

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledWith(call)
  })

  it('keeps delivering when one listener throws', () => {
    const after = vi.fn()
    const stopBroken = onUsage(() => {
      throw new Error('broken listener')
    })
    const stopAfter = onUsage(after)

    expect(() => recordUsage(call)).not.toThrow()
    expect(after).toHaveBeenCalledOnce()
    stopBroken()
    stopAfter()
  })

  it('reads the workload label and treats an unlabelled ADK request as a reply', () => {
    const labelled = { contents: [], config: { labels: { [WORKLOAD_LABEL]: 'extraction' } } } as unknown as LlmRequest
    const unknown = { contents: [], config: { labels: { [WORKLOAD_LABEL]: 'gossip' } } } as unknown as LlmRequest

    expect(workloadOf(labelled)).toBe('extraction')
    expect(workloadOf(unknown)).toBe('reply')
    expect(workloadOf({ contents: [] } as unknown as LlmRequest)).toBe('reply')
  })
})
