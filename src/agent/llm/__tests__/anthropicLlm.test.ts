import type Anthropic from '@anthropic-ai/sdk'
import type { LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Content } from '@google/genai'
import { afterEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ options: [] as unknown[] }))

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class FakeAnthropic {
    messages = {
      create: async () => {
        throw new Error('unit tests inject a client')
      }
    }

    constructor(options: unknown) {
      sdk.options.push(options)
    }
  }
  return { ...actual, default: FakeAnthropic }
})

const budget = vi.hoisted(() => ({
  denied: undefined as 'rpm' | 'rpd' | 'tpm' | 'monthly' | undefined,
  release: vi.fn(),
  startCall: vi.fn(),
  markBillingExhausted: vi.fn()
}))

vi.mock('../budget.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../budget.js')>()
  budget.startCall.mockImplementation(async (input: Parameters<typeof actual.startCall>[0]) =>
    budget.denied ? actual.grantOrThrow(input.provider, { denied: budget.denied }) : { release: budget.release }
  )
  return { ...actual, startCall: budget.startCall, markBillingExhausted: budget.markBillingExhausted }
})

import { APIConnectionTimeoutError, APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import type { ResolvedModel } from '../../../config.js'
import { assembleSystemPrompt } from '../../promptAssembler.js'
import { CORE_PROMPT } from '../../prompts/core.js'
import { SPEECH_PROMPT } from '../../prompts/speech.js'
import { AnthropicLlm, STRUCTURED_OUTPUT_TOOL } from '../anthropicLlm.js'
import { profileFor } from '../profiles.js'
import { ProviderError } from '../providerError.js'
import { type CallUsage, WORKLOAD_LABEL, onUsage } from '../usage.js'
import { fixtures } from './anthropicFixtures.js'

type CreateOptions = { signal?: AbortSignal; timeout?: number }

const HAIKU: ResolvedModel = {
  key: 'haiku',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  profile: profileFor('anthropic', 'claude-haiku-5-5')!,
  apiKey: 'test-anthropic-key',
  timeoutMs: 20_000,
  maxOutputTokens: 500,
  effort: 'low'
}
const hi: Content = { role: 'user', parts: [{ text: '[Mio]: hi' }] }

function fakeClient() {
  const create =
    vi.fn<(body: Anthropic.MessageCreateParamsNonStreaming, options?: CreateOptions) => Promise<Anthropic.Message>>()
  return { client: { messages: { create } }, create }
}

function request(contents: Content[], config: Record<string, unknown> = {}): LlmRequest {
  return {
    model: 'claude-haiku-5-5',
    contents,
    config: { maxOutputTokens: 500, ...config },
    toolsDict: {},
    liveConnectConfig: {}
  } as unknown as LlmRequest
}

async function run(llm: AnthropicLlm, llmRequest: LlmRequest): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of llm.generateContentAsync(llmRequest)) result.push(response)
  return result
}

async function sent(contents: Content[], config: Record<string, unknown> = {}, resolved: ResolvedModel = HAIKU) {
  const { client, create } = fakeClient()
  create.mockResolvedValueOnce(fixtures.text)
  await run(new AnthropicLlm({ resolved, client }), request(contents, config))
  const call = create.mock.calls[0]
  if (!call) throw new Error('no request was sent')
  return { body: call[0], options: call[1] }
}

