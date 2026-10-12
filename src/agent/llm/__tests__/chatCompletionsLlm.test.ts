import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelScopeLlm as ReexportedModelScopeLlm } from '../../fallbackModel.js'
import { type BudgetDenial, grantOrThrow } from '../budget.js'
import { ChatCompletionsLlm, ModelScopeLlm } from '../chatCompletionsLlm.js'
import { MODEL_PROFILES, type ProviderId, profileFor } from '../profiles.js'
import { ProviderError } from '../providerError.js'
import { type CallUsage, WORKLOAD_LABEL, onUsage } from '../usage.js'

const budget = vi.hoisted(() => ({ release: vi.fn(), startCall: vi.fn(), markBillingExhausted: vi.fn() }))

vi.mock('../budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../budget.js')>()),
  startCall: budget.startCall,
  markBillingExhausted: budget.markBillingExhausted
}))

beforeEach(() => {
  budget.release.mockReset()
  budget.startCall.mockReset()
  budget.markBillingExhausted.mockReset()
  budget.startCall.mockResolvedValue({ release: budget.release })
})

interface Fixture {
  status: number
  headers?: Record<string, string>
  body: unknown
}

type RequestCall = { input: unknown; init?: RequestInit }

function loadFixtures(name: string): Record<string, Fixture> {
  return JSON.parse(readFileSync(resolve('tests/fixtures/chatCompletions', `${name}.json`), 'utf8')) as Record<
    string,
    Fixture
  >
}

const openai = loadFixtures('openai')
const modelscope = loadFixtures('modelscope')

function replay(fixture: Fixture | undefined) {
  if (!fixture) throw new Error('Unknown fixture')
  const calls: RequestCall[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init })
    return new Response(JSON.stringify(fixture.body), { status: fixture.status, headers: fixture.headers })
  }
  return { fetchImpl, calls }
}

function request(contents: unknown[], config: Record<string, unknown> = {}): LlmRequest {
  return { model: 'roka', contents, config, toolsDict: {}, liveConnectConfig: undefined } as unknown as LlmRequest
}

const hello = () => request([{ role: 'user', parts: [{ text: 'hello' }] }])

async function responses(model: BaseLlm, llmRequest: LlmRequest): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of model.generateContentAsync(llmRequest)) result.push(response)
  return result
}

function bodyOf(call: RequestCall | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>
}

function luna(fetchImpl: typeof fetch): ChatCompletionsLlm {
  return new ChatCompletionsLlm({
    provider: 'openai',
    model: 'gpt-6-luna',
    apiKey: 'openai-key',
    timeoutMs: 2000,
    profile: profileFor('openai', 'gpt-6-luna'),
    fetchImpl
  })
}

function onModelScope(model: string, fetchImpl: typeof fetch): ChatCompletionsLlm {
  return new ChatCompletionsLlm({
    provider: 'modelscope',
    model,
    apiKey: 'modelscope-key',
    timeoutMs: 2000,
    profile: profileFor('modelscope', model),
    fetchImpl
  })
}

describe('Chat Completions profiles', () => {
  it('describes gpt-6-luna: tools only at effort none, strict JSON schema, image input', () => {
    expect(profileFor('openai', 'gpt-6-luna')).toMatchObject({
      provider: 'openai',
      input: { image: true, pdf: false, audio: false, video: false },
      tools: { supported: true, parallel: true },
      thinking: { efforts: ['none'], defaultEffort: 'none', replayWithinTurn: false },
      sampling: { temperature: true, topP: true },
      structuredOutput: 'json_schema_strict',
      promptCaching: 'implicit',
      tokenCounter: 'estimate',
      price: { input: 0.1, output: 0.5, cachedInput: 0.01 },
      verified: true
    })
  })

  it.each(['Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash'])(
    'describes %s as a verified json_object model with thinking off',
    (model) => {
      expect(profileFor('modelscope', model)).toMatchObject({
        provider: 'modelscope',
        tools: { supported: true, parallel: true },
        thinking: { efforts: [], replayWithinTurn: false },
        structuredOutput: 'json_object',
        promptCaching: 'none',
        tokenCounter: 'estimate',
        price: { input: 0, output: 0 },
        verified: true
      })
    }
  )

  it('reads images on Qwen but not yet on DeepSeek', () => {
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B')?.input.image).toBe(true)
    expect(profileFor('modelscope', 'deepseek-ai/DeepSeek-V4.1-Flash')?.input.image).toBe(false)
  })

  it('leaves the legacy ModelScope fallback profile as it was and lists each new model once', () => {
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')).toMatchObject({
      input: { image: true },
      structuredOutput: 'json_object',
      verified: true
    })
    expect(profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B')?.thinking.defaultEffort).toBeUndefined()
    for (const model of ['gpt-6-luna', 'Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash']) {
      expect(MODEL_PROFILES.filter((profile) => profile.model === model)).toHaveLength(1)
    }
  })
})

