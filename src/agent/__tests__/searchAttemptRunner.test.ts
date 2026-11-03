/**
 * The production wiring for a native search inside a real turn. Every other search test reaches the tool
 * directly or through `__setTestRunTurnFactory`, which never enters ADK's Runner, so none of them would fail if
 * `withSearchAttempt` were dropped from the `eventStream.next()` call in `roka.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // Before config loads: `config.search.provider` is read once at import time.
  process.env.SEARCH_PROVIDER = 'native'
  return {
    seen: [] as Array<{ remainingMs: number; aborted: boolean; defined: boolean }>,
    searches: vi.fn()
  }
})

vi.mock('../tools/search/native.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../tools/search/native.js')>()
  const { currentSearchAttempt } = await import('../tools/search/attemptBudget.js')
  return {
    ...original,
    nativeSearch: async (params: { query: string }) => {
      const attempt = currentSearchAttempt()
      mocks.seen.push({
        remainingMs: (attempt?.deadlineAtMs ?? 0) - performance.now(),
        aborted: attempt?.signal.aborted ?? true,
        defined: attempt !== undefined
      })
      mocks.searches(params.query)
      return {
        answer: 'Grounded answer.',
        results: [{ title: 'T', url: 'https://example.test/a', snippet: 's' }],
        resultCount: 1,
        succeeded: true
      }
    }
  }
})

vi.mock('../llm/createModel.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../llm/createModel.js')>()
  const { BaseLlm } = await import('@google/adk')
  const { FinishReason } = await import('@google/genai')

  // First call asks for a search, second answers the turn: the two-round shape a native search takes.
  class ScriptedLlm extends BaseLlm {
    private calls = 0
    constructor() {
      super({ model: 'scripted-test' })
    }
    async *generateContentAsync() {
      this.calls += 1
      if (this.calls === 1) {
        yield {
          content: {
            role: 'model',
            parts: [{ functionCall: { id: 'call_1', name: 'search_web', args: { query: 'frieren season 2' } } }]
          },
          finishReason: FinishReason.STOP
        }
        return
      }
      yield {
        content: { role: 'model', parts: [{ text: 'It premiered in January.' }] },
        finishReason: FinishReason.STOP
      }
    }
    connect(): never {
      throw new Error('ScriptedLlm does not support live connections')
    }
  }

  return { ...original, createRokaModel: () => new ScriptedLlm() }
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

vi.mock('../memory/retriever.js', () => ({
  retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] }))
}))

vi.mock('../memory/identityResolver.js', () => ({
  resolveReferences: vi.fn(() => ({ resolved: [], ambiguous: [] }))
}))

vi.mock('../media/attachmentCost.js', () => ({
  measureAttachmentTokens: vi.fn(async () => 100),
  needsMeasuring: vi.fn(() => false)
}))

vi.mock('../memory/passiveBuffer.js', () => ({ getMessages: vi.fn(() => []) }))

vi.mock('../../utils/rateLimiter.js', () => ({
  getSharedRateLimiter: () => ({ tryConsumeAboveFloor: vi.fn(() => true) })
}))

vi.mock('../../utils/timezone.js', () => ({ getLocalHour: () => 12 }))

import { config } from '../../config.js'
import type { ResolvedModel } from '../../config.js'
import { profileFor } from '../llm/profiles.js'
import { __resetModelFallbackForTest } from '../reliability.js'
import { generateResponse } from '../roka.js'
import { destroySession } from '../session.js'
import { resetForTest } from '../shutdownSignal.js'

const mutableLlm = config.llm as unknown as { main: ResolvedModel; fallback: ResolvedModel | null }
const originalMain = config.llm.main
const originalFallback = config.llm.fallback
const originalJev = config.jev as unknown as { tone: string; referents: string }
const originalTone = originalJev.tone
const originalReferents = originalJev.referents
const channelId = 'search-attempt-runner-test'

function anthropicMain(): ResolvedModel {
  const profile = profileFor('anthropic', 'claude-haiku-5-5')
  if (!profile) throw new Error('no profile for anthropic/claude-haiku-5-5')
  return {
    key: 'haiku',
    provider: 'anthropic',
    model: 'claude-haiku-5-5',
    profile,
    apiKey: 'test-key',
    timeoutMs: 30_000,
    maxOutputTokens: 300
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetForTest()
  __resetModelFallbackForTest()
  mocks.seen.length = 0
  mutableLlm.main = anthropicMain()
  mutableLlm.fallback = null
  originalJev.tone = 'off'
  originalJev.referents = 'off'
})

afterEach(async () => {
  __resetModelFallbackForTest()
  await destroySession(channelId)
  resetForTest()
  mutableLlm.main = originalMain
  mutableLlm.fallback = originalFallback
  originalJev.tone = originalTone
  originalJev.referents = originalReferents
})

describe('a native search inside a real turn', () => {
  it('runs the tool with the attempt store live and the main route time left', async () => {
    const result = await generateResponse({
      channelId,
      guildId: 'search-attempt-guild',
      memory: true,
      userMessage: 'When does Frieren season 2 start?',
      displayName: 'Mio',
      username: 'mio',
      userId: 'mio-id'
    })

    expect(mocks.searches).toHaveBeenCalledOnce()
    expect(mocks.seen).toHaveLength(1)
    expect(mocks.seen[0].defined).toBe(true)
    expect(mocks.seen[0].aborted).toBe(false)
    // Close to the main route's timeout, which is what the attempt deadline is built from.
    expect(mocks.seen[0].remainingMs).toBeGreaterThan(config.llm.main.timeoutMs - 5_000)
    expect(mocks.seen[0].remainingMs).toBeLessThanOrEqual(config.llm.main.timeoutMs)
    expect(result.text).toBe('It premiered in January.')
  })
})
