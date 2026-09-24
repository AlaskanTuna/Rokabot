import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  judgeTurn: vi.fn(),
  ensureSession: vi.fn(),
  resetIdleTimer: vi.fn(),
  loadHistory: vi.fn(() => []),
  getChannelUsers: vi.fn(() => new Map()),
  getFacts: vi.fn(() => []),
  refreshFactTimestamps: vi.fn(),
  getAllUserNames: vi.fn(() => new Map()),
  getUserName: vi.fn(),
  recordMemoryEvent: vi.fn(),
  recordJevEvent: vi.fn(),
  getMessages: vi.fn(() => []),
  resolveReferences: vi.fn(() => ({ resolved: [], ambiguous: [] })),
  retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] })),
  assembleSystemPrompt: vi.fn(() => 'prompt'),
  buildFactsEnvelope: vi.fn(() => ''),
  buildOverheardBlock: vi.fn(() => ''),
  getLocalHour: vi.fn(() => 14),
  estimateTokens: vi.fn(() => 0),
  detectTone: vi.fn(() => 'playful')
}))

vi.mock('../jev/judgments.js', () => ({ judgeTurn: mocks.judgeTurn }))
vi.mock('../session.js', () => ({ ensureSession: mocks.ensureSession, resetIdleTimer: mocks.resetIdleTimer }))
vi.mock('../../storage/sessionStore.js', () => ({
  loadHistory: mocks.loadHistory,
  getChannelUsers: mocks.getChannelUsers
}))
vi.mock('../../storage/userMemory.js', () => ({
  getFacts: mocks.getFacts,
  refreshFactTimestamps: mocks.refreshFactTimestamps
}))
vi.mock('../../storage/userNames.js', () => ({
  getAllUserNames: mocks.getAllUserNames,
  getUserName: mocks.getUserName
}))
vi.mock('../../storage/metricsStore.js', () => ({ recordMemoryEvent: mocks.recordMemoryEvent }))
vi.mock('../../storage/jevEventStore.js', () => ({ recordJevEvent: mocks.recordJevEvent }))
vi.mock('../../agent/memory/identityResolver.js', () => ({ resolveReferences: mocks.resolveReferences }))
vi.mock('../../agent/memory/retriever.js', () => ({ retrieveForTurn: mocks.retrieveForTurn }))
vi.mock('../passiveBuffer.js', () => ({ getMessages: mocks.getMessages }))
vi.mock('../promptAssembler.js', () => ({ assembleSystemPrompt: mocks.assembleSystemPrompt }))
vi.mock('../promptSafety.js', () => ({
  buildFactsEnvelope: mocks.buildFactsEnvelope,
  buildOverheardBlock: mocks.buildOverheardBlock
}))
vi.mock('../../utils/timezone.js', () => ({ getLocalHour: mocks.getLocalHour }))
vi.mock('../../utils/tokens.js', () => ({ estimateTokens: mocks.estimateTokens }))
vi.mock('../toneDetector.js', () => ({ detectTone: mocks.detectTone }))

import { config } from '../../config.js'
import type { TurnJudgment } from '../jev/judgments.js'
import { applyJevTone, createTurnContext, startTurnEntryWork } from '../turnContext.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const jevConfig = config.jev as {
  tone: 'off' | 'shadow' | 'on'
  referents: 'off' | 'shadow' | 'on'
  toneMinProbability: number
}
const memoryConfig = config.memory as { claimsBackend: boolean }

function entryWork() {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    userId: 'user-1',
    speakerName: 'Alice',
    message: 'hello'
  }
}

function turnOptions(turnEntryWork: ReturnType<typeof startTurnEntryWork>) {
  return {
    channelId: 'channel-1',
    guildId: 'guild-1',
    userMessage: 'hello',
    displayName: 'Alice',
    username: 'alice',
    userId: 'user-1',
    memory: true,
    turnEntryWork
  }
}