describe('ModelScopeLlm', () => {
  it('is a modelscope ChatCompletionsLlm, still exported from fallbackModel', () => {
    const legacy = new ReexportedModelScopeLlm({
      model: 'Qwen/test-model',
      apiKey: 'test-key',
      baseUrl: 'https://modelscope.test/v1',
      timeoutMs: 1000
    })

    expect(ReexportedModelScopeLlm).toBe(ModelScopeLlm)
    expect(legacy).toBeInstanceOf(ChatCompletionsLlm)
    expect(legacy.provider).toBe('modelscope')
    expect(() => legacy.connect({} as LlmRequest)).toThrow('ModelScopeLlm does not support live connections')
  })
})

describe('ChatCompletionsLlm requests', () => {
  it('sends gpt-6-luna to OpenAI with reasoning_effort none and max_completion_tokens, never enable_thinking', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'hi' }] }], {
        systemInstruction: 'Be Roka.',
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: 300
      })
    )

    expect(calls[0]?.input).toBe('https://api.openai.com/v1/chat/completions')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer openai-key')
    expect(bodyOf(calls[0])).toEqual({
      model: 'gpt-6-luna',
      messages: [
        { role: 'system', content: 'Be Roka.' },
        { role: 'user', content: 'hi' }
      ],
      reasoning_effort: 'none',
      temperature: 0.9,
      top_p: 0.95,
      max_completion_tokens: 300,
      stream: false
    })
  })

  it.each(['Qwen/Qwen3.5-35B-A3B', 'deepseek-ai/DeepSeek-V4.1-Flash'])(
    'sends %s to ModelScope with thinking off and max_tokens',
    async (model) => {
      const { fetchImpl, calls } = replay(modelscope.qwenText)

      await responses(
        onModelScope(model, fetchImpl),
        request([{ role: 'user', parts: [{ text: 'hi' }] }], { maxOutputTokens: 300 })
      )

      expect(calls[0]?.input).toBe('https://api-inference.modelscope.ai/v1/chat/completions')
      expect(bodyOf(calls[0])).toEqual({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        enable_thinking: false,
        max_tokens: 300,
        stream: false
      })
    }
  )

  it('sends image bytes only to a profile that reads images', async () => {
    const contents = [
      { role: 'user', parts: [{ text: 'look' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }
    ]
    const qwen = replay(modelscope.qwenText)
    const deepseek = replay(modelscope.qwenText)

    await responses(onModelScope('Qwen/Qwen3.5-35B-A3B', qwen.fetchImpl), request(contents))
    await responses(onModelScope('deepseek-ai/DeepSeek-V4.1-Flash', deepseek.fetchImpl), request(contents))

    expect(bodyOf(qwen.calls[0]).messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
        ]
      }
    ])
    expect(bodyOf(deepseek.calls[0]).messages).toEqual([
      { role: 'user', content: "look\n(a file attachment that can't be opened right now)" }
    ])
  })

  it('reads an OpenAI reply into one model response with usage metadata', async () => {
    const result = await responses(luna(replay(openai.text).fetchImpl), hello())

    expect(result).toEqual([
      {
        content: { role: 'model', parts: [{ text: 'Hello there~' }] },
        finishReason: FinishReason.STOP,
        usageMetadata: {
          promptTokenCount: 120,
          cachedContentTokenCount: 64,
          candidatesTokenCount: 9,
          totalTokenCount: 129
        }
      }
    ])
  })

  it("reports reasoning tokens in Gemini's thoughts bucket, out of the candidates", async () => {
    const reply = {
      status: 200,
      body: {
        choices: [{ message: { content: 'hm' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
          completion_tokens_details: { reasoning_tokens: 12 }
        }
      }
    }

    const [response] = await responses(luna(replay(reply).fetchImpl), hello())

    expect(response?.usageMetadata).toEqual({
      promptTokenCount: 50,
      candidatesTokenCount: 18,
      thoughtsTokenCount: 12,
      totalTokenCount: 80
    })
  })
})

