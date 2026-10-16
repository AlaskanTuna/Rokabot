import { BaseLlm } from '@google/adk'
import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configState = vi.hoisted(() => ({
  gemini: { model: 'gemini-test', hedgeAfterMs: 0 },
  llm: { hedgeAfterMs: 0 },
  logging: { level: 'silent' },
  fallback: {
    apiKey: undefined as string | undefined,
    model: 'Qwen/Qwen3.5-122B-A10B',
    baseUrl: 'https://api-inference.modelscope.ai/v1',
    timeoutMs: 15_000,
    stickyMs: 300_000
  }
}))

// Under this tsconfig vitest loads tests as CJS, and the RelativePath.keys tsc emits for this file do not
// collide with the literal key the source keeps, so both forms are registered.
vi.mock('../../config.js', () => ({ config: configState }))
vi.mock('../src/agent/../config.js', () => ({ config: configState }))

const budgetState = vi.hoisted(() => ({ release: vi.fn(), startCall: vi.fn() }))

vi.mock('../llm/budget.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../llm/budget.js')>()),
  startCall: budgetState.startCall
}))

import { ModelScopeLlm, RoutedLlm, modelRouteForRequest } from '../fallbackModel.js'
import { type CallUsage, onUsage } from '../llm/usage.js'

beforeEach(() => {
  budgetState.release.mockReset()
  budgetState.startCall.mockReset()
  budgetState.startCall.mockResolvedValue({ release: budgetState.release })
})

afterEach(() => {
  budgetState.release.mockReset()
  budgetState.startCall.mockReset()
})

type RequestCall = { input: unknown; init?: RequestInit }

function request(contents: unknown[], config: Record<string, unknown> = {}): LlmRequest {
  return {
    model: 'gemini-model-name',
    contents,
    config,
    toolsDict: {},
    liveConnectConfig: undefined
  } as unknown as LlmRequest
}

function createFetch(body: unknown, status = 200) {
  const calls: RequestCall[] = []
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init })
    return new Response(JSON.stringify(body), { status })
  }
  return { fetchImpl, calls }
}

function adapter(fetchImpl: typeof fetch) {
  return new ModelScopeLlm({
    model: 'Qwen/test-model',
    apiKey: 'test-key',
    baseUrl: 'https://modelscope.test/v1/',
    timeoutMs: 2000,
    fetchImpl
  })
}

async function responses(model: BaseLlm, llmRequest: LlmRequest, stream?: boolean): Promise<LlmResponse[]> {
  const result: LlmResponse[] = []
  for await (const response of model.generateContentAsync(llmRequest, stream)) result.push(response)
  return result
}

function bodyOf(call: RequestCall | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body as string) as Record<string, unknown>
}