describe('turn entry work', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    jevConfig.tone = 'shadow'
    jevConfig.referents = 'off'
    jevConfig.toneMinProbability = 0.85
    memoryConfig.claimsBackend = false
    mocks.loadHistory.mockReturnValue([])
    mocks.ensureSession.mockResolvedValue({ events: [] })
    mocks.judgeTurn.mockResolvedValue(null)
  })

  it('aborts and absorbs an in-flight judgment when an admitted turn is canceled', async () => {
    let signal: AbortSignal | undefined
    mocks.judgeTurn.mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )

    const work = startTurnEntryWork(entryWork())
    await vi.waitFor(() => expect(mocks.judgeTurn).toHaveBeenCalledOnce())
    work.cancel()

    await expect(work.judgment).resolves.toBeNull()
    expect(signal?.aborted).toBe(true)
  })

  it('resolves the pending judgment to null when the judge rejects', async () => {
    mocks.judgeTurn.mockRejectedValueOnce(new Error('offline'))

    const work = startTurnEntryWork(entryWork())

    await expect(work.judgment).resolves.toBeNull()
  })

  it('starts the judgment while session loading is still pending and consumes that same work', async () => {
    jevConfig.tone = 'on'
    const pendingSession = deferred<{ events: [] }>()
    const pendingJudgment = deferred<TurnJudgment | null>()
    mocks.ensureSession.mockReturnValue(pendingSession.promise)
    mocks.judgeTurn.mockReturnValue(pendingJudgment.promise)

    const work = startTurnEntryWork(entryWork())
    await vi.waitFor(() => expect(mocks.judgeTurn).toHaveBeenCalledOnce())
    const context = createTurnContext(turnOptions(work))
    let contextResolved = false
    void context.then(() => {
      contextResolved = true
    })

    expect(mocks.ensureSession).toHaveBeenCalledOnce()
    expect(mocks.judgeTurn).toHaveBeenCalledOnce()
    pendingSession.resolve({ events: [] })
    await Promise.resolve()
    expect(contextResolved).toBe(false)
    pendingJudgment.resolve({
      tone: { tone: 'playful', confidence: 0.55, probability: 0.85 },
      referents: [],
      latencyMs: 260,
      inputTokens: 24
    })

    await expect(context).resolves.toMatchObject({ tone: 'playful' })
    expect(mocks.judgeTurn).toHaveBeenCalledOnce()
  })

  it('gates Jev tone on the selected-choice probability', () => {
    const judgment: TurnJudgment = {
      tone: { tone: 'sincere', confidence: 0.55, probability: 0.85 },
      referents: [],
      latencyMs: 260,
      inputTokens: 24
    }

    expect(applyJevTone('playful', judgment, 'on', 0.85)).toBe('sincere')
    expect(applyJevTone('playful', judgment, 'on', 0.86)).toBe('playful')
    expect(applyJevTone('playful', { ...judgment, tone: { ...judgment.tone!, probability: null } }, 'on', 0.5)).toBe(
      'playful'
    )
    expect(applyJevTone('playful', judgment, 'shadow', 0)).toBe('playful')
    expect(applyJevTone('playful', judgment, 'off', 0)).toBe('playful')
  })

  it('persists an applied judgment with bounded decision metadata', async () => {
    jevConfig.tone = 'on'
    const judgment: TurnJudgment = {
      tone: { tone: 'sincere', confidence: 0.55, probability: 0.85 },
      referents: [],
      latencyMs: 260,
      inputTokens: 24
    }

    await createTurnContext(turnOptions({ judgment: Promise.resolve(judgment), cancel: vi.fn() }))

    expect(mocks.recordJevEvent).toHaveBeenCalledWith({
      kind: 'turn',
      guildId: 'guild-1',
      channelId: 'channel-1',
      question: JSON.stringify({ tone: true, referentCount: 0 }),
      answer: JSON.stringify({ tone: 'sincere', referentOutcomes: { total: 0, matched: 0 } }),
      probability: 0.85,
      confidence: 0.55,
      applied: true,
      latencyMs: 260,
      inputTokens: 24,
      baseline: 'playful'
    })
  })

  it('records shadow judgments as unapplied and skips null judgments', async () => {
    const judgment: TurnJudgment = {
      tone: { tone: 'sincere', confidence: 0.55, probability: 0.85 },
      referents: [],
      latencyMs: 260,
      inputTokens: 24
    }

    await createTurnContext(turnOptions({ judgment: Promise.resolve(judgment), cancel: vi.fn() }))
    expect(mocks.recordJevEvent).toHaveBeenCalledWith(expect.objectContaining({ applied: false }))

    mocks.recordJevEvent.mockClear()
    jevConfig.tone = 'on'
    await createTurnContext(turnOptions({ judgment: Promise.resolve(null), cancel: vi.fn() }))

    expect(mocks.recordJevEvent).not.toHaveBeenCalled()
  })
})