describe('ChatCompletionsLlm request shaping', () => {
  it('clamps a request cap above the configured output cap, per provider field', async () => {
    const openaiReply = replay(openai.text)
    const modelscopeReply = replay(modelscope.qwenText)
    const capped = request([{ role: 'user', parts: [{ text: 'hi' }] }], { maxOutputTokens: 300 })

    await responses(
      new ChatCompletionsLlm({
        provider: 'openai',
        model: 'gpt-6-luna',
        apiKey: 'openai-key',
        timeoutMs: 2000,
        profile: profileFor('openai', 'gpt-6-luna'),
        maxOutputTokens: 100,
        fetchImpl: openaiReply.fetchImpl
      }),
      capped
    )
    await responses(
      new ChatCompletionsLlm({
        provider: 'modelscope',
        model: 'Qwen/Qwen3.5-35B-A3B',
        apiKey: 'modelscope-key',
        timeoutMs: 2000,
        profile: profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B'),
        maxOutputTokens: 100,
        fetchImpl: modelscopeReply.fetchImpl
      }),
      capped
    )

    expect(bodyOf(openaiReply.calls[0]).max_completion_tokens).toBe(100)
    expect(bodyOf(modelscopeReply.calls[0]).max_tokens).toBe(100)
  })

  it('sends the configured output cap when the request sets none', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenText)

    await responses(
      new ChatCompletionsLlm({
        provider: 'modelscope',
        model: 'Qwen/Qwen3.5-35B-A3B',
        apiKey: 'modelscope-key',
        timeoutMs: 2000,
        profile: profileFor('modelscope', 'Qwen/Qwen3.5-35B-A3B'),
        maxOutputTokens: 250,
        fetchImpl
      }),
      hello()
    )

    expect(bodyOf(calls[0]).max_tokens).toBe(250)
  })

  it('uses the abort signal ADK passes as the third argument', async () => {
    const { fetchImpl, calls } = replay(openai.text)
    const controller = new AbortController()
    controller.abort()

    await luna(fetchImpl).generateContentAsync(hello(), false, controller.signal).next()

    expect(calls[0]?.init?.signal?.aborted).toBe(true)
  })
})

describe('ModelScopeLlm legacy translation', () => {
  const legacyRequest = () =>
    request([{ role: 'user', parts: [{ text: 'look' }, { inlineData: { mimeType: 'image/png', data: 'AA==' } }] }], {
      systemInstruction: 'Be Roka.',
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 300,
      tools: [
        {
          functionDeclarations: [
            { name: 'roll_dice', description: 'Roll a die', parametersJsonSchema: { type: 'object' } }
          ]
        }
      ]
    })

  it("posts today's body, byte for byte, with the legacy profile", async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenText)

    await responses(
      new ModelScopeLlm({
        model: 'Qwen/Qwen3.5-122B-A10B',
        apiKey: 'modelscope-key',
        baseUrl: 'https://api-inference.modelscope.ai/v1',
        timeoutMs: 2000,
        profile: profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B'),
        maxOutputTokens: 300,
        fetchImpl
      }),
      legacyRequest()
    )

    expect(calls[0]?.input).toBe('https://api-inference.modelscope.ai/v1/chat/completions')
    expect(calls[0]?.init?.body).toBe(
      JSON.stringify({
        model: 'Qwen/Qwen3.5-122B-A10B',
        messages: [
          { role: 'system', content: 'Be Roka.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'look' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
            ]
          }
        ],
        enable_thinking: false,
        stream: false,
        temperature: 0.9,
        top_p: 0.95,
        max_tokens: 300,
        tools: [
          {
            type: 'function',
            function: { name: 'roll_dice', description: 'Roll a die', parameters: { type: 'object' } }
          }
        ]
      })
    )
  })

  it('still sends image bytes under a profile that does not read images', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenText)

    await responses(
      new ModelScopeLlm({
        model: 'deepseek-ai/DeepSeek-V4.1-Flash',
        apiKey: 'modelscope-key',
        timeoutMs: 2000,
        profile: profileFor('modelscope', 'deepseek-ai/DeepSeek-V4.1-Flash'),
        fetchImpl
      }),
      legacyRequest()
    )

    expect(bodyOf(calls[0]).messages).toContainEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'look' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
      ]
    })
  })
})

