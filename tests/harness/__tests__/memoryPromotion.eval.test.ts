import { afterEach, describe, expect, it, vi } from 'vitest'
import '../env.js'
import { resetMonitor } from '../../../src/agent/channelMonitor.js'
import { assertClaim } from '../../../src/agent/memory/memoryClaims.js'
import { resetForTest as resetScheduler, stopExtractionScheduler } from '../../../src/agent/memory/scheduler.js'
import { assembleSystemPrompt } from '../../../src/agent/promptAssembler.js'
import { buildFactsEnvelope } from '../../../src/agent/promptSafety.js'
import {
  __resetTestRunTurnFactory,
  __setTestRunTurnFactory,
  destroySession,
  generateResponse
} from '../../../src/agent/roka.js'
import { config } from '../../../src/config.js'
import { createMessageHandler } from '../../../src/discord/events/messageCreate.js'
import { getDb } from '../../../src/storage/database.js'
import { saveFact } from '../../../src/storage/userMemory.js'
import { RateLimiter } from '../../../src/utils/rateLimiter.js'
import { getLocalHour } from '../../../src/utils/timezone.js'
import { createCaptureSink } from '../captureSink.js'
import { makeClient, makeGuild, makeMessage } from '../discordDoubles.js'

const memoryConfig = config.memory as { claimsBackend: boolean }
const transcript = [
  {
    guildId: 'promotion-garden',
    channelId: 'promotion-tea-room',
    userId: 'promotion-mio',
    content: '<@roka> I love my cat and anime games.'
  },
  {
    guildId: 'promotion-library',
    channelId: 'promotion-reading-nook',
    userId: 'promotion-mio',
    content: '<@roka> I enjoy my dog and manga games.'
  }
] as const

function responseEventCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS count FROM response_events').get() as { count: number }).count
}

afterEach(async () => {
  __resetTestRunTurnFactory()
  stopExtractionScheduler()
  resetScheduler()
  resetMonitor()
  memoryConfig.claimsBackend = true
  await Promise.all([
    ...transcript.map(({ channelId }) => destroySession(channelId)),
    destroySession('promotion-busy'),
    destroySession('promotion-emoji'),
    destroySession('promotion-legacy')
  ])
  getDb().exec(`
    DELETE FROM extraction_queue;
    DELETE FROM memory_events;
    DELETE FROM response_events;
    DELETE FROM memory_claim;
    DELETE FROM user_memory;
    DELETE FROM user_names;
    DELETE FROM monitored_channels;
  `)
  vi.restoreAllMocks()
})