describe('ModelScopeLlm request translation', () => {
  it('sends system text, user text, images and unsupported attachment markers, dropping thought parts', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'ok' } }] })
    const llmRequest = request(
      [
        {
          role: 'user',
          parts: [
            { text: 'What is this?' },
            { inlineData: { mimeType: 'image/png', data: 'AA==' } },
            { inlineData: { mimeType: 'audio/mpeg', data: 'AQ==' } },
            { inlineData: { mimeType: 'application/pdf', data: 'Ag==' } },
            { fileData: { mimeType: 'video/mp4', fileUri: 'gs://clip' } },
            { text: 'hidden thought', thought: true }
          ]
        },
        { role: 'model', parts: [{ text: 'hidden thought', thought: true }, { text: 'visible answer' }] },
        { role: 'user', parts: [{ text: 'one more thing' }] }
      ],
      {
        systemInstruction: { role: 'system', parts: [{ text: 'System one.' }, { text: 'System two.' }] },
        temperature: 0.4,
        topP: 0.8,
        maxOutputTokens: 222
      }
    )

    await responses(adapter(fetchImpl), llmRequest)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.input).toBe('https://modelscope.test/v1/chat/completions')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer test-key')
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toBe('application/json')
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
    expect(bodyOf(calls[0])).toEqual({
      model: 'Qwen/test-model',
      messages: [
        { role: 'system', content: 'System one.\nSystem two.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } },
            { type: 'text', text: "(a audio attachment that can't be opened right now)" },
            { type: 'text', text: "(a PDF attachment that can't be opened right now)" },
            { type: 'text', text: "(a video attachment that can't be opened right now)" }
          ]
        },
        { role: 'assistant', content: 'visible answer' },
        { role: 'user', content: 'one more thing' }
      ],
      temperature: 0.4,
      top_p: 0.8,
      max_tokens: 222,
      enable_thinking: false,
      stream: false
    })
  })

  it('uses a plain system string and sends text-only user messages as strings', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'ok' } }] })

    await responses(
      adapter(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'hello' }, { text: 'there' }] }], { systemInstruction: 'system text' })
    )

    expect(bodyOf(calls[0])).toMatchObject({
      messages: [
        { role: 'system', content: 'system text' },
        { role: 'user', content: 'hello\nthere' }
      ]
    })
  })

  it('pairs repeated tool responses FIFO and marks unmatched results as user text', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'done' } }] })
    const llmRequest = request([
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'lookup', args: { index: 1 } } },
          { functionCall: { name: 'lookup', args: { index: 2 } } },
          { text: 'checking' }
        ]
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'lookup', response: { result: 'first' } } },
          { functionResponse: { name: 'lookup', response: { result: 'second' } } },
          { functionResponse: { name: 'missing', response: 'unknown' } }
        ]
      }
    ])

    await responses(adapter(fetchImpl), llmRequest)

    expect(bodyOf(calls[0])['messages']).toEqual([
      {
        role: 'assistant',
        content: 'checking',
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"index":1}' } },
          { id: 'call_2', type: 'function', function: { name: 'lookup', arguments: '{"index":2}' } }
        ]
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"result":"first"}' },
      { role: 'tool', tool_call_id: 'call_2', content: '{"result":"second"}' },
      { role: 'user', content: '(result of missing: "unknown")' }
    ])
  })

  it('converts nested Gemini Schema types and removes propertyOrdering', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'ok' } }] })
    const llmRequest = request([{ role: 'user', parts: [{ text: 'go' }] }], {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'search',
              description: 'Find entries',
              parameters: {
                type: 'OBJECT',
                propertyOrdering: ['query'],
                properties: {
                  query: { type: 'STRING', description: 'Search text', format: 'text' },
                  filters: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: { active: { type: 'BOOLEAN', nullable: true } },
                      required: ['active'],
                      propertyOrdering: ['active']
                    },
                    anyOf: [{ type: 'NUMBER' }, { type: 'INTEGER' }]
                  }
                },
                required: ['query'],
                enum: ['example']
              }
            }
          ]
        }
      ]
    })

    await responses(adapter(fetchImpl), llmRequest)

    expect(bodyOf(calls[0])['tools']).toEqual([
      {
        type: 'function',
        function: {
          name: 'search',
          description: 'Find entries',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search text', format: 'text' },
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { active: { type: 'boolean', nullable: true } },
                  required: ['active']
                },
                anyOf: [{ type: 'number' }, { type: 'integer' }]
              }
            },
            required: ['query'],
            enum: ['example']
          }
        }
      }
    ])
  })

  it('passes parametersJsonSchema through unchanged', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'ok' } }] })
    const parametersJsonSchema = { type: 'object', additionalProperties: false, properties: { x: { type: 'string' } } }

    await responses(
      adapter(fetchImpl),
      request([{ role: 'user', parts: [{ text: 'go' }] }], {
        tools: [{ functionDeclarations: [{ name: 'json_tool', parametersJsonSchema }] }]
      })
    )

    expect(bodyOf(calls[0])['tools']).toEqual([
      { type: 'function', function: { name: 'json_tool', parameters: parametersJsonSchema } }
    ])
  })

  it('omits tools when the request has no function declarations', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'ok' } }] })

    await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'go' }] }], { tools: [] }))

    expect(bodyOf(calls[0])).not.toHaveProperty('tools')
  })

  it('does not send unset generation parameters and always disables thinking and streaming', async () => {
    const { fetchImpl, calls } = createFetch({ choices: [{ message: { content: 'ok' } }] })

    await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'go' }] }]))

    expect(bodyOf(calls[0])).toEqual({
      model: 'Qwen/test-model',
      messages: [{ role: 'user', content: 'go' }],
      enable_thinking: false,
      stream: false
    })
  })
})

