import { describe, expect, it } from 'vitest'
import { MODEL_PROFILES, profileFor } from '../profiles.js'

describe('model profiles', () => {
  it('ships the tested profiles and the Chat Completions models', () => {
    expect(MODEL_PROFILES.map(({ provider, model, verified }) => ({ provider, model, verified }))).toEqual([
      { provider: 'gemini', model: 'gemini-3.5-flash-lite', verified: true },
      { provider: 'anthropic', model: 'claude-haiku-5-5', verified: true },
      { provider: 'modelscope', model: 'Qwen/Qwen3.5-122B-A10B', verified: true },
      { provider: 'openai', model: 'gpt-6-luna', verified: true },
      { provider: 'modelscope', model: 'Qwen/Qwen3.5-35B-A3B', verified: true },
      { provider: 'modelscope', model: 'deepseek-ai/DeepSeek-V4.1-Flash', verified: true }
    ])
  })

  it('finds a profile by provider and exact model id only', () => {
    expect(profileFor('anthropic', 'claude-haiku-5-5')?.structuredOutput).toBe('forced_tool')
    expect(profileFor('gemini', 'claude-haiku-5-5')).toBeUndefined()
    expect(profileFor('anthropic', 'claude-haiku-5-5-20261007')).toBeUndefined()
  })

  it('gives Haiku low-effort thinking that replays inside a turn, and no sampling parameters', () => {
    const haiku = profileFor('anthropic', 'claude-haiku-5-5')

    expect(haiku?.thinking).toEqual({
      efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
      replayWithinTurn: true
    })
    expect(haiku?.sampling).toEqual({ temperature: false, topP: false })
    expect(haiku?.input).toEqual({ image: true, pdf: true, audio: false, video: false })
    expect(haiku?.maxOutputTokens).toBe(128_000)
    expect(haiku?.price).toEqual({ input: 0.1, output: 0.5, cachedInput: 0.01, cacheWrite: 0.125 })
  })

  it('keeps Gemini and the ModelScope fallback as today: sampling allowed, no thinking replay', () => {
    for (const profile of [
      profileFor('gemini', 'gemini-3.5-flash-lite'),
      profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')
    ]) {
      expect(profile?.sampling).toEqual({ temperature: true, topP: true })
      expect(profile?.thinking).toEqual({ efforts: [], replayWithinTurn: false })
    }
  })
})
