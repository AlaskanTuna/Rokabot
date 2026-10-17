import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { describe, expect, it } from 'vitest'
import { RoutedLlm, modelRouteForRequest } from '../../fallbackModel.js'
import type { ModelRoute } from '../../fallbackModel.js'
import { ErrorRecoveryPlugin, runTurnWithReliability } from '../../reliability.js'
import { ChatCompletionsLlm } from '../chatCompletionsLlm.js'
import type { ChatCompletionsProvider } from '../chatCompletionsLlm.js'
import { COMPATIBLE_DEFAULTS, compatibleProfile, profileFor } from '../profiles.js'
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

/**
 * One turn as roka.ts feeds the ladder: the ladder retries, switchModel moves the rest of the turn to the fallback,
 * and a thrown model error reaches it as the typed outcome the error plugin builds, not as message text.
 */
async function runTurn(routed: RoutedLlm) {
  const route: ModelRoute = { useFallback: false, hedged: false, answeredBy: null, pinned: null }
  const result = await modelRouteForRequest.run(route, () =>
    runTurnWithReliability({
      runTurn: async (_attempt, signal) => {
        let text = ''
        try {
          for await (const response of routed.generateContentAsync(hello(signal))) {
            text += (response.content?.parts ?? []).map((part) => part.text ?? '').join('')
          }
        } catch (error) {
          const failure = await new ErrorRecoveryPlugin('error-recovery').onModelErrorCallback({
            callbackContext: {},
            llmRequest: {},
            error: error as Error
          })
          return {
            errorCode: failure?.errorCode,
            errorMessage: failure?.errorMessage,
            customMetadata: failure?.customMetadata,
            hasText: false,
            hasFunctionCall: false
          }
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
      const primary = side(main, true)

      const { result, route } = await runTurn(new RoutedLlm(primary.llm, null, 0))

      expect(result).toMatchObject({ success: true, text: `${main} answer`, attempts: 1 })
      expect(route.answeredBy).toBe('main')
      expect(primary.calls()).toBe(1)
    })

    it('retries the outage once, then sends the in-character failure reply', async () => {
      const primary = side(main, false)

      const { result } = await runTurn(new RoutedLlm(primary.llm, null, 0))

      expect(result).toMatchObject({ success: false, kind: 'transient_http', text: FAILURE_REPLY, attempts: 2 })
      expect(primary.calls()).toBe(2)
    })
  })
})

describe('routing across two openai-compatible endpoints', () => {
  function endpoint(key: string, baseUrl: string, reply: 'answer' | 'overloaded' | 'slow') {
    const posted: unknown[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      posted.push(input)
      if (reply === 'slow') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
      }
      return reply === 'overloaded'
        ? Response.json({ error: { message: 'busy' } }, { status: 503 })
        : Response.json({ choices: [{ message: { content: `${key} answer` }, finish_reason: 'stop' }] })
    }
    const llm = new ChatCompletionsLlm({
      provider: 'openai-compatible',
      model: `${key}-model`,
      apiKey: '',
      baseUrl,
      label: key,
      timeoutMs: 2000,
      profile: compatibleProfile(`${key}-model`, COMPATIBLE_DEFAULTS),
      fetchImpl
    })
    return { llm, posted }
  }

  it('moves the turn to the fallback endpoint after a 503 from the main one', async () => {
    const main = endpoint('router', 'https://router.example/v1', 'overloaded')
    const fallback = endpoint('local', 'http://localhost:11434/v1', 'answer')

    const { result, route } = await runTurn(new RoutedLlm(main.llm, fallback.llm, 0))

    expect(result).toMatchObject({ success: true, text: 'local answer', attempts: 2 })
    expect(route.answeredBy).toBe('fallback')
    expect(main.posted).toEqual(['https://router.example/v1/chat/completions'])
    expect(fallback.posted).toEqual(['http://localhost:11434/v1/chat/completions'])
  })

  it('answers from the hedged fallback endpoint while the main one is still running', async () => {
    const main = endpoint('router', 'https://router.example/v1', 'slow')
    const fallback = endpoint('local', 'http://localhost:11434/v1', 'answer')

    const { result, route } = await runTurn(new RoutedLlm(main.llm, fallback.llm, 10))

    expect(result).toMatchObject({ success: true, text: 'local answer', attempts: 1 })
    expect(route).toMatchObject({ answeredBy: 'fallback', hedged: true, pinned: null })
  })
})
