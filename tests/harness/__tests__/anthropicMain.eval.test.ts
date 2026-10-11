import { afterEach, describe, expect, it, vi } from 'vitest'
import '../env.js'

const mocks = vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'harness-anthropic-key'
  return { create: vi.fn(), clientOptions: [] as unknown[] }
})

vi.mock('js-yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-yaml')>()
  return {
    ...actual,
    load: (raw: string) => ({
      ...(actual.load(raw) as Record<string, unknown>),
      llm: { main: 'haiku', models: { haiku: { provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'low' } } }
    })
  }
})

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>()
  class FakeAnthropic {
    messages = { create: mocks.create }

    constructor(options: unknown) {
      mocks.clientOptions.push(options)
    }
  }
  return { ...actual, default: FakeAnthropic }
})

// Embeddings and token counting would otherwise reach Google with the harness's fake key.
vi.mock('@google/genai', async (importOriginal) => {
  const offline = async () => {
    throw new Error('offline harness: no Google calls')
  }
  return {
    ...(await importOriginal<object>()),
    GoogleGenAI: class {
      models = { generateContent: offline, embedContent: offline, countTokens: offline }
    }
  }
})

import type Anthropic from '@anthropic-ai/sdk'
import { destroySession } from '../../../src/agent/session.js'
import { createMessageHandler } from '../../../src/discord/events/messageCreate.js'
import { getDb } from '../../../src/storage/database.js'
import { RateLimiter } from '../../../src/utils/rateLimiter.js'
import { createCaptureSink } from '../captureSink.js'
import { makeClient, makeGuild, makeMessage } from '../discordDoubles.js'
import { renderPayload } from '../renderPayload.js'

const CHANNEL = 'haiku-main-channel'
const REPLY = 'Ehehe, Haiku answered you through the real handlers~'

afterEach(async () => {
  await destroySession(CHANNEL)
  mocks.create.mockReset()
})

describe('a Claude Haiku main model through the real handlers', () => {
  it('answers a mention with Haiku and records the provider that answered', async () => {
    mocks.create.mockResolvedValueOnce({
      id: 'msg_harness',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      container: null,
      diagnostics: null,
      content: [
        { type: 'thinking', thinking: '', signature: 'sig-harness' },
        { type: 'text', text: REPLY, citations: null }
      ],
      stop_reason: 'end_turn',
      stop_sequence: null,
      stop_details: null,
      usage: {
        input_tokens: 900,
        output_tokens: 40,
        cache_creation_input_tokens: 4100,
        cache_read_input_tokens: 0,
        cache_creation: null,
        inference_geo: 'global',
        output_tokens_details: { thinking_tokens: 12 },
        server_tool_use: null,
        service_tier: 'standard'
      }
    } satisfies Anthropic.Message)
    const sink = createCaptureSink()

    await createMessageHandler(
      makeClient() as never,
      new RateLimiter({ rpm: 4, rpd: 1 })
    )(
      makeMessage({
        mentions: ['roka'],
        guild: makeGuild(),
        guildId: 'haiku-guild',
        content: '<@roka> Hello Haiku, are you there?',
        channelId: CHANNEL,
        sink
      }) as never
    )

    const reply = sink.all().find((record) => record.kind === 'reply')
    expect(reply).toBeDefined()
    expect(renderPayload({ ...reply!, channelId: null, ts: 0 })).toContain(REPLY)

    expect(mocks.clientOptions).toContainEqual(
      expect.objectContaining({ apiKey: 'harness-anthropic-key', maxRetries: 0 })
    )
    expect(mocks.create).toHaveBeenCalledOnce()
    const [body] = mocks.create.mock.calls[0] as [Anthropic.MessageCreateParamsNonStreaming]
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' }
    })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(Array.isArray(body.system) ? body.system[0] : undefined).toMatchObject({
      cache_control: { type: 'ephemeral' }
    })
    expect(JSON.stringify(body.messages)).toContain('Hello Haiku, are you there?')
    expect(body.tools?.length).toBeGreaterThan(0)

    expect(
      getDb()
        .prepare('SELECT provider, model_id, route_role, workload FROM response_events WHERE channel_id = ?')
        .get(CHANNEL)
    ).toEqual({ provider: 'anthropic', model_id: 'claude-haiku-5-5', route_role: 'main', workload: 'reply' })
  })
})