describe('ChatCompletionsLlm tool calls', () => {
  it('pairs tool results with their calls by id, whatever order the results arrive in', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([
        { role: 'user', parts: [{ text: 'roll twice' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'call_first', name: 'roll_dice', args: { sides: 6 } } },
            { functionCall: { id: 'call_second', name: 'roll_dice', args: { sides: 20 } } }
          ]
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { id: 'call_second', name: 'roll_dice', response: { result: 17 } } },
            { functionResponse: { id: 'call_first', name: 'roll_dice', response: { result: 4 } } }
          ]
        }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'user', content: 'roll twice' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_first', type: 'function', function: { name: 'roll_dice', arguments: '{"sides":6}' } },
          { id: 'call_second', type: 'function', function: { name: 'roll_dice', arguments: '{"sides":20}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_first', content: '{"result":4}' },
      { role: 'tool', tool_call_id: 'call_second', content: '{"result":17}' }
    ])
  })

  it('leaves out a tool call that never got a result', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([
        {
          role: 'model',
          parts: [{ text: 'Let me check.' }, { functionCall: { id: 'call_lost', name: 'get_current_time', args: {} } }]
        },
        { role: 'model', parts: [{ functionCall: { id: 'call_gone', name: 'flip_coin', args: {} } }] },
        { role: 'user', parts: [{ text: 'well?' }] }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'assistant', content: 'Let me check.' },
      { role: 'user', content: 'well?' }
    ])
  })

  it('returns each provider call id on its function call', async () => {
    const [response] = await responses(luna(replay(openai.parallelToolCalls).fetchImpl), hello())

    expect(response?.content?.parts).toEqual([
      {
        functionCall: { id: 'call_fixture_a', name: 'roll_dice', args: { sides: 6 } },
        thoughtSignature: 'skip_thought_signature_validator'
      },
      {
        functionCall: { id: 'call_fixture_b', name: 'flip_coin', args: {} },
        thoughtSignature: 'skip_thought_signature_validator'
      }
    ])
  })

  it('leaves the call id unset when the provider sends none, so ADK assigns its own', async () => {
    const reply = {
      status: 200,
      body: {
        choices: [
          {
            message: { tool_calls: [{ function: { name: 'flip_coin', arguments: '{}' } }] },
            finish_reason: 'tool_calls'
          }
        ]
      }
    }

    const [response] = await responses(luna(replay(reply).fetchImpl), hello())

    expect(response?.content?.parts?.[0]?.functionCall).toEqual({ name: 'flip_coin', args: {} })
    expect(response?.content?.parts?.[0]?.functionCall).not.toHaveProperty('id')
  })

  it('pairs an id-less result with an id-less call in the preceding model turn only', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([
        { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { index: 1 } } }] },
        { role: 'user', parts: [{ text: 'never mind' }] },
        { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { index: 2 } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { result: 'second' } } }] }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'user', content: 'never mind' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'lookup', arguments: '{"index":2}' } }]
      },
      { role: 'tool', tool_call_id: 'call_2', content: '{"result":"second"}' }
    ])
  })

  it('turns a result whose id matches no call into user text', async () => {
    const { fetchImpl, calls } = replay(openai.text)

    await responses(
      luna(fetchImpl),
      request([
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'call_a', name: 'roll_dice', args: { sides: 6 } } },
            { functionCall: { id: 'call_b', name: 'roll_dice', args: { sides: 20 } } }
          ]
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { id: 'call_a', name: 'roll_dice', response: { result: 4 } } },
            { functionResponse: { id: 'call_stray', name: 'roll_dice', response: { result: 17 } } }
          ]
        }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_a', type: 'function', function: { name: 'roll_dice', arguments: '{"sides":6}' } }]
      },
      { role: 'tool', tool_call_id: 'call_a', content: '{"result":4}' },
      { role: 'user', content: '(result of roll_dice: {"result":17})' }
    ])
  })
})

describe('ModelScopeLlm legacy tool calls', () => {
  const legacy = (fetchImpl: typeof fetch) =>
    new ModelScopeLlm({
      model: 'Qwen/Qwen3.5-122B-A10B',
      apiKey: 'modelscope-key',
      timeoutMs: 2000,
      profile: profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B'),
      fetchImpl
    })

  it('ignores incoming ids, numbers every call and pairs results FIFO by name, keeping unanswered calls', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenText)

    await responses(
      legacy(fetchImpl),
      request([
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'call_x', name: 'lookup', args: { index: 1 } } },
            { functionCall: { id: 'call_y', name: 'lookup', args: { index: 2 } } },
            { functionCall: { id: 'call_z', name: 'flip_coin', args: {} } }
          ]
        },
        {
          role: 'user',
          parts: [
            { functionResponse: { id: 'call_y', name: 'lookup', response: { result: 'first' } } },
            { functionResponse: { id: 'call_x', name: 'lookup', response: { result: 'second' } } }
          ]
        }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"index":1}' } },
          { id: 'call_2', type: 'function', function: { name: 'lookup', arguments: '{"index":2}' } },
          { id: 'call_3', type: 'function', function: { name: 'flip_coin', arguments: '{}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"result":"first"}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{"result":"second"}' }
    ])
  })

  it('pairs an id-less result with the earliest unanswered call of its name in any earlier turn', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenText)

    await responses(
      legacy(fetchImpl),
      request([
        { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { index: 1 } } }] },
        { role: 'user', parts: [{ text: 'never mind' }] },
        { role: 'model', parts: [{ functionCall: { name: 'lookup', args: { index: 2 } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'lookup', response: { result: 'second' } } }] }
      ])
    )

    expect(bodyOf(calls[0]).messages).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"index":1}' } }]
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"result":"second"}' },
      { role: 'user', content: 'never mind' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'lookup', arguments: '{"index":2}' } }]
      }
    ])
  })

  it('returns a function call with no id even when the provider sends one', async () => {
    const [response] = await responses(legacy(replay(modelscope.qwenToolCall).fetchImpl), hello())

    expect(response?.content?.parts?.[0]?.functionCall).toEqual({
      name: 'get_current_time',
      args: { timezone: 'Asia/Tokyo' }
    })
    expect(response?.content?.parts?.[0]?.functionCall).not.toHaveProperty('id')
  })
})

