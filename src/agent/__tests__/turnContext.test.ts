import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  judgeTurn: vi.fn(),
  ensureSession: vi.fn(),
  resetIdleTimer: vi.fn(),
  loadHistory: vi.fn(() => []),
  getChannelUsers: vi.fn(() => new Map()),
  getAllUserNames: vi.fn(() => new Map()),
  getUserName: vi.fn(),
  recordMemoryEvent: vi.fn(),
  recordJevEvent: vi.fn(),
  getMessages: vi.fn(() => []),
  embedEpisodeText: vi.fn(),
  buildEpisodeRecallBlock: vi.fn(() => ''),
  buildMediaRecallBlock: vi.fn(() => ''),
  resolveReferences: vi.fn(() => ({ resolved: [], ambiguous: [] })),
  retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] })),
  retrieveGuildFacts: vi.fn(() => ({ facts: [], tokensEst: 0 })),
  assembleSystemPrompt: vi.fn(() => 'prompt'),
  runPrefetchForJudgment: vi.fn(),
  decidePrefetch: vi.fn(
    (judgment: { needsLookup: number | null } | null, mode: 'off' | 'shadow' | 'on', threshold: number) => {
      if (mode === 'off') return { fire: false, reason: 'off' }
      if (!judgment) return { fire: false, reason: 'no_judgment' }
      if (judgment.needsLookup === null) return { fire: false, reason: 'no_noul' }
      if (judgment.needsLookup < threshold) return { fire: false, reason: 'below_threshold' }
      return mode === 'on' ? { fire: true, reason: 'fired' } : { fire: false, reason: 'shadow_would_fire' }
    }
  ),
  settlePrefetch: vi.fn(),
  buildLookedUpBlock: vi.fn(() => '## Looked It Up\nIt premiered in January.'),
  buildFactsEnvelope: vi.fn(() => ''),
  buildOverheardBlock: vi.fn(() => ''),
  getLocalHour: vi.fn(() => 14),
  getLocalDate: vi.fn(() => '2026-09-26'),
  estimateTokens: vi.fn(() => 0),
  detectTone: vi.fn(() => 'playful'),
  recallForTurn: vi.fn((_input: { queryEmbedding: readonly number[] | null }) => ({
    items: [],
    block: '',
    trace: { nCandidates: 0, gated: 0, fallback: false, tokensEst: 0 }
  })),
  touchRecalled: vi.fn()
}))

vi.mock('../jev/judgments.js', () => ({ judgeTurn: mocks.judgeTurn }))
vi.mock('../session.js', () => ({ ensureSession: mocks.ensureSession, resetIdleTimer: mocks.resetIdleTimer }))
vi.mock('../../storage/sessionStore.js', () => ({
  loadHistory: mocks.loadHistory,
  getChannelUsers: mocks.getChannelUsers
}))
vi.mock('../../storage/userNames.js', () => ({
  getAllUserNames: mocks.getAllUserNames,
  getUserName: mocks.getUserName
}))
vi.mock('../../storage/metricsStore.js', () => ({ recordMemoryEvent: mocks.recordMemoryEvent }))
vi.mock('../../storage/jevEventStore.js', () => ({ recordJevEvent: mocks.recordJevEvent }))
vi.mock('../../agent/memory/identityResolver.js', () => ({ resolveReferences: mocks.resolveReferences }))
vi.mock('../../agent/memory/retriever.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  retrieveForTurn: mocks.retrieveForTurn,
  retrieveGuildFacts: mocks.retrieveGuildFacts
}))
vi.mock('../memory/episodeEmbeddings.js', () => ({ embedEpisodeText: mocks.embedEpisodeText }))
vi.mock('../memory/episodeRetriever.js', () => ({ buildEpisodeRecallBlock: mocks.buildEpisodeRecallBlock }))
vi.mock('../memory/mediaRecall.js', () => ({ buildMediaRecallBlock: mocks.buildMediaRecallBlock }))
vi.mock('../memory/recall.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  recallForTurn: mocks.recallForTurn
}))
vi.mock('../memory/memoryClaims.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  touchRecalled: mocks.touchRecalled
}))
vi.mock('../passiveBuffer.js', () => ({ getMessages: mocks.getMessages }))
vi.mock('../promptAssembler.js', () => ({ assembleSystemPrompt: mocks.assembleSystemPrompt }))
vi.mock('../promptSafety.js', () => ({
  buildFactsEnvelope: mocks.buildFactsEnvelope,
  buildOverheardBlock: mocks.buildOverheardBlock
}))
vi.mock('../../utils/timezone.js', () => ({ getLocalHour: mocks.getLocalHour, getLocalDate: mocks.getLocalDate }))
vi.mock('../../utils/tokens.js', () => ({ estimateTokens: mocks.estimateTokens }))
vi.mock('../toneDetector.js', () => ({ detectTone: mocks.detectTone }))
vi.mock('../searchPrefetch.js', () => ({
  runPrefetchForJudgment: mocks.runPrefetchForJudgment,
  decidePrefetch: mocks.decidePrefetch,
  settlePrefetch: mocks.settlePrefetch,
  buildLookedUpBlock: mocks.buildLookedUpBlock
}))

