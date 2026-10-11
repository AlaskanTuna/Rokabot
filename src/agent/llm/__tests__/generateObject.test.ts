import { Gemini } from '@google/adk'
import type { LlmRequest, LlmResponse } from '@google/adk'
import { FinishReason } from '@google/genai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ResolvedModel } from '../../../config.js'

const mocks = vi.hoisted(() => ({
  createLlm: vi.fn(),
  warn: vi.fn(),
  config: {
    gemini: { extractionModel: 'gemini-extraction-test', timeout: 20_000, safetyThreshold: 'OFF' },
    llm: { main: null as unknown, fallback: null as unknown }
  }
}))

vi.mock('../createModel.js', () => ({ createLlm: mocks.createLlm }))
vi.mock('../../../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
vi.mock('../../../config.js', () => ({ config: mocks.config }))

import { SAFETY_SETTINGS } from '../../safetySettings.js'
import { StructuredOutputError, generateObject, resetGenerateObjectForTest } from '../generateObject.js'
import { type ModelProfile, profileFor } from '../profiles.js'

const gemini = profileFor('gemini', 'gemini-3.5-flash-lite') as ModelProfile
const haiku = profileFor('anthropic', 'claude-haiku-5-5') as ModelProfile
const qwen = profileFor('modelscope', 'Qwen/Qwen3.5-122B-A10B') as ModelProfile
const Answer = z.object({ answer: z.string() }).strict()
const LEGACY = { type: 'OBJECT', properties: { answer: { type: 'STRING' } }, required: ['answer'] }
const ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false
}

function route(key: string, profile: ModelProfile, overrides: Partial<ResolvedModel> = {}): ResolvedModel {
  return {
    key,
    provider: profile.provider,
    model: profile.model,
    profile,
    apiKey: 'test-key',
    timeoutMs: 15_000,
    maxOutputTokens: 500,
    ...overrides
  }
}

function reply(value: unknown, finishReason: FinishReason = FinishReason.STOP): LlmResponse {
  return {
    content: { role: 'model', parts: [{ text: typeof value === 'string' ? value : JSON.stringify(value) }] },
    finishReason,
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 15 }
  }
}

function fakeLlm(...replies: Array<LlmResponse | Error>) {
  const requests: LlmRequest[] = []
  return {
    requests,
    async *generateContentAsync(request: LlmRequest): AsyncGenerator<LlmResponse, void> {
      requests.push(request)
      const next = replies.shift()
      if (next === undefined) throw new Error('No reply queued')
      if (next instanceof Error) throw next
      yield next
    }
  }
}

function useLlms(byKey: Record<string, ReturnType<typeof fakeLlm>>): void {
  mocks.createLlm.mockImplementation((resolved: ResolvedModel) => byKey[resolved.key])
}