const MEMORY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    city: { type: 'string', minLength: 1 },
    note: { type: 'string' },
    ops: {
      type: 'array',
      items: {
        oneOf: [
          {
            type: 'object',
            properties: { op: { type: 'string', const: 'add' }, value: { type: 'string' }, reason: { type: 'string' } },
            required: ['op', 'value'],
            additionalProperties: false
          },
          {
            type: 'object',
            properties: { op: { type: 'string', const: 'drop' }, id: { type: 'integer' } },
            required: ['op', 'id'],
            additionalProperties: false
          }
        ]
      }
    }
  },
  required: ['city', 'ops'],
  additionalProperties: false
}

const STRICT_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    city: { type: 'string' },
    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    ops: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              op: { type: 'string', const: 'add' },
              value: { type: 'string' },
              reason: { anyOf: [{ type: 'string' }, { type: 'null' }] }
            },
            required: ['op', 'value', 'reason'],
            additionalProperties: false
          },
          {
            type: 'object',
            properties: { op: { type: 'string', const: 'drop' }, id: { type: 'integer' } },
            required: ['op', 'id'],
            additionalProperties: false
          }
        ]
      }
    }
  },
  required: ['city', 'note', 'ops'],
  additionalProperties: false
}

describe('ChatCompletionsLlm structured output', () => {
  it('asks gpt-6-luna for a strict json_schema and drops the nulls strict mode puts in optional fields', async () => {
    const { fetchImpl, calls } = replay(openai.jsonSchema)

    const [response] = await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'Remember Kyoto.' }] }], { responseJsonSchema: MEMORY_SCHEMA })
    )

    expect(bodyOf(calls[0]).response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'response', strict: true, schema: STRICT_MEMORY_SCHEMA }
    })
    expect(bodyOf(calls[0]).messages).toEqual([{ role: 'user', content: 'Remember Kyoto.' }])
    expect(JSON.parse(response?.content?.parts?.[0]?.text ?? '')).toEqual({
      city: 'Kyoto',
      ops: [
        { op: 'add', value: 'likes tea' },
        { op: 'drop', id: 3 }
      ]
    })
  })

  it('drops strict-mode nulls inside a nullable array of objects and keeps a required-nullable null', async () => {
    const reply = {
      status: 200,
      body: {
        choices: [{ message: { content: '{"tags":[{"a":"x","b":null}],"label":null}' }, finish_reason: 'stop' }]
      }
    }
    const schema = {
      type: 'object',
      properties: {
        tags: {
          anyOf: [
            {
              type: 'array',
              items: {
                type: 'object',
                properties: { a: { type: 'string' }, b: { type: 'string' } },
                required: ['a'],
                additionalProperties: false
              }
            },
            { type: 'null' }
          ]
        },
        label: { anyOf: [{ type: 'string' }, { type: 'null' }] }
      },
      required: ['tags', 'label'],
      additionalProperties: false
    }

    const [response] = await responses(
      luna(replay(reply).fetchImpl),
      request([{ role: 'user', parts: [{ text: 'Tag it.' }] }], { responseJsonSchema: schema })
    )

    expect(JSON.parse(response?.content?.parts?.[0]?.text ?? '')).toEqual({ tags: [{ a: 'x' }], label: null })
  })

  it('sends an already strict schema unchanged', async () => {
    const { fetchImpl, calls } = replay(openai.jsonSchema)

    await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'x' }] }], { responseJsonSchema: STRICT_MEMORY_SCHEMA })
    )

    expect(bodyOf(calls[0]).response_format).toMatchObject({ json_schema: { schema: STRICT_MEMORY_SCHEMA } })
  })

  it('asks ModelScope for json_object with the schema in the system prompt and unwraps a fenced reply', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenJsonObject)
    const schema = {
      type: 'object',
      properties: { city: { type: 'string' }, population: { type: 'integer' } },
      required: ['city', 'population']
    }

    const [response] = await responses(
      onModelScope('Qwen/Qwen3.5-35B-A3B', fetchImpl),
      request([{ role: 'user', parts: [{ text: 'Kyoto?' }] }], {
        systemInstruction: 'Extract facts.',
        responseJsonSchema: schema
      })
    )

    expect(bodyOf(calls[0]).response_format).toEqual({ type: 'json_object' })
    expect(bodyOf(calls[0]).messages).toEqual([
      {
        role: 'system',
        content: `Extract facts.\n\nReply with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`
      },
      { role: 'user', content: 'Kyoto?' }
    ])
    expect(response?.content?.parts).toEqual([{ text: '{"city":"Kyoto","population":1460000}' }])
  })

  it('adds no response_format and no system text to a legacy request without a schema', async () => {
    const { fetchImpl, calls } = replay(modelscope.qwenText)

    await responses(
      new ModelScopeLlm({ model: 'Qwen/Qwen3.5-122B-A10B', apiKey: 'modelscope-key', timeoutMs: 2000, fetchImpl }),
      request([{ role: 'user', parts: [{ text: 'hi' }] }], { systemInstruction: 'Be Roka.' })
    )

    expect(bodyOf(calls[0])).not.toHaveProperty('response_format')
    expect(bodyOf(calls[0]).messages).toEqual([
      { role: 'system', content: 'Be Roka.' },
      { role: 'user', content: 'hi' }
    ])
  })
})