import { config } from '../../config.js'
import type { TurnJudgment } from '../jev/judgments.js'
import { withSearchCitations } from '../searchCitations.js'
import { applyJevTone, awaitTurnPrefetch, createTurnContext, startTurnEntryWork } from '../turnContext.js'

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
  prefetch: 'off' | 'shadow' | 'on'
  prefetchMinNoul: number
  prefetchWaitMs: number
  toneMinProbability: number
}

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
    jevConfig.prefetch = 'shadow'
    jevConfig.prefetchMinNoul = 0.7
    jevConfig.prefetchWaitMs = 4000
    jevConfig.toneMinProbability = 0.85
    mocks.loadHistory.mockReturnValue([])
    mocks.ensureSession.mockResolvedValue({ events: [] })
    mocks.retrieveGuildFacts.mockReturnValue({ facts: [], tokensEst: 0 })
    mocks.judgeTurn.mockResolvedValue(null)
    mocks.embedEpisodeText.mockResolvedValue(Array.from({ length: 768 }, () => 0.25))
    mocks.buildEpisodeRecallBlock.mockReturnValue('')
    mocks.buildMediaRecallBlock.mockReturnValue('')
    mocks.runPrefetchForJudgment.mockResolvedValue({ decision: { fire: false, reason: 'no_judgment' }, outcome: null })
    mocks.settlePrefetch.mockImplementation((prefetch: Promise<unknown>) => prefetch)
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

  it('starts query embedding alongside Jev work only when episode recall is enabled', async () => {
    const pendingJudgment = deferred<TurnJudgment | null>()
    const vector = Array.from({ length: 768 }, () => 0.25)
    mocks.judgeTurn.mockReturnValue(pendingJudgment.promise)
    mocks.embedEpisodeText.mockResolvedValue(vector)

    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })

    await vi.waitFor(() => {
      expect(mocks.judgeTurn).toHaveBeenCalledOnce()
      expect(mocks.embedEpisodeText).toHaveBeenCalledOnce()
    })
    expect(mocks.embedEpisodeText).toHaveBeenCalledWith({
      text: 'hello',
      role: 'RETRIEVAL_QUERY',
      signal: expect.any(AbortSignal)
    })
    await expect(work.queryEmbedding).resolves.toEqual(vector)
    pendingJudgment.resolve(null)
    await expect(work.judgment).resolves.toBeNull()

    const disabled = startTurnEntryWork(entryWork())
    expect(disabled.queryEmbedding).toBeUndefined()
    expect(mocks.embedEpisodeText).toHaveBeenCalledOnce()
  })

  it('aborts Jev and query embedding through separate signals when canceled', async () => {
    let judgmentSignal: AbortSignal | undefined
    let embeddingSignal: AbortSignal | undefined
    mocks.judgeTurn.mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          judgmentSignal = options?.signal
          judgmentSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )
    mocks.embedEpisodeText.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          embeddingSignal = signal
          signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
    )

    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })
    await vi.waitFor(() => {
      expect(judgmentSignal).toBeDefined()
      expect(embeddingSignal).toBeDefined()
    })
    work.cancel()

    await expect(work.judgment).resolves.toBeNull()
    await expect(work.queryEmbedding).resolves.toBeNull()
    expect(judgmentSignal?.aborted).toBe(true)
    expect(embeddingSignal?.aborted).toBe(true)
  })

  it('resolves the pending judgment to null when the judge rejects', async () => {
    mocks.judgeTurn.mockRejectedValueOnce(new Error('offline'))

    const work = startTurnEntryWork(entryWork())

    await expect(work.judgment).resolves.toBeNull()
  })

  it('arms the prefetch from the same judgment and uses the lookup query', async () => {
    jevConfig.prefetch = 'on'
    mocks.judgeTurn.mockResolvedValue({
      tone: { tone: 'curious', confidence: 0.8, probability: 0.8 },
      referents: [],
      needsLookup: 0.95,
      latencyMs: 3,
      inputTokens: 12
    })
    mocks.runPrefetchForJudgment.mockResolvedValue({
      decision: { fire: true, reason: 'fired' },
      outcome: { status: 'ready', text: 'It premiered in January.', sources: [{ title: 'C', url: 'https://c.test' }] }
    })

    const work = startTurnEntryWork({
      ...entryWork(),
      message: 'When did Frieren season 2 air? [Container: forwarded context]',
      lookupQuery: 'when did frieren season 2 air?'
    })

    await expect(work.judgment).resolves.toMatchObject({ needsLookup: 0.95 })
    expect(work.needsLookup).toBe(0.95)
    await expect(work.prefetch).resolves.toMatchObject({ decision: { fire: true } })
    expect(mocks.judgeTurn).toHaveBeenCalledOnce()
    expect(mocks.runPrefetchForJudgment.mock.calls[0]?.[0]).toMatchObject({ needsLookup: 0.95 })
    expect(mocks.runPrefetchForJudgment.mock.calls[0]?.[2]).toMatchObject({
      query: 'when did frieren season 2 air?'
    })
  })

  it('resolves off and shadow decisions without searching', async () => {
    jevConfig.tone = 'off'
    mocks.judgeTurn.mockResolvedValue({ tone: null, referents: [], needsLookup: 0.99, latencyMs: 1, inputTokens: 5 })
    mocks.runPrefetchForJudgment
      .mockResolvedValueOnce({ decision: { fire: false, reason: 'off' }, outcome: null })
      .mockResolvedValueOnce({ decision: { fire: false, reason: 'shadow_would_fire' }, outcome: null })

    jevConfig.prefetch = 'off'
    const off = startTurnEntryWork({ ...entryWork(), channelId: 'off-channel' })
    await expect(off.prefetch).resolves.toMatchObject({ decision: { fire: false, reason: 'off' }, outcome: null })
    expect(mocks.judgeTurn).not.toHaveBeenCalled()

    jevConfig.prefetch = 'shadow'
    const shadow = startTurnEntryWork({ ...entryWork(), channelId: 'shadow-channel' })
    await expect(shadow.prefetch).resolves.toMatchObject({
      decision: { fire: false, reason: 'shadow_would_fire' },
      outcome: null
    })
    expect(mocks.judgeTurn).toHaveBeenCalledOnce()
    expect(mocks.judgeTurn.mock.calls[0]?.[0].includeLookup).toBe(true)
    expect(mocks.runPrefetchForJudgment).toHaveBeenCalledTimes(2)
  })

  it('aborts the in-flight prefetch when the turn is canceled', async () => {
    jevConfig.prefetch = 'on'
    let signal: AbortSignal | undefined
    mocks.judgeTurn.mockResolvedValue({ tone: null, referents: [], needsLookup: 0.95, latencyMs: 1, inputTokens: 5 })
    mocks.runPrefetchForJudgment.mockImplementation(
      (_judgment, _context, options) =>
        new Promise((resolve) => {
          const activeSignal: AbortSignal = options.signal
          signal = activeSignal
          activeSignal.addEventListener(
            'abort',
            () => resolve({ decision: { fire: true, reason: 'fired' }, outcome: { status: 'canceled' } }),
            { once: true }
          )
        })
    )

    const work = startTurnEntryWork(entryWork())
    await work.judgment
    await vi.waitFor(() => expect(mocks.runPrefetchForJudgment).toHaveBeenCalledOnce())
    work.cancel()

    await expect(work.prefetch).resolves.toMatchObject({ outcome: { status: 'canceled' } })
    expect(signal?.aborted).toBe(true)
  })

  it('records ready prefetch sources inside the citation scope', async () => {
    jevConfig.prefetch = 'on'
    const controller = new AbortController()
    const work = {
      judgment: Promise.resolve(null),
      prefetch: Promise.resolve({
        decision: { fire: true, reason: 'fired' as const },
        outcome: {
          status: 'ready' as const,
          text: 'It premiered in January.',
          sources: [{ title: 'C', url: 'https://c.test' }]
        }
      }),
      cancel: () => controller.abort()
    }
    mocks.settlePrefetch.mockImplementation((prefetch: Promise<unknown>) => prefetch)

    const [result, citations] = await withSearchCitations(() => awaitTurnPrefetch(work as never, 'channel-1'))

    expect(result).toMatchObject({
      block: expect.stringContaining('## Looked It Up'),
      usedTool: true,
      result: { decision: { fire: true, reason: 'fired' }, outcome: { status: 'ready' } }
    })
    expect(citations).toEqual([{ title: 'C', url: 'https://c.test' }])
  })

  it('injects the looked-up block at rung zero and drops it on the safety rung', async () => {
    jevConfig.prefetch = 'on'
    mocks.judgeTurn.mockResolvedValue({ tone: null, referents: [], needsLookup: 0.95, latencyMs: 1, inputTokens: 5 })
    mocks.runPrefetchForJudgment.mockResolvedValue({
      decision: { fire: true, reason: 'fired' },
      outcome: { status: 'ready', text: 'It premiered in January.', sources: [{ title: 'C', url: 'https://c.test' }] }
    })

    const context = await createTurnContext(turnOptions(startTurnEntryWork(entryWork())))

    expect(context.systemPrompt).toContain('## Looked It Up')
    expect(context.composePrompt(1)).not.toContain('## Looked It Up')
  })

  it('adds the guild episode block after its query embedding is ready', async () => {
    const vector = Array.from({ length: 768 }, () => 0.25)
    const block = '## Things you remember happening here\nThe group planned a picnic.'
    mocks.embedEpisodeText.mockResolvedValue(vector)
    mocks.buildEpisodeRecallBlock.mockReturnValue(block)
    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })

    const context = await createTurnContext(turnOptions(work))

    expect(mocks.buildEpisodeRecallBlock).toHaveBeenCalledWith({
      guildId: 'guild-1',
      queryEmbedding: vector,
      scope: { guildId: 'guild-1', channelId: 'channel-1' }
    })
    expect(context.systemPrompt).toContain(block)
    expect(context.composePrompt(2)).not.toContain(block)
  })

  it('adds the guild media block right after the episode block from the same query embedding', async () => {
    const vector = Array.from({ length: 768 }, () => 0.25)
    const episodeBlock = '## Things you remember happening here\nThe group planned a picnic.'
    const mediaBlock = '## Media You Watched Here Before\n["the picnic clip"]'
    mocks.embedEpisodeText.mockResolvedValue(vector)
    mocks.buildEpisodeRecallBlock.mockReturnValue(episodeBlock)
    mocks.buildMediaRecallBlock.mockReturnValue(mediaBlock)
    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })

    const context = await createTurnContext(turnOptions(work))

    expect(mocks.embedEpisodeText).toHaveBeenCalledOnce()
    expect(mocks.buildMediaRecallBlock).toHaveBeenCalledWith({
      guildId: 'guild-1',
      queryEmbedding: vector,
      scope: { guildId: 'guild-1', channelId: 'channel-1' }
    })
    expect(context.systemPrompt).toContain(`${episodeBlock}\n\n${mediaBlock}`)
    expect(context.composePrompt(1)).toContain(mediaBlock)
    expect(context.composePrompt(2)).not.toContain(mediaBlock)
    expect(context.composePrompt(3)).not.toContain(mediaBlock)
  })

  it('skips the media block for a direct message even when its query embedding is ready', async () => {
    const mediaBlock = '## Media You Watched Here Before\n["the picnic clip"]'
    mocks.buildMediaRecallBlock.mockReturnValue(mediaBlock)
    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })

    const context = await createTurnContext({ ...turnOptions(work), guildId: 'dm:user-1' })

    expect(mocks.buildEpisodeRecallBlock).not.toHaveBeenCalled()
    expect(mocks.buildMediaRecallBlock).not.toHaveBeenCalled()
    expect(context.systemPrompt).not.toContain(mediaBlock)
  })

  it('omits episode context when query embedding fails', async () => {
    mocks.embedEpisodeText.mockRejectedValue(new Error('embedding unavailable'))
    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })

    const context = await createTurnContext(turnOptions(work))

    expect(mocks.buildEpisodeRecallBlock).not.toHaveBeenCalled()
    expect(mocks.buildMediaRecallBlock).not.toHaveBeenCalled()
    expect(context.systemPrompt).not.toContain('Things you remember happening here')
  })

  it('finishes context after the query embedding timeout with no episode block', async () => {
    vi.useFakeTimers()
    mocks.embedEpisodeText.mockImplementation(() => new Promise(() => undefined))
    const work = startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })
    const contextPromise = createTurnContext(turnOptions(work))

    await vi.advanceTimersByTimeAsync(config.memory.embeddingTimeoutMs)
    const context = await contextPromise

    expect(mocks.buildEpisodeRecallBlock).not.toHaveBeenCalled()
    expect(context.systemPrompt).not.toContain('Things you remember happening here')
    vi.useRealTimers()
  })

  it('does not await or build episode context for a memory-free turn', async () => {
    const queryEmbedding = new Promise<number[] | null>(() => undefined)
    const work = {
      judgment: Promise.resolve(null),
      prefetch: Promise.resolve({ decision: { fire: false as const, reason: 'off' as const }, outcome: null }),
      queryEmbedding,
      cancel: vi.fn()
    }

    const context = await createTurnContext({ ...turnOptions(work), memory: false })

    expect(mocks.buildEpisodeRecallBlock).not.toHaveBeenCalled()
    expect(mocks.buildMediaRecallBlock).not.toHaveBeenCalled()
    expect(mocks.retrieveForTurn).not.toHaveBeenCalled()
    expect(context.systemPrompt).not.toContain('Things you remember happening here')
  })

  it.each([
    ['empty', { status: 'empty' }],
    ['failed', { status: 'failed', error: 'boom' }],
    ['aborted', { status: 'aborted' }],
    ['canceled', { status: 'canceled' }]
  ])('injects nothing for a %s prefetch', async (_label, outcome) => {
    jevConfig.prefetch = 'on'
    const work = {
      judgment: Promise.resolve(null),
      prefetch: Promise.resolve({ decision: { fire: true, reason: 'fired' as const }, outcome }),
      cancel: vi.fn()
    }
    mocks.settlePrefetch.mockImplementation((prefetch: Promise<unknown>) => prefetch)

    await expect(awaitTurnPrefetch(work as never, 'channel-1')).resolves.toMatchObject({
      block: '',
      usedTool: false,
      result: { decision: { fire: true, reason: 'fired' }, outcome }
    })
  })

  it('gives up at the configured bound and cancels late work', async () => {
    jevConfig.prefetch = 'on'
    jevConfig.prefetchWaitMs = 1
    const controller = new AbortController()
    const work = {
      judgment: Promise.resolve(null),
      prefetch: new Promise(() => undefined),
      cancel: vi.fn(() => controller.abort())
    }
    mocks.settlePrefetch.mockResolvedValue(null)

    await expect(awaitTurnPrefetch(work as never, 'channel-1')).resolves.toMatchObject({
      block: '',
      usedTool: false,
      result: null
    })
    expect(mocks.settlePrefetch).toHaveBeenCalledWith(work.prefetch, 1)
    expect(work.cancel).toHaveBeenCalledOnce()
    expect(controller.signal.aborted).toBe(true)
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
      needsLookup: null,
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
      needsLookup: null,
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
      needsLookup: null,
      latencyMs: 260,
      inputTokens: 24
    }

    await createTurnContext(
      turnOptions({
        judgment: Promise.resolve(judgment),
        prefetch: Promise.resolve({ decision: { fire: false, reason: 'no_judgment' }, outcome: null }),
        cancel: vi.fn()
      })
    )

    expect(mocks.recordJevEvent).toHaveBeenCalledWith({
      kind: 'turn',
      guildId: 'guild-1',
      channelId: 'channel-1',
      question: JSON.stringify({ tone: true, referentCount: 0, prefetch: 'shadow' }),
      answer: JSON.stringify({
        tone: 'sincere',
        referentOutcomes: { total: 0, matched: 0 },
        needsLookup: null,
        prefetchStatus: 'no_noul'
      }),
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
      needsLookup: null,
      latencyMs: 260,
      inputTokens: 24
    }

    await createTurnContext(
      turnOptions({
        judgment: Promise.resolve(judgment),
        prefetch: Promise.resolve({ decision: { fire: false, reason: 'no_judgment' }, outcome: null }),
        cancel: vi.fn()
      })
    )
    expect(mocks.recordJevEvent).toHaveBeenCalledWith(expect.objectContaining({ applied: false }))

    mocks.recordJevEvent.mockClear()
    jevConfig.tone = 'on'
    await createTurnContext(
      turnOptions({
        judgment: Promise.resolve(null),
        prefetch: Promise.resolve({ decision: { fire: false, reason: 'no_judgment' }, outcome: null }),
        cancel: vi.fn()
      })
    )

    expect(mocks.recordJevEvent).not.toHaveBeenCalled()
  })

  it('persists needs_lookup and the bounded on-mode outcome without raw message text', async () => {
    jevConfig.tone = 'off'
    jevConfig.referents = 'off'
    jevConfig.prefetch = 'on'
    mocks.judgeTurn.mockResolvedValue({
      tone: { tone: 'curious', confidence: 0.8, probability: 0.82 },
      referents: [],
      needsLookup: 0.95,
      latencyMs: 4,
      inputTokens: 11
    })
    mocks.runPrefetchForJudgment.mockResolvedValue({
      decision: { fire: true, reason: 'fired' },
      outcome: { status: 'ready', text: 'It premiered in January.', sources: [{ title: 'C', url: 'https://c.test' }] }
    })

    const work = startTurnEntryWork({ ...entryWork(), message: 'when did frieren season 2 air?' })
    await createTurnContext(turnOptions(work))
    await vi.waitFor(() => expect(mocks.recordJevEvent).toHaveBeenCalledOnce())

    const row = mocks.recordJevEvent.mock.calls.at(-1)?.[0]
    expect(row.kind).toBe('turn')
    expect(JSON.parse(row.question)).toMatchObject({ prefetch: 'on' })
    expect(JSON.parse(row.answer)).toMatchObject({ needsLookup: 0.95, prefetchStatus: 'ready' })
    expect(JSON.stringify(row)).not.toContain('frieren')
  })

  it('persists a shadow verdict without waiting for or storing a search result', async () => {
    jevConfig.tone = 'off'
    jevConfig.referents = 'off'
    jevConfig.prefetch = 'shadow'
    mocks.judgeTurn.mockResolvedValue({
      tone: null,
      referents: [],
      needsLookup: 0.95,
      latencyMs: 4,
      inputTokens: 11
    })
    mocks.runPrefetchForJudgment.mockResolvedValue({
      decision: { fire: false, reason: 'shadow_would_fire' },
      outcome: null
    })

    const work = startTurnEntryWork({ ...entryWork(), message: 'when did frieren season 2 air?' })
    await createTurnContext(turnOptions(work))
    await vi.waitFor(() => expect(mocks.recordJevEvent).toHaveBeenCalledOnce())

    const row = mocks.recordJevEvent.mock.calls.at(-1)?.[0]
    expect(JSON.parse(row.question)).toMatchObject({ prefetch: 'shadow' })
    expect(JSON.parse(row.answer)).toMatchObject({ needsLookup: 0.95, prefetchStatus: 'shadow_would_fire' })
    expect(mocks.runPrefetchForJudgment).toHaveBeenCalledWith(
      expect.objectContaining({ needsLookup: 0.95 }),
      expect.objectContaining({ mode: 'shadow' }),
      expect.any(Object)
    )
    expect(mocks.settlePrefetch).not.toHaveBeenCalled()
    expect(JSON.stringify(row)).not.toContain('frieren')
  })

  it('persists gave_up when the bounded on-mode wait expires', async () => {
    jevConfig.tone = 'off'
    jevConfig.referents = 'off'
    jevConfig.prefetch = 'on'
    mocks.judgeTurn.mockResolvedValue({
      tone: null,
      referents: [],
      needsLookup: 0.95,
      latencyMs: 4,
      inputTokens: 11
    })
    mocks.runPrefetchForJudgment.mockReturnValue(new Promise(() => undefined))
    mocks.settlePrefetch.mockResolvedValue(null)

    await createTurnContext(turnOptions(startTurnEntryWork(entryWork())))
    await vi.waitFor(() => expect(mocks.recordJevEvent).toHaveBeenCalledOnce())

    const row = mocks.recordJevEvent.mock.calls.at(-1)?.[0]
    expect(JSON.parse(row.answer)).toMatchObject({ needsLookup: 0.95, prefetchStatus: 'gave_up' })
  })

  it('adds guild facts as a separate memory-enabled server block', async () => {
    mocks.retrieveGuildFacts.mockReturnValue({
      facts: [
        {
          predicate: 'plan',
          value: 'Game night on September 26',
          expiresAt: Date.parse('2026-09-26T16:00:00Z')
        } as never
      ],
      tokensEst: 12
    })

    const context = await createTurnContext(turnOptions(startTurnEntryWork(entryWork())))

    expect(mocks.retrieveGuildFacts).toHaveBeenCalledWith('guild-1', expect.any(Number), {
      guildId: 'guild-1',
      channelId: 'channel-1'
    })
    expect(context.systemPrompt).toContain('## Things You Remember About This Server')
    expect(context.systemPrompt).toContain('- plan (2026-09-26): Game night on September 26')
    expect(context.composePrompt(2)).not.toContain('Things You Remember About This Server')
  })

  it('shows a month-precision guild fact as its month, not the day its expiry falls on', async () => {
    mocks.retrieveGuildFacts.mockReturnValue({
      facts: [
        {
          predicate: 'upcoming_event',
          value: 'Server tournament',
          expiresAt: Date.parse('2026-10-31T16:00:00Z'),
          eventDate: '2026-10'
        } as never
      ],
      tokensEst: 12
    })

    const context = await createTurnContext(turnOptions(startTurnEntryWork(entryWork())))

    expect(context.systemPrompt).toContain('- upcoming_event (October 2026): Server tournament')
    expect(context.systemPrompt).not.toContain('2026-10-31')
  })

  it('skips both user and guild retrieval on memory-free turns', async () => {
    const context = await createTurnContext({
      ...turnOptions(startTurnEntryWork(entryWork())),
      memory: false
    })

    expect(mocks.retrieveForTurn).not.toHaveBeenCalled()
    expect(mocks.retrieveGuildFacts).not.toHaveBeenCalled()
    expect(context.systemPrompt).not.toContain('Things You Remember About This Server')
    expect(context.systemPrompt).not.toContain('Game night')
  })
})