describe('AnthropicLlm requests', () => {
  it('builds the SDK client with retries off and the resolved key, base URL and timeout', () => {
    expect(new AnthropicLlm({ resolved: { ...HAIKU, baseUrl: 'https://anthropic.test' } })).toBeInstanceOf(AnthropicLlm)
    expect(sdk.options.at(-1)).toEqual({
      apiKey: 'test-anthropic-key',
      baseURL: 'https://anthropic.test',
      maxRetries: 0,
      timeout: 20_000
    })
  })

  it('caches the core and speech layers as one system block and sends the per-turn layers after it', async () => {
    const prompt = `${assembleSystemPrompt({ tone: 'playful', hour: 14, displayName: 'Mio', memory: true })}\n\n## Memory\n- Mio likes tea`
    const stable = `${CORE_PROMPT}\n\n${SPEECH_PROMPT}`

    const { body } = await sent([hi], { systemInstruction: prompt })

    expect(body.system).toEqual([
      { type: 'text', text: stable, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: prompt.slice(stable.length) }
    ])
  })

  it('sends a system prompt it does not recognise as one uncached block', async () => {
    const { body } = await sent([hi], { systemInstruction: { parts: [{ text: 'You extract facts.' }] } })

    expect(body.system).toEqual([{ type: 'text', text: 'You extract facts.' }])
  })

  it('never sends sampling parameters or safety settings and leaves thinking headroom at low effort', async () => {
    const { body, options } = await sent([hi], {
      temperature: 0.9,
      topP: 0.95,
      safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' }]
    })

    expect(body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 2548,
      messages: [{ role: 'user', content: [{ type: 'text', text: '[Mio]: hi' }] }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' }
    })
    expect(options).toEqual({ signal: undefined, timeout: 20_000 })
  })

  it('turns thinking off for effort none and adds no headroom', async () => {
    const { body } = await sent([hi], {}, { ...HAIKU, effort: 'none' })

    expect(body).toMatchObject({ max_tokens: 500, thinking: { type: 'disabled' } })
    expect(body).not.toHaveProperty('output_config')
  })

  it('passes the request abort signal to the SDK', async () => {
    const controller = new AbortController()

    const { options } = await sent([hi], { abortSignal: controller.signal })

    expect(options?.signal).toBe(controller.signal)
  })

  it('declares tools with JSON Schema inputs, converting Gemini schemas', async () => {
    const { body } = await sent([hi], {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'roll_dice',
              description: 'Roll a die',
              parameters: {
                type: 'OBJECT',
                properties: { sides: { type: 'INTEGER' } },
                required: ['sides'],
                propertyOrdering: ['sides']
              }
            },
            {
              name: 'recall_user',
              parametersJsonSchema: { type: 'object', properties: { query: { type: 'string' } } }
            },
            { name: 'flip_coin' }
          ]
        }
      ]
    })

    expect(body.tools).toEqual([
      {
        name: 'roll_dice',
        description: 'Roll a die',
        input_schema: { type: 'object', properties: { sides: { type: 'integer' } }, required: ['sides'] }
      },
      { name: 'recall_user', input_schema: { type: 'object', properties: { query: { type: 'string' } } } },
      { name: 'flip_coin', input_schema: { type: 'object', properties: {} } }
    ])
    expect(body).not.toHaveProperty('tool_choice')
  })

  it('keeps tool_use and tool_result paired by provider id across parallel calls', async () => {
    const { body } = await sent([
      hi,
      {
        role: 'model',
        parts: [
          { text: 'Rolling both~' },
          { functionCall: { id: 'toolu_a', name: 'roll_dice', args: { sides: 6 } } },
          { functionCall: { id: 'toolu_b', name: 'roll_dice', args: { sides: 20 } } }
        ]
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { id: 'toolu_b', name: 'roll_dice', response: { value: 17 } } },
          { functionResponse: { id: 'toolu_a', name: 'roll_dice', response: { value: 4 } } }
        ]
      }
    ])

    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[Mio]: hi' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Rolling both~' },
          { type: 'tool_use', id: 'toolu_a', name: 'roll_dice', input: { sides: 6 } },
          { type: 'tool_use', id: 'toolu_b', name: 'roll_dice', input: { sides: 20 } }
        ]
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_b', content: '{"value":17}' },
          { type: 'tool_result', tool_use_id: 'toolu_a', content: '{"value":4}' }
        ]
      }
    ])
  })

  it('pairs id-less calls from older history in order and turns an unmatched result into text', async () => {
    const { body } = await sent([
      hi,
      { role: 'model', parts: [{ functionCall: { name: 'roll_dice', args: { sides: 6 } } }] },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'roll_dice', response: { value: 3 } } },
          { functionResponse: { name: 'web_search', response: { results: [] } } }
        ]
      }
    ])

    expect(body.messages.slice(1)).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_rk1_0', name: 'roll_dice', input: { sides: 6 } }] },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_rk1_0', content: '{"value":3}' },
          { type: 'text', text: '(result of web_search: {"results":[]})' }
        ]
      }
    ])
  })

  it('drops leading assistant turns and tool calls that never got a result', async () => {
    const { body } = await sent([
      { role: 'model', parts: [{ text: 'An earlier reply' }] },
      hi,
      { role: 'model', parts: [{ functionCall: { id: 'toolu_lost', name: 'roll_dice', args: {} } }] },
      { role: 'user', parts: [{ text: '[Mio]: never mind' }] }
    ])

    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '[Mio]: hi' },
          { type: 'text', text: '[Mio]: never mind' }
        ]
      }
    ])
  })

  it('sends images and PDFs as content blocks and other media as a text marker', async () => {
    const { body } = await sent([
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: 'cG5n' } },
          { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
          { inlineData: { mimeType: 'audio/ogg', data: 'b2dn' } },
          { fileData: { mimeType: 'video/mp4', fileUri: 'files/abc' } },
          { text: '[Mio]: what are these?' }
        ]
      }
    ])

    expect(body.messages[0]?.content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'cG5n' } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'cGRm' } },
      { type: 'text', text: "(a audio attachment that can't be opened right now)" },
      { type: 'text', text: "(a video attachment that can't be opened right now)" },
      { type: 'text', text: '[Mio]: what are these?' }
    ])
  })

  it('skips thought parts and ends on a user turn when the history ends on the model', async () => {
    const { body } = await sent([
      hi,
      { role: 'model', parts: [{ text: 'secret plan', thought: true }, { text: 'Hello~' }] }
    ])

    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[Mio]: hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hello~' }] },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Continue processing previous requests as instructed. Exit or provide a summary if no more outputs are needed.'
          }
        ]
      }
    ])
  })

  it('forces one strict output tool for a structured request', async () => {
    const schema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false
    }

    const { body } = await sent([hi], { responseJsonSchema: schema })

    expect(body.tools).toEqual([
      {
        name: STRUCTURED_OUTPUT_TOOL,
        description: 'Return the requested JSON object as the input of this tool.',
        input_schema: schema,
        strict: true
      }
    ])
    expect(body.tool_choice).toEqual({ type: 'tool', name: STRUCTURED_OUTPUT_TOOL })
  })

  it('answers with the text of a recorded end_turn message and keeps thinking out of the parts', async () => {
    const { client, create } = fakeClient()
    create.mockResolvedValueOnce(fixtures.text)

    const [response] = await run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi]))

    expect(response?.content).toEqual({ role: 'model', parts: [{ text: 'Ehehe, good morning to you too~' }] })
    expect(response?.finishReason).toBe(FinishReason.STOP)
  })
})

