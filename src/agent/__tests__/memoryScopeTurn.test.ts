import type { CallbackContext, LlmRequest } from '@google/adk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ prepareTurnMedia: vi.fn() }))

vi.mock('../media/turnMedia.js', () => ({ prepareTurnMedia: mocks.prepareTurnMedia }))
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
  retrieveForTurn: vi.fn(),
  retrieveGuildFacts: vi.fn(() => ({ facts: [], tokensEst: 0 }))
}))
vi.mock('../memory/identityResolver.js', () => ({
  resolveReferences: vi.fn(() => ({ resolved: [], ambiguous: [] }))
}))
vi.mock('../memory/passiveBuffer.js', () => ({ getMessages: vi.fn(() => []) }))
vi.mock('../jev/judgments.js', () => ({ judgeTurn: vi.fn() }))
vi.mock('../../utils/rateLimiter.js', () => ({
  getSharedRateLimiter: vi.fn(() => ({ tryConsumeAboveFloor: () => true }))
}))
vi.mock('../../utils/timezone.js', () => ({ getLocalHour: () => 12 }))

import { config } from '../../config.js'
import { recordMemoryEvent } from '../../storage/metricsStore.js'
import type { MemoryScope } from '../memory/memoryScope.js'
import { retrieveForTurn } from '../memory/retriever.js'
import {
  __resetTestRunTurnFactory,
  __setTestRunTurnFactory,
  generateResponse,
  rokaAgent,
  steeringForRequest
} from '../roka.js'
import { MEMORY_TOOL_NAMES, forgetUserTool, recallUserTool, rememberUserTool, rokaTools } from '../tools/index.js'

const jevConfig = config.jev as { tone: string; referents: string; prefetch: string }
jevConfig.tone = 'off'
jevConfig.referents = 'off'
jevConfig.prefetch = 'off'

const memoryConfig = config.memory as { privacy: string }

const cannedMedia = {
  directParts: [],
  mediaTextParts: [],
  compactions: new Map(),
  compactDigests: [],
  digests: [],
  watcherCalls: 0,
  mediaTokens: 0,
  droppedAttachments: 0,
  truncatedAttachments: 0,
  refusedAttachments: 0,
  watchOutcome: null
}

let capturedPrompt = ''
let seenScopes: Array<MemoryScope | undefined> = []

function turnOptions(overrides: { channelId: string; guildId?: string; memory?: boolean }) {
  return {
    channelId: overrides.channelId,
    guildId: overrides.guildId ?? 'scope-guild',
    userMessage: 'hello',
    displayName: 'Ikuyo',
    username: 'ikuyo',
    userId: 'user-1',
    messageId: 'message-1',
    memory: overrides.memory ?? true,
    turnEntryWork: {
      judgment: Promise.resolve(null),
      prefetch: Promise.resolve({ decision: { fire: false, reason: 'no_judgment' as const }, outcome: null }),
      cancel: () => {}
    }
  }
}

const preparedInput = () => mocks.prepareTurnMedia.mock.calls.at(-1)?.[0]

const FULL_TAIL = 'remember_user and recall_user target the current user automatically'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prepareTurnMedia.mockResolvedValue(cannedMedia)
  vi.mocked(retrieveForTurn).mockReturnValue({ entries: [], claims: [] } as never)
  capturedPrompt = ''
  seenScopes = []
  __setTestRunTurnFactory((systemPrompt: string) => {
    capturedPrompt = systemPrompt
    return async () => {
      seenScopes.push(steeringForRequest.getStore()?.memoryScope)
      return { text: 'Hm~', hasText: true, hasFunctionCall: false }
    }
  })
})

afterEach(() => {
  memoryConfig.privacy = 'relaxed'
  __resetTestRunTurnFactory()
})