describe('memory recall modes', () => {
  const memoryConfig = config.memory as { privacy: string; recall: string }
  const vector = Array.from({ length: 768 }, () => 0.25)
  const episodeBlock = '## Things you remember happening here\nThe group planned a picnic.'
  const mediaBlock = '## Media You Watched Here Before\n["the picnic clip"]'
  const factsEnvelope = '- Alice: hobby: chess'

  function emptyRecall() {
    return { items: [], block: '', trace: { nCandidates: 0, gated: 0, fallback: false, tokensEst: 0 } }
  }

  function unifiedRecall() {
    return {
      items: [
        {
          kind: 'fact',
          id: 7,
          score: 0.8123,
          core: false,
          subjectUserId: 'user-1',
          label: 'hobby',
          text: 'chess',
          date: null
        },
        {
          kind: 'conversation',
          id: 3,
          score: 0.5,
          core: false,
          subjectUserId: null,
          label: '',
          text: 'picnic',
          date: '2026-09-26'
        },
        {
          kind: 'server_fact',
          id: 9,
          score: 0.4,
          core: false,
          subjectUserId: null,
          label: 'plan',
          text: 'Game night',
          date: null
        }
      ],
      block: '## What You Remember\n### People\n- Alice: hobby: chess',
      trace: { nCandidates: 9, gated: 2, fallback: false, tokensEst: 33 }
    } as never
  }

  function turnWith(overrides: Partial<Parameters<typeof createTurnContext>[0]> = {}) {
    return createTurnContext({
      ...turnOptions(startTurnEntryWork({ ...entryWork(), includeEpisodeRecall: true })),
      ...overrides
    })
  }

  function recalledRows(kind: string) {
    return mocks.recordMemoryEvent.mock.calls.map(([row]) => row).filter((row) => row.kind === kind)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    jevConfig.tone = 'off'
    jevConfig.referents = 'off'
    jevConfig.prefetch = 'off'
    memoryConfig.privacy = 'relaxed'
    memoryConfig.recall = 'legacy'
    mocks.ensureSession.mockResolvedValue({ events: [] })
    mocks.loadHistory.mockReturnValue([])
    mocks.embedEpisodeText.mockResolvedValue(vector)
    mocks.buildEpisodeRecallBlock.mockReturnValue('')
    mocks.buildMediaRecallBlock.mockReturnValue('')
    mocks.buildFactsEnvelope.mockReturnValue('')
    mocks.retrieveForTurn.mockReturnValue({ entries: [], claims: [] } as never)
    mocks.resolveReferences.mockReturnValue({ resolved: [], ambiguous: [] } as never)
    mocks.recallForTurn.mockImplementation(() => emptyRecall() as never)
    mocks.runPrefetchForJudgment.mockResolvedValue({ decision: { fire: false, reason: 'no_judgment' }, outcome: null })
  })

  afterEach(() => {
    memoryConfig.privacy = 'relaxed'
    memoryConfig.recall = 'legacy'
  })

  it('builds the legacy prompt with the four legacy blocks and no unified recall', async () => {
    mocks.retrieveForTurn.mockReturnValue({ entries: [{ person: 'Alice', facts: [] }], claims: [{}] } as never)
    mocks.buildFactsEnvelope.mockReturnValue(factsEnvelope)
    mocks.buildEpisodeRecallBlock.mockReturnValue(episodeBlock)

    const context = await turnWith()

    expect(context.systemPrompt).toContain(`## What You Remember About People In This Channel\n${factsEnvelope}`)
    expect(context.systemPrompt).toContain(episodeBlock)
    expect(mocks.buildEpisodeRecallBlock).toHaveBeenCalledWith({
      guildId: 'guild-1',
      queryEmbedding: vector,
      scope: { guildId: 'guild-1', channelId: 'channel-1' }
    })
    expect(mocks.recallForTurn).not.toHaveBeenCalled()
    expect(recalledRows('recall')).toHaveLength(0)
    expect(recalledRows('recall_shadow')).toHaveLength(0)
  })

  it('builds a shadow prompt identical to legacy and leaves its selection unused', async () => {
    mocks.retrieveForTurn.mockReturnValue({ entries: [{ person: 'Alice', facts: [] }], claims: [{}] } as never)
    mocks.buildFactsEnvelope.mockReturnValue(factsEnvelope)
    mocks.buildEpisodeRecallBlock.mockReturnValue(episodeBlock)
    mocks.buildMediaRecallBlock.mockReturnValue(mediaBlock)
    mocks.recallForTurn.mockImplementation(() => unifiedRecall())

    memoryConfig.recall = 'legacy'
    const legacy = await turnWith()
    memoryConfig.recall = 'shadow'
    const shadow = await turnWith()

    expect(legacy.systemPrompt).toContain(episodeBlock)
    expect(shadow.systemPrompt).toBe(legacy.systemPrompt)
    expect(mocks.recallForTurn).toHaveBeenCalledTimes(1)
    expect(mocks.recallForTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { guildId: 'guild-1', channelId: 'channel-1' },
        speakerId: 'user-1',
        message: 'hello',
        queryEmbedding: vector
      })
    )
    expect(mocks.touchRecalled).not.toHaveBeenCalled()
  })

  it('records one shadow event with ids, scores and counts but no memory text', async () => {
    memoryConfig.recall = 'shadow'
    mocks.recallForTurn.mockImplementation(() => unifiedRecall())

    await turnWith()

    const rows = recalledRows('recall_shadow')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      subjectUserId: 'user-1',
      nCandidates: 9,
      nSelected: 3,
      tokensEst: 33,
      durationMs: expect.any(Number)
    })
    expect(JSON.parse(rows[0].detail)).toEqual({
      mode: 'shadow',
      privacy: 'relaxed',
      fallback: false,
      gated: 2,
      selected: [
        ['fact', 7, 0.812],
        ['conversation', 3, 0.5],
        ['server_fact', 9, 0.4]
      ]
    })
    expect(rows[0].detail).not.toContain('chess')
    expect(recalledRows('recall')).toHaveLength(0)
  })

  it('shows only the unified block, touches the selected facts and records one recall event', async () => {
    memoryConfig.recall = 'unified'
    mocks.retrieveForTurn.mockReturnValue({ entries: [{ person: 'Alice', facts: [] }], claims: [{}] } as never)
    mocks.buildFactsEnvelope.mockReturnValue(factsEnvelope)
    mocks.buildEpisodeRecallBlock.mockReturnValue(episodeBlock)
    mocks.buildMediaRecallBlock.mockReturnValue(mediaBlock)
    mocks.retrieveGuildFacts.mockReturnValue({
      facts: [{ predicate: 'plan', value: 'Game night' } as never],
      tokensEst: 1
    })
    mocks.recallForTurn.mockImplementation(() => unifiedRecall())

    const context = await turnWith()

    expect(context.systemPrompt).toContain('## What You Remember\n### People\n- Alice: hobby: chess')
    for (const legacyHeading of [
      '## What You Remember About People In This Channel',
      '## Things You Remember About This Server',
      episodeBlock,
      mediaBlock
    ]) {
      expect(context.systemPrompt).not.toContain(legacyHeading)
    }
    expect(mocks.retrieveForTurn).not.toHaveBeenCalled()
    expect(mocks.retrieveGuildFacts).not.toHaveBeenCalled()
    expect(mocks.buildEpisodeRecallBlock).not.toHaveBeenCalled()
    expect(mocks.buildMediaRecallBlock).not.toHaveBeenCalled()
    expect(mocks.touchRecalled).toHaveBeenCalledWith([7, 9])
    const rows = recalledRows('recall')
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].detail)).toMatchObject({ mode: 'unified', fallback: false, gated: 2 })
    expect(recalledRows('context_build')).toEqual([expect.objectContaining({ nSelected: 3 })])
  })

  it('keeps the Who Is Mentioned block on the same safety rung as the unified memory block', async () => {
    memoryConfig.recall = 'unified'
    mocks.recallForTurn.mockImplementation(() => unifiedRecall())
    mocks.resolveReferences.mockReturnValue({
      resolved: [{ alias: 'Ali', displayName: 'Alice', matchedBy: 'nickname', userId: 'user-2' }],
      ambiguous: []
    } as never)

    const context = await turnWith()

    expect(context.systemPrompt).toContain('## Who Is Mentioned\n- "Ali" means Alice')
    expect(context.composePrompt(1)).toContain('## What You Remember')
    expect(context.composePrompt(1)).toContain('## Who Is Mentioned')
    expect(context.composePrompt(2)).not.toContain('## What You Remember')
    expect(context.composePrompt(2)).not.toContain('## Who Is Mentioned')
  })

  it('runs unified recall without a query embedding once the embedding timeout passes', async () => {
    vi.useFakeTimers()
    try {
      memoryConfig.recall = 'unified'
      mocks.embedEpisodeText.mockImplementation(() => new Promise(() => undefined))
      mocks.recallForTurn.mockImplementation((input) => ({
        ...emptyRecall(),
        trace: { nCandidates: 0, gated: 0, fallback: input.queryEmbedding === null, tokensEst: 0 }
      }))

      const pending = turnWith()
      await vi.advanceTimersByTimeAsync(config.memory.embeddingTimeoutMs)
      await pending

      expect(mocks.recallForTurn).toHaveBeenCalledWith(expect.objectContaining({ queryEmbedding: null }))
      const rows = recalledRows('recall')
      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0].detail).fallback).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['shadow', 'unified'])('never fails the turn when recall throws in %s mode', async (recall) => {
    memoryConfig.recall = recall
    mocks.recallForTurn.mockImplementation(() => {
      throw new Error('recall unavailable')
    })

    const context = await turnWith()

    expect(context.systemPrompt).not.toContain('What You Remember')
    expect(recalledRows('recall')).toHaveLength(0)
    expect(recalledRows('recall_shadow')).toHaveLength(0)
  })

  it.each(['legacy', 'shadow', 'unified'])('reads no long-term memory with privacy off in %s mode', async (recall) => {
    memoryConfig.privacy = 'off'
    memoryConfig.recall = recall
    mocks.buildFactsEnvelope.mockReturnValue(factsEnvelope)
    mocks.buildEpisodeRecallBlock.mockReturnValue(episodeBlock)
    mocks.buildMediaRecallBlock.mockReturnValue(mediaBlock)
    mocks.retrieveGuildFacts.mockReturnValue({
      facts: [{ predicate: 'plan', value: 'Game night' } as never],
      tokensEst: 1
    })
    mocks.recallForTurn.mockImplementation(() => unifiedRecall())

    const context = await turnWith()

    expect(mocks.recallForTurn).not.toHaveBeenCalled()
    expect(mocks.retrieveForTurn).not.toHaveBeenCalled()
    expect(mocks.retrieveGuildFacts).not.toHaveBeenCalled()
    expect(mocks.buildEpisodeRecallBlock).not.toHaveBeenCalled()
    expect(mocks.buildMediaRecallBlock).not.toHaveBeenCalled()
    expect(context.systemPrompt).not.toContain('What You Remember')
    expect(context.systemPrompt).not.toContain('Things You Remember About This Server')
    expect(context.systemPrompt).not.toContain(episodeBlock)
    expect(recalledRows('recall')).toHaveLength(0)
    expect(recalledRows('recall_shadow')).toHaveLength(0)
  })

  it.each(['shadow', 'unified'])('does no recall for a DM or a memory-free turn in %s mode', async (recall) => {
    memoryConfig.recall = recall
    mocks.recallForTurn.mockImplementation(() => unifiedRecall())

    await turnWith({ guildId: 'dm:user-1' })
    await turnWith({ memory: false })

    expect(mocks.recallForTurn).not.toHaveBeenCalled()
    expect(recalledRows('recall')).toHaveLength(0)
    expect(recalledRows('recall_shadow')).toHaveLength(0)
  })
})