afterEach(() => {
  budget.denied = undefined
  budget.release.mockClear()
  budget.startCall.mockClear()
  budget.markBillingExhausted.mockClear()
})

async function answer(message: Anthropic.Message, config: Record<string, unknown> = {}) {
  const { client, create } = fakeClient()
  create.mockResolvedValueOnce(message)
  return run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi], config))
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (caught: unknown) => caught
  )
}

describe('AnthropicLlm responses', () => {
  it('returns tool calls with their provider ids and the tag Gemini needs to read them later', async () => {
    const [response] = await answer(fixtures.toolUse)

    expect(response?.content?.parts).toEqual([
      { text: 'Let me check what I remember.' },
      {
        functionCall: { id: 'toolu_01Fixture', name: 'recall_user', args: { query: 'favourite tea' } },
        thoughtSignature: 'skip_thought_signature_validator'
      }
    ])
    expect(response?.content?.parts?.some((part) => part.thought)).toBe(false)
  })

  it('returns parallel tool calls in the order Claude made them', async () => {
    const [response] = await answer(fixtures.parallelToolUse)

    expect(response?.content?.parts?.map((part) => part.functionCall?.id)).toEqual(['toolu_a', 'toolu_b'])
  })

  it('maps a max_tokens stop to MAX_TOKENS and keeps the partial text', async () => {
    const [response] = await answer(fixtures.maxTokens)

    expect(response?.finishReason).toBe(FinishReason.MAX_TOKENS)
    expect(response?.content?.parts).toEqual([{ text: 'I was about to say' }])
  })

  it('returns the empty-text shape when thinking used every token', async () => {
    const [response] = await answer(fixtures.thinkingOnly)

    expect(response?.content?.parts).toEqual([{ text: '' }])
    expect(response?.finishReason).toBe(FinishReason.MAX_TOKENS)
  })

  it('returns the forced tool input as the JSON text of the first part for a structured request', async () => {
    const [response] = await answer(fixtures.structured, { responseJsonSchema: { type: 'object' } })

    expect(response?.content?.parts).toEqual([{ text: '{"ok":true,"facts":[]}' }])
  })

  it('throws a refusal ProviderError and still records the billed call', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    const failure = await failureOf(answer(fixtures.refusal))
    stop()

    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure).toMatchObject({ provider: 'anthropic', kind: 'refusal' })
    expect(seen).toHaveLength(1)
  })

  it('throws malformed_tool_args when tool input is not an object, so nothing runs', async () => {
    const failure = await failureOf(answer(fixtures.malformedToolUse))

    expect(failure).toMatchObject({ name: 'ProviderError', kind: 'malformed_tool_args' })
  })

  it('records usage once per call and reports it on the response', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    const [response] = await answer(fixtures.text)
    stop()

    expect(seen).toEqual([
      {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        workload: 'reply',
        inputTokens: 412,
        outputTokens: 96,
        cacheReadTokens: 3880
      }
    ])
    expect(budget.release).toHaveBeenCalledTimes(1)
    expect(budget.release).toHaveBeenCalledWith(seen[0])
    expect(response?.usageMetadata).toEqual({
      promptTokenCount: 4292,
      candidatesTokenCount: 96,
      totalTokenCount: 4388,
      cachedContentTokenCount: 3880,
      thoughtsTokenCount: 64
    })
  })

  it('keeps uncached input, cache reads, cache writes and output in disjoint buckets', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    await answer({
      ...fixtures.text,
      usage: {
        ...fixtures.text.usage,
        input_tokens: 120,
        output_tokens: 150,
        cache_read_input_tokens: 3000,
        cache_creation_input_tokens: 900,
        output_tokens_details: { thinking_tokens: 100 }
      }
    })
    stop()

    expect(seen).toEqual([
      {
        provider: 'anthropic',
        model: 'claude-haiku-5-5',
        workload: 'reply',
        inputTokens: 120,
        outputTokens: 150,
        cacheReadTokens: 3000,
        cacheWriteTokens: 900
      }
    ])
    expect(seen[0]).not.toHaveProperty('reasoningTokens')
  })

  it('attributes a labelled background workload', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    await answer(fixtures.structured, {
      responseJsonSchema: { type: 'object' },
      labels: { [WORKLOAD_LABEL]: 'extraction' }
    })
    stop()

    expect(seen[0]?.workload).toBe('extraction')
  })

  it('gives the budget the same abort signal it gives the SDK', async () => {
    const controller = new AbortController()

    const { options } = await sent([hi], { abortSignal: controller.signal })

    expect(budget.startCall).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      workload: 'reply',
      estTokens: expect.any(Number),
      signal: controller.signal
    })
    expect(options?.signal).toBe(controller.signal)
  })

  it('asks the budget before calling, and makes no call when it is denied', async () => {
    budget.denied = 'monthly'
    const { client, create } = fakeClient()

    const failure = await failureOf(run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi])))

    expect(failure).toMatchObject({ name: 'ProviderError', kind: 'billing_exhausted' })
    expect(create).not.toHaveBeenCalled()
    expect(budget.markBillingExhausted).not.toHaveBeenCalled()
  })

  it('releases the reservation with no usage when the SDK rejects', async () => {
    const { client, create } = fakeClient()
    create.mockRejectedValueOnce(new APIConnectionTimeoutError())

    await failureOf(run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi])))

    expect(budget.release).toHaveBeenCalledTimes(1)
    expect(budget.release).toHaveBeenCalledWith()
  })
})