describe('ChatCompletionsLlm failures', () => {
  it.each<[string, string, string, number]>([
    ['openai', 'insufficientQuota', 'billing_exhausted', 429],
    ['openai', 'rateLimited', 'quota_exhausted', 429],
    ['openai', 'contextLength', 'context_length', 400],
    ['openai', 'serverError', 'transient_http', 500],
    ['modelscope', 'magicubeExhausted', 'quota_exhausted', 429],
    ['modelscope', 'overloaded', 'transient_http', 503],
    ['modelscope', 'unauthorized', 'terminal', 401]
  ])('classifies the %s %s reply as %s', async (provider, name, kind, status) => {
    const { fetchImpl } = replay(provider === 'openai' ? openai[name] : modelscope[name])
    const llm = provider === 'openai' ? luna(fetchImpl) : onModelScope('Qwen/Qwen3.5-35B-A3B', fetchImpl)

    const failure = responses(llm, hello())

    await expect(failure).rejects.toBeInstanceOf(ProviderError)
    await expect(failure).rejects.toMatchObject({ provider, kind, status })
  })

  it('carries Retry-After as retryAfterMs', async () => {
    await expect(responses(luna(replay(openai.rateLimited).fetchImpl), hello())).rejects.toMatchObject({
      retryAfterMs: 7000
    })
  })

  it('treats an HTTP 200 with choices: null as transient_http with a clear message', async () => {
    const llm = onModelScope('deepseek-ai/DeepSeek-V4.1-Flash', replay(modelscope.deepseekChoicesNull).fetchImpl)

    await expect(responses(llm, hello())).rejects.toMatchObject({
      kind: 'transient_http',
      status: 200,
      message: 'ModelScope returned HTTP 200 with no choices'
    })
  })

  it('turns an OpenAI refusal into a refusal failure', async () => {
    await expect(responses(luna(replay(openai.refusal).fetchImpl), hello())).rejects.toMatchObject({ kind: 'refusal' })
  })

  it('throws malformed_tool_args for arguments that do not parse, so no tool runs', async () => {
    await expect(responses(luna(replay(openai.malformedToolArgs).fetchImpl), hello())).rejects.toMatchObject({
      kind: 'malformed_tool_args',
      message: 'OpenAI returned malformed tool arguments'
    })
  })

  it('still records the usage of an HTTP 200 reply it rejects', async () => {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    await responses(luna(replay(openai.refusal).fetchImpl), hello()).catch(() => undefined)
    stop()

    expect(seen).toEqual([
      { provider: 'openai', model: 'gpt-6-luna', workload: 'reply', inputTokens: 80, outputTokens: 8 }
    ])
  })

  it("passes the caller's own abort through untouched", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl: typeof fetch = async (_input, init) => {
      throw init?.signal?.reason
    }

    const error = await responses(
      luna(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'hello' }] }], { abortSignal: controller.signal })
    ).catch((caught: unknown) => caught)

    expect(error).toBe(controller.signal.reason)
  })

  it('wraps any other transport failure as network, keeping the cause', async () => {
    const cause = new TypeError('fetch failed')
    const fetchImpl: typeof fetch = async () => {
      throw cause
    }

    await expect(responses(luna(fetchImpl), hello())).rejects.toMatchObject({
      kind: 'network',
      message: 'OpenAI request failed: fetch failed',
      cause
    })
  })

  it("treats the adapter's own timeout as network while the caller's signal stays live", async () => {
    const caller = new AbortController()
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) reject(signal.reason)
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    const llm = new ChatCompletionsLlm({
      provider: 'openai',
      model: 'gpt-6-luna',
      apiKey: 'openai-key',
      timeoutMs: 1,
      profile: profileFor('openai', 'gpt-6-luna'),
      fetchImpl
    })

    await expect(
      responses(llm, request([{ role: 'user', parts: [{ text: 'hello' }] }], { abortSignal: caller.signal }))
    ).rejects.toMatchObject({ kind: 'network' })
    expect(caller.signal.aborted).toBe(false)
  })
})