describe('ModelScopeLlm response translation', () => {
  it('trims text and maps length and usage metadata', async () => {
    const { fetchImpl } = createFetch({
      choices: [{ message: { content: '  hello there  ' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 }
    })

    const result = await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))

    expect(result).toEqual([
      {
        content: { role: 'model', parts: [{ text: 'hello there' }] },
        finishReason: FinishReason.MAX_TOKENS,
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7, totalTokenCount: 19 }
      }
    ])
  })

  it('returns tool calls with parsed arguments, a skip signature and no id', async () => {
    const { fetchImpl } = createFetch({
      choices: [
        {
          message: {
            content: 'Searching',
            tool_calls: [
              { id: 'provider-id', type: 'function', function: { name: 'search', arguments: '{"query":"tea"}' } }
            ]
          },
          finish_reason: 'tool_calls'
        }
      ]
    })

    const result = await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'search' }] }]))

    expect(result[0]).toMatchObject({
      content: {
        role: 'model',
        parts: [
          { text: 'Searching' },
          {
            functionCall: { name: 'search', args: { query: 'tea' } },
            thoughtSignature: 'skip_thought_signature_validator'
          }
        ]
      },
      finishReason: FinishReason.STOP
    })
    expect(result[0]?.content?.parts?.[1]).not.toHaveProperty('id')
  })

  it.each(['{bad json', '[]'])('throws malformed_tool_args for invalid object arguments: %s', async (args) => {
    const { fetchImpl } = createFetch({
      choices: [
        {
          message: { tool_calls: [{ function: { name: 'search', arguments: args } }] },
          finish_reason: 'tool_calls'
        }
      ]
    })

    await expect(
      responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'search' }] }]))
    ).rejects.toMatchObject({ kind: 'malformed_tool_args', message: 'ModelScope returned malformed tool arguments' })
  })

  it('returns the empty-text STOP shape when the model supplies no text or tools', async () => {
    const { fetchImpl } = createFetch({ choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] })

    const result = await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ content: { role: 'model', parts: [{ text: '' }] }, finishReason: FinishReason.STOP })
    // An empty reply carries a content-free diagnostic so a production empty_text can be traced.
    expect(result[0]?.customMetadata?.replyDiagnostic).toMatchObject({
      finishReason: 'stop',
      textPartCount: 0,
      reasoningPartCount: 0,
      functionCallPartCount: 0,
      historyEndedOnToolResult: false
    })
  })

  it('maps content_filter to SAFETY and other finish reasons to STOP', async () => {
    const safety = createFetch({ choices: [{ message: { content: 'blocked' }, finish_reason: 'content_filter' }] })
    const unknown = createFetch({ choices: [{ message: { content: 'done' }, finish_reason: 'anything-else' }] })

    expect(
      (await responses(adapter(safety.fetchImpl), request([{ role: 'user', parts: [{ text: 'x' }] }])))[0]?.finishReason
    ).toBe(FinishReason.SAFETY)
    expect(
      (await responses(adapter(unknown.fetchImpl), request([{ role: 'user', parts: [{ text: 'x' }] }])))[0]
        ?.finishReason
    ).toBe(FinishReason.STOP)
  })

  it('throws the HTTP status and response body on non-2xx responses', async () => {
    const { fetchImpl } = createFetch({ error: 'busy' }, 503)

    await expect(
      responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))
    ).rejects.toThrow('ModelScope 503:')
  })

  it('records the usage of each call once', async () => {
    const { fetchImpl } = createFetch({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 }
    })
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))
    stop()

    expect(seen).toEqual([
      { provider: 'modelscope', model: 'Qwen/test-model', workload: 'reply', inputTokens: 120, outputTokens: 8 }
    ])
  })

  it('reserves one budget call and releases it with the usage it recorded', async () => {
    const { fetchImpl } = createFetch({
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 }
    })
    const seen: CallUsage[] = []
    const stop = onUsage((usage) => seen.push(usage))

    await responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))
    stop()

    expect(budgetState.startCall).toHaveBeenCalledTimes(1)
    expect(budgetState.startCall).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'modelscope', model: 'Qwen/test-model', workload: 'reply' })
    )
    expect(budgetState.release).toHaveBeenCalledTimes(1)
    expect(budgetState.release).toHaveBeenCalledWith(seen[0])
    expect(budgetState.release.mock.calls[0]?.[0]).toBe(seen[0])
  })

  it("releases the reservation with no usage when the response is not OK, and still throws today's error", async () => {
    const { fetchImpl } = createFetch({ error: 'busy' }, 503)

    await expect(
      responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))
    ).rejects.toThrow('ModelScope 503: {"error":"busy"}')

    expect(budgetState.release).toHaveBeenCalledTimes(1)
    expect(budgetState.release).toHaveBeenCalledWith()
  })

  it('propagates a fetch rejection unchanged', async () => {
    const networkError = new Error('socket closed')
    const fetchImpl: typeof fetch = async () => {
      throw networkError
    }

    await expect(responses(adapter(fetchImpl), request([{ role: 'user', parts: [{ text: 'hello' }] }]))).rejects.toBe(
      networkError
    )
  })

  it('constructs BaseLlm with the model name string', () => {
    const { fetchImpl } = createFetch({ choices: [{ message: { content: 'ok' } }] })

    expect(adapter(fetchImpl).model).toBe('Qwen/test-model')
  })

  it('rejects live connections', () => {
    const { fetchImpl } = createFetch({ choices: [{ message: { content: 'ok' } }] })

    expect(() => adapter(fetchImpl).connect(request([]))).toThrow('ModelScopeLlm does not support live connections')
  })
})

