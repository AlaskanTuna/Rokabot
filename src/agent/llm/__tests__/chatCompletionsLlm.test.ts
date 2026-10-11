import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BaseLlm, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { ModelScopeLlm as ReexportedModelScopeLlm } from '../../fallbackModel.js'
import { ChatCompletionsLlm, ModelScopeLlm } from '../chatCompletionsLlm.js'
import { MODEL_PROFILES, profileFor } from '../profiles.js'

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
    'keeps %s a json_object candidate with thinking off until the probe passes',
    (model) => {
      expect(profileFor('modelscope', model)).toMatchObject({
        provider: 'modelscope',
        tools: { supported: true, parallel: true },
        thinking: { efforts: [], replayWithinTurn: false },
        structuredOutput: 'json_object',
        promptCaching: 'none',
        tokenCounter: 'estimate',
        price: { input: 0, output: 0 },
        verified: false
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
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 9, totalTokenCount: 129 }
      }
    ])
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