describe('memory scope on the turn', () => {
  it('runs /ask with no media scope, no memory tools and no long-term reads', async () => {
    await generateResponse(turnOptions({ channelId: 'scope-none', memory: false }))

    expect(seenScopes).toEqual(['none'])
    expect(preparedInput().memoryScope).toBeNull()
    for (const tool of MEMORY_TOOL_NAMES) expect(capturedPrompt).not.toContain(tool)
    expect(capturedPrompt).toContain('- The current user\'s Discord ID is "user-1".')
    expect(capturedPrompt).not.toContain(FULL_TAIL)
    expect(retrieveForTurn).not.toHaveBeenCalled()
    const kinds = vi.mocked(recordMemoryEvent).mock.calls.map(([row]) => row.kind)
    expect(kinds).not.toContain('context_build')
    expect(kinds).not.toContain('recall')
    expect(kinds).not.toContain('recall_shadow')
  })

  it('runs a full turn with a media scope, every memory tool and the full tail', async () => {
    await generateResponse(turnOptions({ channelId: 'scope-full' }))

    expect(seenScopes).toEqual(['full'])
    expect(preparedInput().memoryScope).toEqual({
      guildId: 'scope-guild',
      channelId: 'scope-full',
      messageId: 'message-1',
      userId: 'user-1'
    })
    expect(capturedPrompt).toContain('remember_user')
    expect(capturedPrompt).toContain('recall_user')
    expect(capturedPrompt).toContain('forget_user')
    expect(capturedPrompt).toContain(FULL_TAIL)
  })

  it('runs privacy off with no media scope, forget only and the bare tail', async () => {
    memoryConfig.privacy = 'off'

    await generateResponse(turnOptions({ channelId: 'scope-forget' }))

    expect(seenScopes).toEqual(['forget'])
    expect(preparedInput().memoryScope).toBeNull()
    expect(capturedPrompt).toContain('forget_user')
    expect(capturedPrompt).not.toContain('remember_user')
    expect(capturedPrompt).not.toContain('recall_user')
    expect(capturedPrompt).toContain('- The current user\'s Discord ID is "user-1".')
    expect(capturedPrompt).not.toContain(FULL_TAIL)
  })

  it('keeps watched media out of memory for a DM even on a full turn', async () => {
    await generateResponse(turnOptions({ channelId: 'scope-dm', guildId: 'dm:user-1' }))

    expect(seenScopes).toEqual(['full'])
    expect(preparedInput().memoryScope).toBeNull()
    expect(capturedPrompt).toContain('remember_user')
  })
})

describe('beforeModelCallback memory scope', () => {
  const context = { state: { get: () => 'a prompt' } } as unknown as CallbackContext
  const callback = rokaAgent.beforeModelCallback as (params: {
    context: CallbackContext
    request: LlmRequest
  }) => Promise<unknown>

  function requestWithEveryTool() {
    return {
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      config: {
        tools: [{ functionDeclarations: rokaTools.map((tool) => tool._getDeclaration()) as Array<{ name?: string }> }]
      },
      toolsDict: Object.fromEntries(rokaTools.map((tool) => [tool.name, tool]))
    } as unknown as LlmRequest
  }

  const declaredNames = (request: LlmRequest) =>
    (request.config?.tools as Array<{ functionDeclarations?: Array<{ name?: string }> }>).flatMap(
      (tool) => tool.functionDeclarations?.map(({ name }) => name ?? '') ?? []
    )

  it('withholds every memory tool for a scoped-out turn', async () => {
    const request = requestWithEveryTool()

    await steeringForRequest.run({ memoryScope: 'none' }, () => callback({ context, request }))

    const names = declaredNames(request)
    expect(names.length).toBe(rokaTools.length - MEMORY_TOOL_NAMES.length)
    for (const name of MEMORY_TOOL_NAMES) {
      expect(names).not.toContain(name)
      expect(request.toolsDict[name]).toBeUndefined()
    }
  })

  it('withholds remember and recall but keeps forget for a forget-only turn', async () => {
    const request = requestWithEveryTool()

    await steeringForRequest.run({ memoryScope: 'forget' }, () => callback({ context, request }))

    const names = declaredNames(request)
    expect(names).not.toContain(rememberUserTool.name)
    expect(names).not.toContain(recallUserTool.name)
    expect(names).toContain(forgetUserTool.name)
    expect(request.toolsDict[rememberUserTool.name]).toBeUndefined()
    expect(request.toolsDict[recallUserTool.name]).toBeUndefined()
    expect(request.toolsDict[forgetUserTool.name]).toBeDefined()
  })

  it('withholds nothing for a full turn', async () => {
    const request = requestWithEveryTool()

    await steeringForRequest.run({ memoryScope: 'full' }, () => callback({ context, request }))

    expect(declaredNames(request)).toHaveLength(rokaTools.length)
    for (const name of MEMORY_TOOL_NAMES) expect(request.toolsDict[name]).toBeDefined()
  })
})