beforeEach(() => {
  resetGenerateObjectForTest()
  mocks.createLlm.mockReset()
  mocks.warn.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generateObject on the legacy config', () => {
  beforeEach(() => {
    mocks.config.llm = { main: route('legacy-gemini', gemini), fallback: route('legacy-fallback', qwen) }
  })

  it("sends today's Gemini extraction request: extraction model, timeout, temperature and safety settings", async () => {
    const main = fakeLlm(reply({ answer: 'tea' }))
    useLlms({ 'legacy-gemini': main })

    await expect(
      generateObject({
        schema: Answer,
        prompt: 'Extract.',
        workload: 'extraction',
        maxOutputTokens: 700,
        legacyResponseSchema: LEGACY
      })
    ).resolves.toEqual({
      value: { answer: 'tea' },
      provider: 'gemini',
      model: 'gemini-extraction-test',
      usage: {
        provider: 'gemini',
        model: 'gemini-extraction-test',
        workload: 'extraction',
        inputTokens: 120,
        outputTokens: 15
      }
    })

    expect(mocks.createLlm).toHaveBeenCalledOnce()
    expect(mocks.createLlm.mock.calls[0][0]).toMatchObject({
      key: 'legacy-gemini',
      model: 'gemini-extraction-test',
      timeoutMs: 20_000,
      maxOutputTokens: 700
    })
    const request = main.requests[0]
    expect(request.model).toBe('gemini-extraction-test')
    expect(request.contents).toEqual([{ role: 'user', parts: [{ text: 'Extract.' }] }])
    expect(request.config).toEqual({
      responseMimeType: 'application/json',
      responseSchema: LEGACY,
      temperature: 0.3,
      maxOutputTokens: 700,
      safetySettings: SAFETY_SETTINGS,
      httpOptions: { timeout: 20_000 },
      labels: { rokabot_workload: 'extraction' }
    })
    expect(request.config?.responseSchema).toBe(LEGACY)
  })

  it('sends the generated JSON schema when the job gives no legacy schema', async () => {
    const main = fakeLlm(reply({ answer: 'tea' }))
    useLlms({ 'legacy-gemini': main })

    await generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction', maxOutputTokens: 700 })

    expect(main.requests[0].config?.responseJsonSchema).toEqual(ANSWER_JSON_SCHEMA)
    expect(main.requests[0].config).not.toHaveProperty('responseSchema')
  })

  it('sends reclassification at temperature 0 and reuses one adapter', async () => {
    const main = fakeLlm(reply({ answer: 'a' }), reply({ answer: 'b' }))
    useLlms({ 'legacy-gemini': main })

    await generateObject({ schema: Answer, prompt: 'One.', workload: 'reclassify' })
    await generateObject({ schema: Answer, prompt: 'Two.', workload: 'reclassify' })

    expect(main.requests.map((request) => request.config?.temperature)).toEqual([0, 0])
    expect(mocks.createLlm).toHaveBeenCalledOnce()
  })

  it('builds one adapter per output cap, so each batch size keeps its own cap', async () => {
    const main = fakeLlm(reply({ answer: 'a' }), reply({ answer: 'b' }))
    useLlms({ 'legacy-gemini': main })

    await generateObject({ schema: Answer, prompt: 'Two.', workload: 'reclassify', maxOutputTokens: 180 })
    await generateObject({ schema: Answer, prompt: 'Ten.', workload: 'reclassify', maxOutputTokens: 500 })

    expect(mocks.createLlm).toHaveBeenCalledTimes(2)
    expect(mocks.createLlm.mock.calls.map(([resolved]) => resolved.maxOutputTokens)).toEqual([180, 500])
    expect(main.requests.map((request) => request.config?.maxOutputTokens)).toEqual([180, 500])
  })

  it('never tries the fallback and rethrows the Gemini error unchanged', async () => {
    const failure = Object.assign(new Error('overloaded'), { status: 503 })
    useLlms({ 'legacy-gemini': fakeLlm(failure) })

    await expect(generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction' })).rejects.toBe(failure)
    expect(mocks.createLlm).toHaveBeenCalledOnce()
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it("sends today's extraction request through the real Gemini adapter, above the 500-token reply cap", async () => {
    mocks.config.llm = {
      main: route('legacy-gemini', gemini, { apiKey: 'vitest-gemini-token', timeoutMs: 20_000, maxOutputTokens: 500 }),
      fallback: null
    }
    const actual = await vi.importActual<typeof import('../createModel.js')>('../createModel.js')
    mocks.createLlm.mockImplementation(actual.createLlm)
    const seen: LlmRequest[] = []
    vi.spyOn(Gemini.prototype, 'generateContentAsync').mockImplementation(async function* (llmRequest: LlmRequest) {
      seen.push(llmRequest)
      yield reply({ answer: 'tea' })
    })

    await expect(
      generateObject({
        schema: Answer,
        prompt: 'Extract.',
        workload: 'extraction',
        maxOutputTokens: 700,
        legacyResponseSchema: LEGACY
      })
    ).resolves.toMatchObject({ value: { answer: 'tea' }, provider: 'gemini', model: 'gemini-extraction-test' })

    expect(seen).toHaveLength(1)
    expect(seen[0].model).toBe('gemini-extraction-test')
    expect(seen[0].config).toMatchObject({
      maxOutputTokens: 700,
      temperature: 0.3,
      safetySettings: SAFETY_SETTINGS,
      httpOptions: { timeout: 20_000 }
    })
    expect(seen[0].config?.responseSchema).toBe(LEGACY)
    expect(seen[0].config).not.toHaveProperty('responseJsonSchema')
  })
})

describe('generateObject on a configured llm block', () => {
  it('shapes an Anthropic request: no temperature, no safety settings, no bounds, the request output cap', async () => {
    mocks.config.llm = { main: route('haiku', haiku), fallback: null }
    const main = fakeLlm(reply({ score: 0.9 }))
    useLlms({ haiku: main })

    await generateObject({
      schema: z.object({ score: z.number().min(0).max(1) }).strict(),
      prompt: 'Judge.',
      workload: 'admission'
    })

    const sent = main.requests[0].config
    expect(sent).not.toHaveProperty('temperature')
    expect(sent).not.toHaveProperty('safetySettings')
    expect(sent?.responseJsonSchema).toEqual({
      type: 'object',
      properties: { score: { type: 'number' } },
      required: ['score'],
      additionalProperties: false
    })
    expect(sent?.maxOutputTokens).toBe(1024)
    expect(mocks.createLlm.mock.calls[0][0].maxOutputTokens).toBe(1024)
  })

  it('ignores a legacy response schema and sends the generated JSON schema', async () => {
    mocks.config.llm = { main: route('flash', gemini), fallback: null }
    const main = fakeLlm(reply({ answer: 'tea' }))
    useLlms({ flash: main })

    await generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction', legacyResponseSchema: LEGACY })

    expect(main.requests[0].config?.responseJsonSchema).toEqual(ANSWER_JSON_SCHEMA)
    expect(main.requests[0].config).not.toHaveProperty('responseSchema')
  })

  it('splits Gemini usage into disjoint uncached input, cache read, output and reasoning buckets', async () => {
    mocks.config.llm = { main: route('flash', gemini), fallback: null }
    useLlms({
      flash: fakeLlm({
        ...reply({ answer: 'tea' }),
        usageMetadata: {
          promptTokenCount: 120,
          cachedContentTokenCount: 100,
          candidatesTokenCount: 15,
          thoughtsTokenCount: 4
        }
      })
    })

    const { usage } = await generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction' })

    expect(usage).toEqual({
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      workload: 'extraction',
      inputTokens: 20,
      cacheReadTokens: 100,
      outputTokens: 15,
      reasoningTokens: 4
    })
  })

  it('leaves reasoning inside Anthropic output tokens', async () => {
    mocks.config.llm = { main: route('haiku', haiku), fallback: null }
    useLlms({
      haiku: fakeLlm({
        ...reply({ answer: 'tea' }),
        usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 15, thoughtsTokenCount: 4 }
      })
    })

    const { usage } = await generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction' })

    expect(usage).toMatchObject({ provider: 'anthropic', inputTokens: 120, outputTokens: 15 })
    expect(usage).not.toHaveProperty('reasoningTokens')
  })

  it('tries the fallback once when the main reply fails validation, reading only answer text', async () => {
    mocks.config.llm = { main: route('haiku', haiku), fallback: route('flash', gemini) }
    const main = fakeLlm(reply({ answer: 7 }))
    const fallback = fakeLlm({
      content: { role: 'model', parts: [{ text: 'thinking it over', thought: true }, { text: '{"answer":"tea"}' }] },
      finishReason: FinishReason.STOP
    })
    useLlms({ haiku: main, flash: fallback })

    await expect(generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction' })).resolves.toMatchObject(
      {
        value: { answer: 'tea' },
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite'
      }
    )
    expect(main.requests).toHaveLength(1)
    expect(fallback.requests).toHaveLength(1)
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ workload: 'extraction', provider: 'anthropic', reason: 'invalid_object' }),
      expect.any(String)
    )
  })

  it('throws the main error when the fallback fails too', async () => {
    mocks.config.llm = { main: route('haiku', haiku), fallback: route('flash', gemini) }
    const failure = new Error('overloaded')
    useLlms({ haiku: fakeLlm(failure), flash: fakeLlm(reply('not json')) })

    await expect(generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction' })).rejects.toBe(failure)
    expect(mocks.warn).toHaveBeenCalledTimes(2)
  })

  it('does not try the fallback once the caller aborted', async () => {
    mocks.config.llm = { main: route('haiku', haiku), fallback: route('flash', gemini) }
    const fallback = fakeLlm(reply({ answer: 'tea' }))
    useLlms({ haiku: fakeLlm(new Error('aborted')), flash: fallback })
    const controller = new AbortController()
    controller.abort()

    await expect(
      generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction', signal: controller.signal })
    ).rejects.toThrow('aborted')
    expect(fallback.requests).toHaveLength(0)
  })

  it('reads strict-mode nulls as omitted fields before validating', async () => {
    const strict: ModelProfile = {
      ...haiku,
      provider: 'openai',
      model: 'strict-test',
      structuredOutput: 'json_schema_strict'
    }
    mocks.config.llm = { main: route('strict', strict), fallback: null }
    useLlms({ strict: fakeLlm(reply({ answer: 'tea', note: null })) })

    await expect(
      generateObject({
        schema: z.object({ answer: z.string(), note: z.string().optional() }).strict(),
        prompt: 'Extract.',
        workload: 'extraction'
      })
    ).resolves.toMatchObject({ value: { answer: 'tea' } })
  })

  it.each([
    ['truncated', reply({ answer: 'te' }, FinishReason.MAX_TOKENS)],
    ['blocked', { errorCode: 'SAFETY', finishReason: FinishReason.SAFETY }],
    ['empty', reply('')],
    ['invalid_json', reply('{"answer":')],
    ['invalid_object', reply({ answer: 7 })]
  ])('rejects a %s reply and never returns a partial object', async (reason, bad) => {
    mocks.config.llm = { main: route('haiku', haiku), fallback: null }
    useLlms({ haiku: fakeLlm(bad as LlmResponse) })

    const outcome = generateObject({ schema: Answer, prompt: 'Extract.', workload: 'extraction' })
    await expect(outcome).rejects.toBeInstanceOf(StructuredOutputError)
    await expect(outcome).rejects.toMatchObject({ reason })
  })
})