describe('Anthropic error classification', () => {
  const body = (type: string, message: string) => ({ type: 'error', error: { type, message } })

  it.each([
    [
      '529 overloaded',
      APIError.generate(529, body('overloaded_error', 'Overloaded'), undefined, new Headers()),
      { kind: 'transient_http', status: 529 }
    ],
    [
      '500 api error',
      APIError.generate(500, body('api_error', 'Internal server error'), undefined, new Headers()),
      { kind: 'transient_http', status: 500 }
    ],
    [
      '429 rate limit',
      APIError.generate(429, body('rate_limit_error', 'Rate limited'), undefined, new Headers({ 'retry-after': '7' })),
      { kind: 'transient_http', status: 429, retryAfterMs: 7000 }
    ],
    [
      '402 billing',
      APIError.generate(402, body('billing_error', 'Out of credit'), undefined, new Headers()),
      { kind: 'billing_exhausted', status: 402 }
    ],
    [
      '400 low credit balance',
      APIError.generate(
        400,
        body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
        undefined,
        new Headers()
      ),
      { kind: 'billing_exhausted', status: 400 }
    ],
    [
      '400 prompt too long',
      APIError.generate(
        400,
        body('invalid_request_error', 'prompt is too long: 1048577 tokens > 1000000 maximum'),
        undefined,
        new Headers()
      ),
      { kind: 'context_length', status: 400 }
    ],
    [
      '413 request too large',
      APIError.generate(413, body('request_too_large', 'Request too large'), undefined, new Headers()),
      { kind: 'context_length', status: 413 }
    ],
    [
      '401 authentication',
      APIError.generate(401, body('authentication_error', 'invalid x-api-key'), undefined, new Headers()),
      { kind: 'terminal', status: 401 }
    ],
    [
      '400 invalid request',
      APIError.generate(400, body('invalid_request_error', 'messages: roles must alternate'), undefined, new Headers()),
      { kind: 'terminal', status: 400 }
    ],
    ['a connection timeout', new APIConnectionTimeoutError(), { kind: 'network' }],
    ['an aborted request', new APIUserAbortError(), { kind: 'network' }]
  ])('classifies %s', async (_name, error, expected) => {
    const { client, create } = fakeClient()
    create.mockRejectedValueOnce(error)

    const failure = await failureOf(run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi])))

    expect(failure).toBeInstanceOf(ProviderError)
    expect(failure).toMatchObject({ provider: 'anthropic', ...expected })
  })

  it.each([
    [
      '402 billing',
      APIError.generate(402, body('billing_error', 'Out of credit'), undefined, new Headers()),
      [['anthropic']]
    ],
    [
      '400 low credit balance',
      APIError.generate(
        400,
        body('invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'),
        undefined,
        new Headers()
      ),
      [['anthropic']]
    ],
    ['529 overloaded', APIError.generate(529, body('overloaded_error', 'Overloaded'), undefined, new Headers()), []]
  ])('marks Anthropic billing as exhausted only for its own billing errors: %s', async (_name, error, calls) => {
    const { client, create } = fakeClient()
    create.mockRejectedValueOnce(error)

    await failureOf(run(new AnthropicLlm({ resolved: HAIKU, client }), request([hi])))

    expect(budget.markBillingExhausted.mock.calls).toEqual(calls)
  })
})
