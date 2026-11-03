import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  recordResponseEvent: vi.fn(),
  canAffordAttachments: vi.fn(() => true),
  fitAttachmentsToTurn: vi.fn(),
  reservationFor: vi.fn(() => 0),
  tryReserve: vi.fn(() => true),
  releaseBytes: vi.fn(),
  markFree: vi.fn(),
  isIgnorableDiscordError: vi.fn(() => false),
  buildRokaMessage: vi.fn((content: string, ...rest: unknown[]) => ({ content, rest })),
  splitResponse: vi.fn((response: string) => [response]),
  guardMarkdown: vi.fn((text: string) => text)
}))

vi.mock('../../agent/roka.js', () => ({ generateResponse: mocks.generateResponse }))
vi.mock('../../storage/metricsStore.js', () => ({ recordResponseEvent: mocks.recordResponseEvent }))
vi.mock('../../agent/llm/tokenBudget.js', () => ({ canAffordAttachments: mocks.canAffordAttachments }))
vi.mock('../byteBudget.js', () => ({
  fitAttachmentsToTurn: mocks.fitAttachmentsToTurn,
  reservationFor: mocks.reservationFor,
  tryReserve: mocks.tryReserve,
  release: mocks.releaseBytes
}))
vi.mock('../concurrency.js', () => ({ markFree: mocks.markFree }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: mocks.isIgnorableDiscordError }))
vi.mock('../messageBuilder.js', () => ({ buildRokaMessage: mocks.buildRokaMessage }))
vi.mock('../markdownGuard.js', () => ({ guardMarkdown: mocks.guardMarkdown }))
vi.mock('../responses.js', () => ({
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error-line',
  getRandomUnsupportedAttachment: () => 'unsupported-note',
  getRandomPartialAttachment: () => 'partial-note',
  getRandomOversizedAttachment: () => 'oversized-note',
  getRandomSkippedAttachments: () => 'skipped-note',
  splitResponse: mocks.splitResponse
}))
vi.mock('../../utils/logger.js', () => ({ logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import type { ImageAttachment } from '../../agent/media/attachments.js'
import { config } from '../../config.js'
import type { RateLimiter } from '../../utils/rateLimiter.js'
import type { ModelTurn } from '../turnPipeline.js'
import { deliverTurn, releaseTurn, replyToFailedTurn, reserveTurnBudget } from '../turnPipeline.js'

const modelTurn = (overrides: Partial<ModelTurn> = {}): ModelTurn => ({
  text: 'hi',
  tone: 'neutral',
  metrics: {
    generateMs: 1,
    llmMs: 1,
    retryLatencyMs: 0,
    retries: 0,
    outcome: 'ok',
    kind: 'chat',
    tokensInEst: 1,
    tokensOutEst: 1,
    hedged: 0
  },
  toolsUsed: [],
  prefetchUsed: false,
  geminiCalledSearch: false,
  needsLookup: null,
  droppedAttachments: 0,
  truncatedAttachments: 0,
  refusedAttachments: 0,
  watchOutcome: null,
  modelCalls: 1,
  sources: [],
  replyOutcome: 'none',
  ...overrides
})

const deliveryFor = (turn: ModelTurn, overrides = {}) => ({
  turn,
  socialPostResult: { status: 'none' } as const,
  unsupported: 0,
  skipped: 0,
  ...overrides
})

const attachment = (size: number): ImageAttachment => ({
  url: 'https://cdn.example/i.png',
  contentType: 'image/png',
  size
})

const limiterWith = (release: () => void) => ({ reserveCalls: vi.fn(() => ({ release })) }) as unknown as RateLimiter

beforeEach(() => {
  vi.clearAllMocks()
  mocks.splitResponse.mockImplementation((response: string) => [response])
  mocks.buildRokaMessage.mockImplementation((content: string, ...rest: unknown[]) => ({ content, rest }))
  mocks.guardMarkdown.mockImplementation((text: string) => text)
  mocks.isIgnorableDiscordError.mockReturnValue(false)
  mocks.canAffordAttachments.mockReturnValue(true)
  mocks.fitAttachmentsToTurn.mockReturnValue({ kept: [], skipped: 0 })
  mocks.reservationFor.mockReturnValue(0)
  mocks.tryReserve.mockReturnValue(true)
})

describe('deliverTurn', () => {
  it('sends the first chunk with footer inputs and later chunks without them', async () => {
    mocks.splitResponse.mockReturnValue(['one', 'two'])
    const sendFirst = vi.fn()
    const sendRest = vi.fn()
    const turn = modelTurn({ toolsUsed: ['search'], sources: [{ title: 'Post', url: 'https://x.example/post' }] })

    await deliverTurn(deliveryFor(turn), 'channel-1', { sendFirst, sendRest })

    expect(mocks.buildRokaMessage).toHaveBeenCalledTimes(2)
    expect(mocks.buildRokaMessage.mock.calls[0]).toEqual([
      'one',
      'neutral',
      ['search'],
      [{ title: 'Post', url: 'https://x.example/post' }],
      { status: 'none' },
      'none',
      null
    ])
    expect(mocks.buildRokaMessage.mock.calls[1]).toEqual(['two', 'neutral'])
    expect(sendFirst).toHaveBeenCalledTimes(1)
    expect(sendRest).toHaveBeenCalledTimes(1)
  })

  it('joins notes in the order unsupported, partial, oversized, skipped', async () => {
    const turn = modelTurn({ text: 'answer', droppedAttachments: 1, truncatedAttachments: 1, refusedAttachments: 1 })

    await deliverTurn(deliveryFor(turn, { unsupported: 1, skipped: 1 }), 'channel-1', {
      sendFirst: vi.fn(),
      sendRest: vi.fn()
    })

    expect(mocks.splitResponse.mock.calls[0][0]).toBe(
      'answer\n\nunsupported-note\n\npartial-note\n\noversized-note\n\nskipped-note'
    )
  })

  it('builds no later chunks when sendRest is undefined', async () => {
    mocks.splitResponse.mockReturnValue(['one', 'two', 'three'])
    const sendFirst = vi.fn()

    await deliverTurn(deliveryFor(modelTurn()), 'channel-1', { sendFirst, sendRest: undefined })

    expect(sendFirst).toHaveBeenCalledTimes(1)
    expect(mocks.buildRokaMessage).toHaveBeenCalledTimes(1)
  })
})

describe('reserveTurnBudget', () => {
  it('calls onDeclined before release(0) on a byte refusal', () => {
    const kept = [attachment(10)]
    mocks.fitAttachmentsToTurn.mockReturnValue({ kept, skipped: 0 })
    mocks.reservationFor.mockReturnValue(10)
    mocks.tryReserve.mockReturnValue(false)
    const release = vi.fn()
    const onDeclined = vi.fn()

    const result = reserveTurnBudget({
      channelId: 'channel-1',
      attachments: kept,
      rateLimiter: limiterWith(release),
      onDeclined
    })

    expect(result).toBeUndefined()
    expect(onDeclined).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledWith(0)
    expect(onDeclined.mock.invocationCallOrder[0]).toBeLessThan(release.mock.invocationCallOrder[0])
  })

  it('takes slots before bytes', () => {
    const kept = [attachment(10)]
    mocks.fitAttachmentsToTurn.mockReturnValue({ kept, skipped: 0 })
    mocks.reservationFor.mockReturnValue(10)
    const reserveCalls = vi.fn(() => ({ release: vi.fn() }))
    const limiter = { reserveCalls } as unknown as RateLimiter

    const result = reserveTurnBudget({
      channelId: 'channel-1',
      attachments: kept,
      rateLimiter: limiter,
      onDeclined: vi.fn()
    })

    expect(result).toBeDefined()
    expect(reserveCalls).toHaveBeenCalledWith(config.gemini.maxLlmCalls)
    expect(mocks.reservationFor).toHaveBeenCalledWith(kept)
    expect(reserveCalls.mock.invocationCallOrder[0]).toBeLessThan(mocks.reservationFor.mock.invocationCallOrder[0])
    expect(mocks.reservationFor.mock.invocationCallOrder[0]).toBeLessThan(mocks.tryReserve.mock.invocationCallOrder[0])
  })

  it('passes a fully skipped attachment past a spent token budget and reserves 0 bytes', () => {
    mocks.fitAttachmentsToTurn.mockReturnValue({ kept: [], skipped: 2 })
    mocks.canAffordAttachments.mockReturnValue(false)
    const release = vi.fn()

    const result = reserveTurnBudget({
      channelId: 'channel-1',
      attachments: [attachment(10)],
      rateLimiter: limiterWith(release),
      onDeclined: vi.fn()
    })

    expect(mocks.canAffordAttachments).not.toHaveBeenCalled()
    expect(mocks.tryReserve).toHaveBeenCalledWith(0)
    expect(result).toMatchObject({ attachments: [], skippedAttachments: 2, reservedBytes: 0 })
  })

  it('declines an attachment turn the token budget cannot afford without taking slots', () => {
    const kept = [attachment(10)]
    mocks.fitAttachmentsToTurn.mockReturnValue({ kept, skipped: 0 })
    mocks.canAffordAttachments.mockReturnValue(false)
    const reserveCalls = vi.fn()
    const onDeclined = vi.fn()

    const result = reserveTurnBudget({
      channelId: 'channel-1',
      attachments: kept,
      rateLimiter: { reserveCalls } as unknown as RateLimiter,
      onDeclined
    })

    expect(result).toBeUndefined()
    expect(onDeclined).toHaveBeenCalledTimes(1)
    expect(reserveCalls).not.toHaveBeenCalled()
  })
})

describe('replyToFailedTurn', () => {
  it('sends the error line for a plain failure', async () => {
    const send = vi.fn().mockResolvedValue(undefined)

    await replyToFailedTurn(new Error('boom'), { channelId: 'channel-1', label: 'Error handling message', send })

    expect(send).toHaveBeenCalledWith('error-line')
  })

  it('sends nothing for an ignorable error', async () => {
    mocks.isIgnorableDiscordError.mockReturnValue(true)
    const send = vi.fn()

    await replyToFailedTurn(Object.assign(new Error('Unknown Message'), { code: 10008 }), {
      channelId: 'channel-1',
      label: 'Error handling message',
      send
    })

    expect(send).not.toHaveBeenCalled()
  })

  it('logs without rethrowing when the error reply fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('send down'))

    await expect(
      replyToFailedTurn(new Error('boom'), { channelId: 'channel-1', label: 'Error handling message', send })
    ).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('releaseTurn', () => {
  it('frees the channel, the bytes and the slots', () => {
    const release = vi.fn()

    releaseTurn({ channelId: 'channel-1', reservedBytes: 50, callReservation: { release }, modelCallsUsed: 2 })

    expect(mocks.markFree).toHaveBeenCalledWith('channel-1')
    expect(mocks.releaseBytes).toHaveBeenCalledWith(50)
    expect(release).toHaveBeenCalledWith(2)
  })

  it('tolerates a turn that never reserved calls', () => {
    expect(() =>
      releaseTurn({ channelId: 'channel-1', reservedBytes: 0, callReservation: undefined, modelCallsUsed: 4 })
    ).not.toThrow()
    expect(mocks.markFree).toHaveBeenCalledWith('channel-1')
  })
})
