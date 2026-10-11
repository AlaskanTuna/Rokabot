import type Anthropic from '@anthropic-ai/sdk'
import type { LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import type { Content } from '@google/genai'
import { describe, expect, it, vi } from 'vitest'

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

import type { ResolvedModel } from '../../../config.js'
import { assembleSystemPrompt } from '../../promptAssembler.js'
import { CORE_PROMPT } from '../../prompts/core.js'
import { SPEECH_PROMPT } from '../../prompts/speech.js'
import { AnthropicLlm, STRUCTURED_OUTPUT_TOOL } from '../anthropicLlm.js'
import { profileFor } from '../profiles.js'
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
