import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  gameCommandHandler: vi.fn(),
  toolCommandHandler: vi.fn(),
  handleStatsCommand: vi.fn(),
  splitResponse: vi.fn((response: string) => [response]),
  retrieveForTurn: vi.fn(() => ({ entries: [], claims: [] })),
  retrieveGuildFacts: vi.fn(() => ({ facts: [], tokensEst: 0 })),
  getSharedRateLimiter: vi.fn(() => ({ tryConsumeAboveFloor: () => true })),
  getLocalHour: vi.fn(() => 12),
  runnerRequests: [] as Array<{ stateDelta?: Record<string, unknown> }>
}))

// roka.js is intentionally left unmocked — this suite drives the real handler through generateResponse's
// request construction, captured at runner.runAsync, the last hop this repo owns. It reconstructs
// toolContext.state from that stateDelta instead of observing ADK's own propagation of it, which happens inside ADK.
import type { ToolContext } from '@google/adk'
import { RateLimiter } from '../../utils/rateLimiter.js'

vi.mock('@google/adk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/adk')>()

  class CapturingRunner extends actual.Runner {
    override runAsync(request: Parameters<InstanceType<typeof actual.Runner>['runAsync']>[0]) {
      mocks.runnerRequests.push(request)
      return (async function* () {
        yield actual.createEvent({
          author: 'roka',
          content: { role: 'model', parts: [{ text: 'Captured fake model reply~' }] }
        })
      })()
    }
  }

  return { ...actual, Runner: CapturingRunner }
})
vi.mock('../../agent/memory/retriever.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../agent/memory/retriever.js')>()),
  retrieveForTurn: mocks.retrieveForTurn,
  retrieveGuildFacts: mocks.retrieveGuildFacts
}))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: mocks.error, info: mocks.info, warn: mocks.warn }
}))
// Keeps the real `RateLimiter` class and replaces only the shared getter: the handler now constructs
// reservations against it, and a module mock that dropped the class took the whole file down with it.
vi.mock('../../utils/rateLimiter.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/rateLimiter.js')>()),
  getSharedRateLimiter: mocks.getSharedRateLimiter
}))
vi.mock('../../utils/timezone.js', () => ({ getLocalHour: mocks.getLocalHour }))
vi.mock('../concurrency.js', () => ({ isChannelBusy: () => false, markBusy: vi.fn(), markFree: vi.fn() }))
vi.mock('../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../responses.js', () => ({
  escapeBackticks: (text: string) => text.replace(/\\?`/g, '\\`'),
  getRandomBusy: () => 'busy',
  getRandomDecline: () => 'decline',
  getRandomError: () => 'error',
  getRandomUnsupportedAttachment: () => "I couldn't open that file~",
  getRandomPartialAttachment: () => 'I only got through the beginning of that~',
  splitResponse: mocks.splitResponse
}))
vi.mock('../events/gameCommands.js', () => ({ createGameCommandHandler: () => mocks.gameCommandHandler }))
vi.mock('../events/stats/statsCommand.js', () => ({ handleStatsCommand: mocks.handleStatsCommand }))
vi.mock('../events/toolCommands.js', () => ({ createToolCommandHandler: () => mocks.toolCommandHandler }))

import { destroySession } from '../../agent/session.js'
import { MEMORY_TOOL_NAMES } from '../../agent/tools/index.js'
import { closeDb, getDb } from '../../storage/database.js'
import { createInteractionHandler } from '../events/interactionCreate.js'

const DM_CHANNEL = 'ask-memory-free-dm-channel'
const GUILD_CHANNEL = 'ask-memory-free-guild-channel'
const USER = 'ask-memory-free-user'

function makeInteraction(channelId: string, message: string, guildId: string | null) {
  return {
    isChatInputCommand: () => true,
    commandName: 'ask',
    options: { getString: vi.fn((name: string) => (name === 'question' ? message : null)), getAttachment: vi.fn() },
    channelId,
    member: null,
    user: { displayName: 'Rin', username: 'rin', id: USER },
    guildId,
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined)
  }
}

describe('/ask is memory-free', () => {
  const rateLimiter = new RateLimiter({ rpm: 1_000, rpd: 100_000 })

  /** Drives one real turn and returns the system prompt generateResponse handed to runner.runAsync. */
  async function turn(channelId: string, message: string, guildId: string | null): Promise<{ systemPrompt: string }> {
    mocks.runnerRequests.length = 0
    await createInteractionHandler(rateLimiter as never)(makeInteraction(channelId, message, guildId) as never)
    expect(mocks.runnerRequests).toHaveLength(1)
    const stateDelta = mocks.runnerRequests[0].stateDelta
    if (!stateDelta) throw new Error('runner.runAsync was reached without a stateDelta')
    return { systemPrompt: stateDelta._systemPrompt as string }
  }

  beforeEach(() => {
    process.env.ROKABOT_DB_PATH = ':memory:'
    vi.clearAllMocks()
    mocks.runnerRequests.length = 0
  })

  afterEach(async () => {
    await destroySession(DM_CHANNEL)
    await destroySession(GUILD_CHANNEL)
    closeDb()
    process.env.ROKABOT_DB_PATH = undefined
  })

  it('injects no facts in a guild, however many are stored', async () => {
    const guild = 'ask-memory-free-guild'
    const db = getDb()
    db.prepare(
      `INSERT INTO memory_claim (guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at)
       VALUES (?, ?, 'favorite_anime', 'Frieren', 'message', 'active', 0, 0)`
    ).run(guild, USER)

    const { systemPrompt } = await turn(GUILD_CHANNEL, 'What do you remember about me?', guild)

    expect(systemPrompt).not.toContain('What You Remember About People In This Channel')
    expect(systemPrompt).not.toContain('Frieren')
    expect(mocks.retrieveGuildFacts).not.toHaveBeenCalled()
  })

  it('names none of the memory tools in a guild turn', async () => {
    const { systemPrompt } = await turn(GUILD_CHANNEL, 'Remember that I like Frieren.', 'ask-memory-free-guild')

    for (const tool of MEMORY_TOOL_NAMES) expect(systemPrompt).not.toContain(tool)
  })

  it('writes no memory_claim rows for a /ask in a DM', async () => {
    await turn(DM_CHANNEL, 'Remember that I like Frieren.', null)

    const rows = getDb()
      .prepare('SELECT guild_id, subject_user_id, value FROM memory_claim WHERE subject_user_id = ?')
      .all(USER)
    expect(rows).toEqual([])
  })

  // The `dm:` label survives as the turn's tenant identity, and it is a metrics label only: the turn
  // carried it and still wrote no claim under it, which is the whole of what /ask leaving memory means.
  it('keeps the dm label as the turn identity while creating no memory tenant', async () => {
    mocks.runnerRequests.length = 0
    await createInteractionHandler(rateLimiter as never)(
      makeInteraction(DM_CHANNEL, 'Remember that I like Frieren.', null) as never
    )

    expect(mocks.runnerRequests[0].stateDelta?._guildId).toBe(`dm:${DM_CHANNEL}`)
    expect(getDb().prepare("SELECT COUNT(*) AS count FROM memory_claim WHERE guild_id LIKE 'dm:%'").get()).toEqual({
      count: 0
    })
  })
})
