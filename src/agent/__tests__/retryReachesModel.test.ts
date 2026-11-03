/**
 * Retries and the fallback switch through the real Runner. The reliability tests use `__setTestRunTurnFactory`,
 * which never enters ADK, so they cannot see whether a retry reaches a model at all.
 */

import type { LlmRequest } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Reply = Record<string, unknown>

const mocks = vi.hoisted(() => {
  process.env.SEARCH_PROVIDER = 'off'
  return {
    mainReplies: [] as Reply[],
    fallbackReplies: [] as Reply[],
    mainRequests: [] as LlmRequest[],
    fallbackRequests: [] as LlmRequest[],
    hasFallback: true
  }
})

vi.mock('../llm/createModel.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../llm/createModel.js')>()
  const { BaseLlm } = await import('@google/adk')
  const { RoutedLlm } = await import('../fallbackModel.js')

  class ScriptedLlm extends BaseLlm {
    constructor(
      model: string,
      private readonly replies: Reply[],
      private readonly requests: LlmRequest[]
    ) {
      super({ model })
    }
    async *generateContentAsync(request: LlmRequest) {
      this.requests.push(structuredClone(request.contents) as unknown as LlmRequest)
      const reply = this.replies.shift()
      if (!reply) throw new Error(`${this.model} has no scripted reply left`)
      yield reply
    }
    connect(): never {
      throw new Error('ScriptedLlm does not support live connections')
    }
  }

  return {
    ...original,
    createRokaModel: () => {
      const model = new RoutedLlm(
        new ScriptedLlm('main-test', mocks.mainReplies, mocks.mainRequests),
        new ScriptedLlm('fallback-test', mocks.fallbackReplies, mocks.fallbackRequests)
      )
      Object.defineProperty(model, 'hasFallback', { get: () => mocks.hasFallback })
      return model
    }
  }
})

vi.mock('../jev/judgments.js', () => ({ judgeTurn: vi.fn(async () => undefined) }))
vi.mock('../../storage/sessionStore.js', () => ({
  getChannelUsers: vi.fn(() => new Map()),
  loadHistory: vi.fn(() => []),
  saveMessage: vi.fn()
}))
vi.mock('../../storage/userNames.js', () => ({
  getAllUserNames: vi.fn(() => new Map()),
  getUserName: vi.fn(() => null)
}))
vi.mock('../../storage/metricsStore.js', () => ({
  recordMemoryEvent: vi.fn(),
  recordFailureDiagnostic: vi.fn()
}))
vi.mock('../memory/retriever.js', () => ({ retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] })) }))
vi.mock('../memory/identityResolver.js', () => ({ resolveReferences: vi.fn(() => ({ resolved: [], ambiguous: [] })) }))
vi.mock('../attachmentCost.js', () => ({
  measureAttachmentTokens: vi.fn(async () => 100),
  needsMeasuring: vi.fn(() => false)
}))
vi.mock('../passiveBuffer.js', () => ({ getMessages: vi.fn(() => []) }))
vi.mock('../../utils/rateLimiter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/rateLimiter.js')>()),
  getSharedRateLimiter: () => ({ tryConsumeAboveFloor: () => true })
}))
vi.mock('../../utils/timezone.js', () => ({ getLocalHour: () => 12 }))

import { config } from '../../config.js'
import { __resetModelFallbackForTest } from '../reliability.js'
import { generateResponse } from '../roka.js'
import { APP_NAME } from '../session.js'
import { destroySession, sessionService } from '../session.js'
import { resetForTest } from '../shutdownSignal.js'

const channelId = 'retry-reaches-model-test'
const mutableGemini = config.gemini as unknown as { retryBackoffBaseMs: number; retryBackoffCapMs: number }
const originalBackoff = { base: mutableGemini.retryBackoffBaseMs, cap: mutableGemini.retryBackoffCapMs }
const failure = { errorCode: '503', errorMessage: 'unavailable' }
const answer = (text: string) => ({ content: { role: 'model', parts: [{ text }] } })

function ask(userMessage = 'When does Frieren season 2 start?') {
  return generateResponse({
    channelId,
    guildId: 'retry-guild',
    memory: false,
    userMessage,
    displayName: 'Mio',
    username: 'mio',
    userId: 'mio-id'
  })
}

async function userEventsInSession(): Promise<number> {
  const session = await sessionService.getSession({ appName: APP_NAME, userId: channelId, sessionId: channelId })
  return (session?.events ?? []).filter((event) => event.author === 'user').length
}

beforeEach(() => {
  resetForTest()
  __resetModelFallbackForTest()
  mocks.mainReplies.length = 0
  mocks.fallbackReplies.length = 0
  mocks.mainRequests.length = 0
  mocks.fallbackRequests.length = 0
  mocks.hasFallback = true
  mutableGemini.retryBackoffBaseMs = 1
  mutableGemini.retryBackoffCapMs = 1
})

afterEach(async () => {
  __resetModelFallbackForTest()
  await destroySession(channelId)
  resetForTest()
  mutableGemini.retryBackoffBaseMs = originalBackoff.base
  mutableGemini.retryBackoffCapMs = originalBackoff.cap
})

describe('a turn whose first attempt fails', () => {
  it('asks the fallback model, which answers the turn', async () => {
    mocks.mainReplies.push(failure)
    mocks.fallbackReplies.push(answer('It premiered in January.'))

    const result = await ask()

    expect(mocks.fallbackRequests).toHaveLength(1)
    expect(result.text).toBe('It premiered in January.')
  })

  it('stores the speaker message once, however many attempts the turn takes', async () => {
    mocks.mainReplies.push(failure)
    mocks.fallbackReplies.push(answer('It premiered in January.'))

    await ask()

    expect(await userEventsInSession()).toBe(1)
    const texts = JSON.stringify(mocks.fallbackRequests[0])
    expect(texts.match(/When does Frieren season 2 start\?/g)).toHaveLength(1)
  })

  it('retries on the same model when there is no fallback', async () => {
    mocks.hasFallback = false
    mocks.mainReplies.push(failure, answer('It premiered in January.'))

    const result = await ask()

    expect(mocks.mainRequests).toHaveLength(2)
    expect(mocks.fallbackRequests).toHaveLength(0)
    expect(result.text).toBe('It premiered in January.')
    expect(await userEventsInSession()).toBe(1)
  })

  it('carries a tool result into the fallback instead of running the tool again', async () => {
    mocks.mainReplies.push(
      { content: { role: 'model', parts: [{ functionCall: { id: 'call_1', name: 'get_current_time', args: {} } }] } },
      failure
    )
    mocks.fallbackReplies.push(answer('It is late.'))

    const result = await ask('What time is it?')

    expect(result.text).toBe('It is late.')
    const sent = JSON.stringify(mocks.fallbackRequests[0])
    expect(sent.match(/What time is it\?/g)).toHaveLength(1)
    expect(sent).toContain('functionResponse')
    const session = await sessionService.getSession({ appName: APP_NAME, userId: channelId, sessionId: channelId })
    const toolResults = (session?.events ?? []).filter((event) =>
      event.content?.parts?.some((part) => part.functionResponse)
    )
    expect(toolResults).toHaveLength(1)
  })
})