describe('RoutedLlm', () => {
  class TextLlm extends BaseLlm {
    public calls: Array<{ request: LlmRequest; stream?: boolean }> = []
    public connections = 0

    constructor(
      model: string,
      private readonly text: string
    ) {
      super({ model })
    }

    async *generateContentAsync(llmRequest: LlmRequest, stream?: boolean): AsyncGenerator<LlmResponse, void> {
      this.calls.push({ request: llmRequest, stream })
      yield { content: { role: 'model', parts: [{ text: this.text }] } }
    }

    connect(): Promise<BaseLlmConnection> {
      this.connections += 1
      return Promise.resolve({} as BaseLlmConnection)
    }
  }

  it('routes to fallback only in a fallback request context', async () => {
    const primary = new TextLlm('primary', 'primary answer')
    const fallback = new TextLlm('fallback', 'fallback answer')
    const routed = new RoutedLlm(primary, fallback)
    const llmRequest = request([{ role: 'user', parts: [{ text: 'hello' }] }])

    expect((await responses(routed, llmRequest))[0]?.content?.parts?.[0]?.text).toBe('primary answer')
    expect(
      (
        await modelRouteForRequest.run({ useFallback: true, hedged: false, answeredBy: null, pinned: null }, () =>
          responses(routed, llmRequest, true)
        )
      )[0]?.content?.parts?.[0]?.text
    ).toBe('fallback answer')
    expect(primary.calls).toHaveLength(1)
    expect(fallback.calls).toHaveLength(1)
    expect(fallback.calls[0]?.stream).toBe(true)
    expect(routed.model).toBe('primary')
    expect(routed.hasFallback).toBe(true)
    expect(routed.fallbackModelName).toBe('fallback')
  })

  it('uses primary when fallback is unavailable, even inside a fallback request context', async () => {
    const primary = new TextLlm('primary', 'primary answer')
    const routed = new RoutedLlm(primary, null)

    const result = await modelRouteForRequest.run(
      { useFallback: true, hedged: false, answeredBy: null, pinned: null },
      () => responses(routed, request([{ role: 'user', parts: [{ text: 'hello' }] }]))
    )

    expect(result[0]?.content?.parts?.[0]?.text).toBe('primary answer')
    expect(routed.hasFallback).toBe(false)
    expect(routed.fallbackModelName).toBeUndefined()
  })

  it('delegates live connections to primary', async () => {
    const primary = new TextLlm('primary', 'primary answer')
    const routed = new RoutedLlm(primary, new TextLlm('fallback', 'fallback answer'))

    await routed.connect(request([]))

    expect(primary.connections).toBe(1)
  })
})
