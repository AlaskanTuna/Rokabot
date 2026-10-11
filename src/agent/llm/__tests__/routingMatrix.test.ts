import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { RoutedLlm, modelRouteForRequest } from '../../fallbackModel.js'
import type { ModelRoute } from '../../fallbackModel.js'
import { runTurnWithReliability } from '../../reliability.js'
import { ChatCompletionsLlm } from '../chatCompletionsLlm.js'
import type { ChatCompletionsProvider } from '../chatCompletionsLlm.js'
import { profileFor } from '../profiles.js'
import { ProviderError } from '../providerError.js'

type Brain = 'gemini' | 'anthropic' | 'openai' | 'qwen' | 'deepseek'

const BRAINS: Brain[] = ['gemini', 'anthropic', 'openai', 'qwen', 'deepseek']
const CHAT_COMPLETIONS: Partial<Record<Brain, { provider: ChatCompletionsProvider; model: string }>> = {
  openai: { provider: 'openai', model: 'gpt-6-luna' },
  qwen: { provider: 'modelscope', model: 'Qwen/Qwen3.5-35B-A3B' },
  deepseek: { provider: 'modelscope', model: 'deepseek-ai/DeepSeek-V4.1-Flash' }
}
const PAIRS = BRAINS.flatMap((main) =>
  BRAINS.filter((fallback) => fallback !== main).map((fallback): [Brain, Brain] => [main, fallback])
)
const FAILURE_REPLY = 'in-character failure reply'

/** Gemini and Anthropic have their own adapter suites; here they only answer or fail the way an adapter does. */
class ScriptedLlm extends BaseLlm {
  calls = 0

  constructor(
    private readonly brain: Brain,
    private readonly healthy: boolean
  ) {
    super({ model: `${brain}-model` })
  }

  async *generateContentAsync(): AsyncGenerator<LlmResponse, void> {
    this.calls++
    if (!this.healthy) {
      throw new ProviderError({
        provider: this.brain === 'gemini' ? 'gemini' : 'anthropic',
        kind: 'transient_http',
        message: `${this.brain} 503: overloaded`,
        status: 503
      })
    }
    yield { content: { role: 'model', parts: [{ text: `${this.brain} answer` }] } }
  }

  connect(): Promise<BaseLlmConnection> {
    throw new Error('ScriptedLlm does not support live connections')
  }
}

function side(brain: Brain, healthy: boolean): { llm: BaseLlm; calls: () => number } {
  const target = CHAT_COMPLETIONS[brain]
  if (!target) {
    const scripted = new ScriptedLlm(brain, healthy)
    return { llm: scripted, calls: () => scripted.calls }
  }
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls++
    return healthy
      ? Response.json({
          choices: [{ message: { content: `${brain} answer` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }
        })
      : Response.json({ error: { message: 'busy' } }, { status: 503 })
  }
  const llm = new ChatCompletionsLlm({
    ...target,
    apiKey: 'test-key',
    timeoutMs: 2000,
    profile: profileFor(target.provider, target.model),
    fetchImpl
  })
  return { llm, calls: () => calls }
}

function hello(signal: AbortSignal): LlmRequest {
  return {
    model: 'roka',
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    config: { abortSignal: signal },
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

/** One turn as roka.ts runs it: the ladder retries, and switchModel moves the rest of the turn to the fallback. */
async function runTurn(routed: RoutedLlm) {
  const route: ModelRoute = { useFallback: false, hedged: false, answeredBy: null, pinned: null }
  const result = await modelRouteForRequest.run(route, () =>
    runTurnWithReliability({
      runTurn: async (_attempt, signal) => {
        let text = ''
        for await (const response of routed.generateContentAsync(hello(signal))) {
          text += (response.content?.parts ?? []).map((part) => part.text ?? '').join('')
        }
        return { text, hasText: text.length > 0, hasFunctionCall: false }
      },
      switchModel: () => {
        if (!routed.hasFallback) return undefined
        route.useFallback = true
        return 2000
      },
      tryConsumeRetry: () => true,
      computeBackoff: () => 0,
      sleep: async () => {},
      isShuttingDown: () => false,
      maxRetries: 1,
      retryBackoffCapMs: 12_000,
      genericFallback: FAILURE_REPLY,
      safetyDeflection: 'safety deflection',
      recitationDeflection: 'recitation deflection',
      terminalDeflection: 'terminal deflection'
    })
  )
  return { result, route }
}

describe('routing across every provider', () => {
  it('covers all 20 ordered main and fallback pairs', () => {
    expect(PAIRS).toHaveLength(20)
  })

  describe.each(PAIRS)('main %s with fallback %s', (main, fallback) => {
    it('answers from the main model while it is healthy', async () => {
      const primary = side(main, true)
      const backup = side(fallback, true)

      const { result, route } = await runTurn(new RoutedLlm(primary.llm, backup.llm, 0))

      expect(result).toMatchObject({ success: true, text: `${main} answer`, attempts: 1 })
      expect(route.answeredBy).toBe('main')
      expect(backup.calls()).toBe(0)
    })

    it('moves the turn to the fallback after a main outage', async () => {
      const primary = side(main, false)
      const backup = side(fallback, true)

      const { result, route } = await runTurn(new RoutedLlm(primary.llm, backup.llm, 0))

      expect(result).toMatchObject({ success: true, text: `${fallback} answer`, attempts: 2 })
      expect(route.answeredBy).toBe('fallback')
      expect([primary.calls(), backup.calls()]).toEqual([1, 1])
    })
  })

  describe.each(BRAINS)('main %s with no fallback', (main) => {
    it('answers from the main model', async () => {
      const { result, route } = await runTurn(new RoutedLlm(side(main, true).llm, null, 0))

      expect(result).toMatchObject({ success: true, text: `${main} answer` })
      expect(route.answeredBy).toBe('main')
    })

    it('retries the outage once, then sends the in-character failure reply', async () => {
      const primary = side(main, false)

      const { result } = await runTurn(new RoutedLlm(primary.llm, null, 0))

      expect(result).toMatchObject({ success: false, kind: 'transient_http', text: FAILURE_REPLY, attempts: 2 })
      expect(primary.calls()).toBe(2)
    })
  })
})
