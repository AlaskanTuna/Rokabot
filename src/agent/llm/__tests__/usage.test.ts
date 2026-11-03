import type { LlmRequest } from '@google/adk'
import { describe, expect, it, vi } from 'vitest'
import { type CallUsage, WORKLOAD_LABEL, onUsage, promptTokenTotal, recordUsage, workloadOf } from '../usage.js'
import { usageFromCachedPrompt } from '../usage.js'

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

  it('totals uncached, cache-read and cache-write input tokens into one prompt size', () => {
    expect(promptTokenTotal(call)).toBe(10)
    expect(promptTokenTotal({ ...call, cacheReadTokens: 100 })).toBe(110)
    expect(promptTokenTotal({ ...call, cacheReadTokens: 100, cacheWriteTokens: 40 })).toBe(150)
  })

  it('splits cached input and reasoning out of the provider totals', () => {
    expect(
      usageFromCachedPrompt({
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        workload: 'reply',
        promptTokens: 120,
        cachedTokens: 100,
        outputTokens: 30,
        reasoningTokens: 8
      })
    ).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      workload: 'reply',
      inputTokens: 20,
      outputTokens: 30,
      reasoningTokens: 8,
      cacheReadTokens: 100
    })
  })

  it('floors a larger cache than the prompt at zero and omits empty buckets', () => {
    expect(
      usageFromCachedPrompt({
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        workload: 'reply',
        promptTokens: 5,
        cachedTokens: 10,
        outputTokens: 0,
        reasoningTokens: 0
      })
    ).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      workload: 'reply',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 10
    })
  })
})