describe('memory promotion harness evaluation', () => {
  it('uses the bounded retriever and queues extraction for a multi-guild transcript with the default enabled', async () => {
    expect(config.memory.claimsBackend).toBe(true)
    assertClaim({
      guildId: 'promotion-garden',
      subjectUserId: 'promotion-mio',
      predicate: 'favorite_anime',
      value: 'garden-series',
      sourceKind: 'human'
    })
    assertClaim({
      guildId: 'promotion-library',
      subjectUserId: 'promotion-mio',
      predicate: 'favorite_anime',
      value: 'library-series',
      sourceKind: 'human'
    })

    const prompts: string[] = []
    __setTestRunTurnFactory((systemPrompt) => {
      prompts.push(systemPrompt)
      return async () => ({ text: 'Promotion harness reply~', hasText: true, hasFunctionCall: false })
    })
    const handler = createMessageHandler(makeClient() as never, new RateLimiter({ rpm: 8, rpd: 8 }))

    for (const line of transcript) {
      await handler(
        makeMessage({
          author: { id: line.userId, username: 'mio', displayName: 'Mio' },
          mentions: ['roka'],
          guildId: line.guildId,
          guild: makeGuild(),
          member: { displayName: 'Mio' },
          channelId: line.channelId,
          content: line.content,
          sink: createCaptureSink()
        }) as never
      )
    }

    expect(prompts).toHaveLength(2)
    expect(prompts[0]).toContain('"garden-series"')
    expect(prompts[0]).not.toContain('"library-series"')
    expect(prompts[1]).toContain('"library-series"')
    expect(prompts[1]).not.toContain('"garden-series"')

    const queued = getDb()
      .prepare('SELECT guild_id, channel_id, status FROM extraction_queue ORDER BY id')
      .all() as Array<{ guild_id: string; channel_id: string; status: string }>
    expect(queued).toEqual(
      expect.arrayContaining(
        transcript.map(({ guildId, channelId }) => ({ guild_id: guildId, channel_id: channelId, status: 'pending' }))
      )
    )

    const responseRows = getDb().prepare('SELECT * FROM response_events ORDER BY id').all() as Array<
      Record<string, unknown>
    >
    expect(responseRows).toHaveLength(2)
    expect(responseRows.map((row) => [row.guild_id, row.channel_id, row.trigger, row.kind])).toEqual([
      ['promotion-garden', 'promotion-tea-room', 'mention', 'ok'],
      ['promotion-library', 'promotion-reading-nook', 'mention', 'ok']
    ])
    expect(Object.keys(responseRows[0])).toEqual([
      'id',
      'guild_id',
      'channel_id',
      'user_id',
      'trigger',
      'tone',
      'outcome',
      'kind',
      'e2e_ms',
      'generate_ms',
      'llm_ms',
      'retry_latency_ms',
      'retries',
      'tokens_in_est',
      'tokens_out_est',
      'tools_used',
      'created_at'
    ])

    const memoryRows = getDb().prepare('SELECT * FROM memory_events ORDER BY id').all() as Array<
      Record<string, unknown>
    >
    expect(memoryRows.filter((row) => row.kind === 'retrieval')).toHaveLength(2)
    expect(memoryRows.filter((row) => row.kind === 'context_build')).toHaveLength(2)
    expect(Object.keys(memoryRows[0])).toEqual([
      'id',
      'kind',
      'guild_id',
      'channel_id',
      'subject_user_id',
      'duration_ms',
      'n_candidates',
      'n_selected',
      'n_changed',
      'tokens_est',
      'op',
      'created_at'
    ])
  })

  it('keeps busy, decline, emoji, and gacha paths from adding metrics rows', async () => {
    const client = makeClient()
    const before = responseEventCount()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let resolveFirstTurn!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      __setTestRunTurnFactory(
        () => async () =>
          new Promise((resolveTurn) => {
            resolveFirstTurn = () =>
              resolveTurn({ text: 'First promotion reply~', hasText: true, hasFunctionCall: false })
            resolve()
          })
      )
    })
    const busyHandler = createMessageHandler(client as never, new RateLimiter({ rpm: 2, rpd: 2 }))
    const busySink = createCaptureSink()
    const first = busyHandler(
      makeMessage({
        mentions: ['roka'],
        channelId: 'promotion-busy',
        content: '<@roka> First',
        sink: busySink
      }) as never
    )
    await firstStarted
    await busyHandler(
      makeMessage({
        mentions: ['roka'],
        channelId: 'promotion-busy',
        content: '<@roka> Second',
        sink: busySink
      }) as never
    )
    expect(busySink.all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'reply', payload: expect.stringContaining("I'm still thinking") })
      ])
    )
    expect(responseEventCount()).toBe(before)
    resolveFirstTurn()
    await first

    const afterBusy = responseEventCount()
    const declineSink = createCaptureSink()
    await createMessageHandler(
      client as never,
      new RateLimiter({ rpm: 1, rpd: 0 })
    )(
      makeMessage({
        mentions: ['roka'],
        channelId: 'promotion-decline',
        content: '<@roka> Chat?',
        sink: declineSink
      }) as never
    )
    expect(declineSink.all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'reply', payload: expect.stringContaining('ちょっと待ってね') })
      ])
    )
    expect(responseEventCount()).toBe(afterBusy)

    __setTestRunTurnFactory(() => async () => ({
      text: 'Emoji promotion reply~',
      hasText: true,
      hasFunctionCall: false
    }))
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const emojiSink = createCaptureSink()
    await createMessageHandler(
      client as never,
      new RateLimiter({ rpm: 1, rpd: 1 })
    )(
      makeMessage({
        mentions: ['roka'],
        guild: makeGuild(),
        guildId: 'promotion-emoji-guild',
        channelId: 'promotion-emoji',
        content: '<@roka> Good morning!',
        sink: emojiSink
      }) as never
    )
    expect(emojiSink.all()).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'react', payload: '👋' })]))

    const afterEmoji = responseEventCount()
    const gachaSink = createCaptureSink()
    await createMessageHandler(
      client as never,
      new RateLimiter({ rpm: 1, rpd: 1 })
    )(
      makeMessage({
        author: { id: 'promotion-gacha', username: 'gacha', displayName: 'Gacha' },
        mentions: ['roka'],
        channelId: 'promotion-gacha',
        content: 'gacha',
        sink: gachaSink
      }) as never
    )
    expect(gachaSink.all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'reply',
          payload: expect.objectContaining({ content: expect.stringContaining('companion spirit') })
        })
      ])
    )
    expect(responseEventCount()).toBe(afterEmoji)
  })

  it('restores the byte-identical Phase 13 facts prompt when rollback forces the flag off', async () => {
    vi.stubEnv('MEMORY_CLAIMS_BACKEND', 'false')
    memoryConfig.claimsBackend = false
    saveFact('promotion-legacy-guild', 'promotion-legacy-user', 'favorite anime', 'legacy-series')

    let capturedPrompt = ''
    __setTestRunTurnFactory((systemPrompt) => {
      capturedPrompt = systemPrompt
      return async () => ({ text: 'Legacy promotion reply~', hasText: true, hasFunctionCall: false })
    })

    const result = await generateResponse({
      channelId: 'promotion-legacy',
      guildId: 'promotion-legacy-guild',
      userMessage: 'Hello.',
      displayName: 'Mio',
      username: 'mio',
      userId: 'promotion-legacy-user'
    })
    const expectedPrompt =
      `${assembleSystemPrompt({ tone: result.tone, participants: ['Mio'], hour: getLocalHour(), displayName: 'Mio' })}` +
      `\n\n## What You Remember About People In This Channel\n${buildFactsEnvelope([
        { person: 'mio (Mio)', facts: [{ key: 'favorite anime', value: 'legacy-series' }] }
      ])}` +
      '\n\n- The current user\'s Discord ID is "promotion-legacy-user". remember_user and recall_user target the current user automatically; to recall a different server member, pass their name as user_name.'

    expect(capturedPrompt).toBe(expectedPrompt)
  })
})