describe('ModelScopeLlm legacy failures', () => {
  const legacy = (fetchImpl: typeof fetch) =>
    new ModelScopeLlm({
      model: 'Qwen/Qwen3.5-122B-A10B',
      apiKey: 'modelscope-key',
      timeoutMs: 2000,
      profile: profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B'),
      fetchImpl
    })

  it("keeps today's plain error for a 429", async () => {
    const error = await responses(legacy(replay(modelscope.magicubeExhausted).fetchImpl), hello()).catch(
      (caught: unknown) => caught
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ProviderError)
    expect((error as Error).message).toMatch(/^ModelScope 429: /)
  })

  it("keeps today's empty reply for an HTTP 200 with choices: null", async () => {
    const result = await responses(legacy(replay(modelscope.deepseekChoicesNull).fetchImpl), hello())

    expect(result).toEqual([{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: FinishReason.STOP }])
  })

  it('ignores a refusal, as it always has', async () => {
    const reply = {
      status: 200,
      body: {
        choices: [{ message: { content: null, refusal: 'No.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 80, completion_tokens: 8, total_tokens: 88 }
      }
    }

    const result = await responses(legacy(replay(reply).fetchImpl), hello())

    expect(result).toEqual([
      {
        content: { role: 'model', parts: [{ text: '' }] },
        finishReason: FinishReason.STOP,
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 8, totalTokenCount: 88 }
      }
    ])
  })
})

describe('ChatCompletionsLlm usage and budget', () => {
  async function usageOf(run: () => Promise<unknown>): Promise<CallUsage[]> {
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))
    try {
      await run().catch(() => undefined)
    } finally {
      stop()
    }
    return seen
  }

  const withUsage = (usage: Record<string, unknown>): Fixture => ({
    status: 200,
    body: { choices: [{ message: { content: 'hm' }, finish_reason: 'stop' }], usage }
  })

  it('records the usage block once per call, with cache reads out of the input', async () => {
    const seen = await usageOf(() => responses(luna(replay(openai.text).fetchImpl), hello()))

    expect(seen).toEqual([
      {
        provider: 'openai',
        model: 'gpt-6-luna',
        workload: 'reply',
        inputTokens: 56,
        outputTokens: 9,
        cacheReadTokens: 64
      }
    ])
  })

  it('records reported reasoning tokens apart from the output', async () => {
    const reply = withUsage({
      prompt_tokens: 50,
      completion_tokens: 30,
      total_tokens: 80,
      completion_tokens_details: { reasoning_tokens: 12 }
    })

    const seen = await usageOf(() => responses(luna(replay(reply).fetchImpl), hello()))

    expect(seen).toEqual([
      {
        provider: 'openai',
        model: 'gpt-6-luna',
        workload: 'reply',
        inputTokens: 50,
        outputTokens: 18,
        reasoningTokens: 12
      }
    ])
  })

  it('floors a bucket at zero when a detail exceeds its total', async () => {
    const reply = withUsage({
      prompt_tokens: 10,
      completion_tokens: 5,
      prompt_tokens_details: { cached_tokens: 20 },
      completion_tokens_details: { reasoning_tokens: 9 }
    })

    const seen = await usageOf(() => responses(luna(replay(reply).fetchImpl), hello()))

    expect(seen).toEqual([
      {
        provider: 'openai',
        model: 'gpt-6-luna',
        workload: 'reply',
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 9,
        cacheReadTokens: 20
      }
    ])
  })

  it('still counts a 200 that brought no choices, and nothing for a call that failed before answering', async () => {
    const deepseek = onModelScope('deepseek-ai/DeepSeek-V4.1-Flash', replay(modelscope.deepseekChoicesNull).fetchImpl)

    expect(await usageOf(() => responses(deepseek, hello()))).toEqual([
      {
        provider: 'modelscope',
        model: 'deepseek-ai/DeepSeek-V4.1-Flash',
        workload: 'reply',
        inputTokens: 0,
        outputTokens: 0
      }
    ])
    expect(await usageOf(() => responses(luna(replay(openai.serverError).fetchImpl), hello()))).toEqual([])
  })

  it('reserves before calling and releases with the recorded usage before yielding the reply', async () => {
    const fetchImpl = vi.fn(replay(openai.text).fetchImpl)

    const seen = await usageOf(() => luna(fetchImpl).generateContentAsync(hello()).next())

    expect(budget.startCall).toHaveBeenCalledTimes(1)
    expect(budget.startCall).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-6-luna',
      workload: 'reply',
      estTokens: expect.any(Number),
      signal: undefined
    })
    expect(budget.startCall.mock.invocationCallOrder[0]).toBeLessThan(fetchImpl.mock.invocationCallOrder[0] ?? 0)
    expect(seen).toHaveLength(1)
    expect(budget.release).toHaveBeenCalledTimes(1)
    expect(budget.release.mock.calls[0]?.[0]).toBe(seen[0])
  })

  it('records and reserves a labelled background call under its own workload', async () => {
    const labelled = request([{ role: 'user', parts: [{ text: 'hello' }] }], {
      labels: { [WORKLOAD_LABEL]: 'extraction' }
    })

    const seen = await usageOf(() => responses(luna(replay(openai.text).fetchImpl), labelled))

    expect(budget.startCall).toHaveBeenCalledWith(expect.objectContaining({ workload: 'extraction' }))
    expect(seen).toEqual([expect.objectContaining({ workload: 'extraction' })])
  })

  it.each<[BudgetDenial['denied'], string]>([
    ['monthly', 'billing_exhausted'],
    ['rpm', 'quota_exhausted']
  ])('turns a %s denial into %s without calling the provider', async (denied, kind) => {
    budget.startCall.mockImplementation(async (input: { provider: ProviderId }) =>
      grantOrThrow(input.provider, { denied })
    )
    const { fetchImpl, calls } = replay(openai.text)

    await expect(responses(luna(fetchImpl), hello())).rejects.toMatchObject({ provider: 'openai', kind })
    expect(calls).toHaveLength(0)
    expect(budget.release).not.toHaveBeenCalled()
  })

  it('marks OpenAI billing spent on insufficient_quota, and not on a busy minute', async () => {
    await expect(responses(luna(replay(openai.insufficientQuota).fetchImpl), hello())).rejects.toMatchObject({
      kind: 'billing_exhausted'
    })
    expect(budget.markBillingExhausted).toHaveBeenCalledTimes(1)
    expect(budget.markBillingExhausted).toHaveBeenCalledWith('openai')

    budget.markBillingExhausted.mockClear()
    await expect(responses(luna(replay(openai.rateLimited).fetchImpl), hello())).rejects.toMatchObject({
      kind: 'quota_exhausted'
    })
    expect(budget.markBillingExhausted).not.toHaveBeenCalled()
  })

  it('keeps a ModelScope 429 that mentions insufficient_quota a busy minute, not spent billing', async () => {
    const llm = onModelScope('Qwen/Qwen3.5-35B-A3B', replay(openai.insufficientQuota).fetchImpl)

    await expect(responses(llm, hello())).rejects.toMatchObject({
      provider: 'modelscope',
      kind: 'quota_exhausted',
      status: 429
    })
    expect(budget.markBillingExhausted).not.toHaveBeenCalled()
  })

  it.each<[string, () => ChatCompletionsLlm]>([
    ['a 503', () => onModelScope('Qwen/Qwen3.5-35B-A3B', replay(modelscope.overloaded).fetchImpl)],
    [
      'a transport failure',
      () =>
        luna(async () => {
          throw new TypeError('fetch failed')
        })
    ]
  ])('releases with nothing after %s', async (_failure, llm) => {
    await expect(responses(llm(), hello())).rejects.toBeInstanceOf(ProviderError)

    expect(budget.release.mock.calls).toStrictEqual([[]])
  })

  it.each<[string, (fetchImpl: typeof fetch) => ChatCompletionsLlm]>([
    ['ChatCompletionsLlm', luna],
    [
      'ModelScopeLlm',
      (fetchImpl) =>
        new ModelScopeLlm({ model: 'Qwen/Qwen3.5-122B-A10B', apiKey: 'modelscope-key', timeoutMs: 2000, fetchImpl })
    ]
  ])('%s releases a malformed-arguments 2xx with the usage it recorded', async (_adapter, llm) => {
    const seen = await usageOf(async () => {
      await expect(responses(llm(replay(openai.malformedToolArgs).fetchImpl), hello())).rejects.toMatchObject({
        kind: 'malformed_tool_args'
      })
    })

    expect(seen).toEqual([expect.objectContaining({ inputTokens: 90, outputTokens: 7 })])
    expect(budget.release).toHaveBeenCalledTimes(1)
    expect(budget.release.mock.calls[0]?.[0]).toBe(seen[0])
  })
})
