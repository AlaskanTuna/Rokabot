import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Client } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => ({
  searchAnime: vi.fn(),
  getAnimeSchedule: vi.fn(),
  reminders: {
    createReminder: vi.fn(),
    getActiveReminders: vi.fn(),
    getReminderById: vi.fn(),
    deleteReminder: vi.fn(),
    getDueReminders: vi.fn(),
    markDelivered: vi.fn()
  },
  hangmanTimeout: undefined as ((channelId: string, word: string) => void) | undefined,
  shiritoriTimeout: undefined as ((channelId: string, playerName: string) => void) | undefined,
  shiritoriGame: undefined as unknown,
  richStats: true
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }
}))
vi.mock('../../agent/tools/searchAnime.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchAnime: fakes.searchAnime
}))
vi.mock('../../agent/tools/getAnimeSchedule.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAnimeSchedule: fakes.getAnimeSchedule
}))
vi.mock('../../storage/reminderStore.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...fakes.reminders
}))
vi.mock('../../games/hangman.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setTimeoutCallback: (callback: typeof fakes.hangmanTimeout) => {
    fakes.hangmanTimeout = callback
  }
}))
vi.mock('../../games/shiritori.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGame: () => fakes.shiritoriGame,
  setTimeoutCallback: (callback: typeof fakes.shiritoriTimeout) => {
    fakes.shiritoriTimeout = callback
  }
}))
vi.mock('../events/stats/charts.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  renderActivityHeatmap: async () => null,
  renderChannelHistogram: async () => null,
  renderLatencyTrend: async () => null,
  renderMemoryGrowth: async () => null,
  renderMoodDonut: async () => null
}))
vi.mock('../events/stats/queries.js', () => {
  const either =
    <T>(rich: T, empty: T) =>
    () =>
      fakes.richStats ? rich : empty
  const predicates = [
    'nickname',
    'language_spoken',
    'nationality',
    'pronouns',
    'pets',
    'daily_routine',
    'diet',
    'general_occupation',
    'likes',
    'dislikes',
    'favorite_anime',
    'favorite_game',
    'favorite_music',
    'hobby',
    'currently_watching',
    'relationship_to',
    'friend_group',
    'communication_style',
    'humor_style',
    'catchphrase',
    'teasing_habit',
    'recommends',
    'complains_about',
    'strong_opinion',
    'misc',
    'origami_skill'
  ]
  const members = [
    ...predicates.map((predicate, index) => ({ userId: `member-${index}`, predicate, value: 'tea' })),
    { userId: 'member-quiet', predicate: 'likes', value: '' },
    { userId: 'member-unknown', predicate: null, value: null }
  ]
  return {
    chatsSince: either(42, 0),
    uniqueChatters: either(5, 0),
    busiestChannel: either({ channelId: 'channel-1', count: 9 }, null),
    topChannels: () => [],
    activityByDay: () => [],
    mostActiveDay: either({ day: 'Friday', count: 7 }, null),
    mostActiveHour: either({ hour: 21, count: 5 }, null),
    currentAndBestStreak: either({ current: 3, best: 8 }, { current: 0, best: 0 }),
    mostUsedTool: either({ tool: 'search_web', count: 4 }, null),
    triggerSplit: either(
      [
        { trigger: 'mention', count: 6 },
        { trigger: 'name', count: 2 }
      ],
      []
    ),
    topTones: either(
      [
        { tone: 'domestic', count: 6 },
        { tone: 'flustered', count: 3 },
        { tone: 'sleepy', count: 1 }
      ],
      []
    ),
    activeClaimCount: either(12, 0),
    distinctRememberedUsers: either(4, 0),
    episodeCount: either(2, 0),
    newClaimsThisMonth: either(3, 0),
    topPredicates: either([{ predicate: 'likes', count: 3 }], []),
    topRememberedMembers: either(members, []),
    memoryGrowthSeries: () => [],
    latencyE2e: either(
      { p50: 900, p95: 2400, min: 300, max: 5100, total: 3_700_000 },
      { p50: 0, p95: 0, min: 0, max: 0, total: 0 }
    ),
    successRate: either(
      { ok: 40, total: 42, failures: [{ outcome: 'timeout', count: 2 }] },
      { ok: 0, total: 0, failures: [] }
    ),
    retrySummary: either(
      { totalRetries: 4, retriedChats: 3, retryLatencyMs: 800 },
      { totalRetries: 0, retriedChats: 0, retryLatencyMs: 0 }
    ),
    tokenTotals: either({ input: 12_000, output: 8000, total: 20_000 }, { input: 0, output: 0, total: 0 }),
    p95ByDay: () => []
  }
})

import type { WatchOutcome } from '../../agent/media/types.js'
import type { ReplyOutcome } from '../../agent/replyOutcomes.js'
import { KNOWN_FALLBACKS, RECITATION_DEFLECTION, SAFETY_DEFLECTION, TERMINAL_DEFLECTION } from '../../agent/roka.js'
import { config } from '../../config.js'
import { buildCommandBody } from '../commands/index.js'
import { createGameCommandHandler } from '../events/gameCommands.js'
import { handleHangmanGuide } from '../events/games/hangman.js'
import { ROKA_CHART_PALETTE } from '../events/stats/charts.js'
import { handleStatsCommand } from '../events/stats/statsCommand.js'
import { STATS_VIEWS, buildStatsView } from '../events/stats/views.js'
import { createToolCommandHandler } from '../events/toolCommands.js'
import { handleAnime } from '../events/tools/anime.js'
import { handleRemind } from '../events/tools/reminder.js'
import { handleSchedule } from '../events/tools/schedule.js'
import { MAX_TOOL_FOOTER_CHARS, buildRokaMessage } from '../messageBuilder.js'
import { startReminderScheduler, stopReminderScheduler } from '../reminderScheduler.js'
import {
  getRandomBusy,
  getRandomDecline,
  getRandomError,
  getRandomOversizedAttachment,
  getRandomPartialAttachment,
  getRandomSkippedAttachments,
  getRandomUnsupportedAttachment
} from '../responses.js'
import type { SocialPostLookup } from '../socialPosts/types.js'
import type { SocialPlatform } from '../socialPosts/urls.js'
import { startStatusCycler, stopStatusCycler } from '../statusCycler.js'

/**
 * Pins every line the bot posts in the character's voice outside the model's replies, as hashes of what Discord
 * receives. Moving those lines into the character pack must not change one character of them; regenerate with
 * UPDATE_LINES_GOLDEN=1 only for an intended change of wording.
 */
const FIXTURE = resolve(import.meta.dirname, '../../../tests/fixtures/lines-golden.json')
const NOW = Date.parse('2026-10-10T12:30:00Z')

const digest = (parts: readonly unknown[]) =>
  createHash('sha256')
    .update(parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\u0000'))
    .digest('hex')

/** Every value a random draw can return, in pool order: 60 even steps reach each index of a pool up to 60 long. */
async function every(draw: () => unknown): Promise<string[]> {
  const random = vi.spyOn(Math, 'random')
  const seen: string[] = []
  for (let step = 0; step < 60; step++) {
    random.mockReturnValue(step / 60)
    const value = JSON.stringify(await draw())
    if (!seen.includes(value)) seen.push(value)
  }
  random.mockRestore()
  return seen
}

type Collect = (interaction: unknown) => Promise<void>

function command(subcommand: string, options: Record<string, string | number> = {}, extra: object = {}) {
  const collected: { handler?: Collect } = {}
  const collector = {
    on: (event: string, handler: Collect) => {
      if (event === 'collect') collected.handler = handler
      return collector
    }
  }
  const message = { createMessageComponentCollector: () => collector }
  const interaction = {
    id: 'interaction-1',
    commandName: 'none',
    channelId: 'channel-1',
    guildId: null as string | null,
    user: { id: 'user-1' },
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => subcommand,
      getSubcommandGroup: () => null,
      getString: (name: string) => options[name] ?? null,
      getInteger: (name: string) => options[name] ?? null
    },
    deferReply: vi.fn(async () => {}),
    editReply: vi.fn(async () => message),
    reply: vi.fn(async () => {}),
    ...extra
  }
  /** Presses a button or picks a menu option as someone other than the person who ran the command. */
  const pressAsStranger = async (customId: string) => {
    const reply = vi.fn(async () => {})
    await collected.handler?.({ user: { id: 'stranger' }, customId, values: ['mood'], reply, update: vi.fn() })
    return reply.mock.calls[0]
  }
  return { interaction, pressAsStranger }
}

const failing = (commandName: string) =>
  command(
    '',
    {},
    {
      commandName,
      options: {
        getSubcommand: () => {
          throw new Error('boom')
        }
      }
    }
  ).interaction

const anime = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    title: `Show ${index + 1}`,
    score: 8.1,
    episodes: 12,
    status: 'Finished Airing',
    synopsis: 'A quiet story.',
    url: `https://myanimelist.net/anime/${index + 1}`
  }))

const schedule = (count: number) => ({
  scope: 'day',
  label: 'Friday',
  total: count,
  entries: anime(count).map((entry) => ({
    ...entry,
    titleJapanese: null,
    type: 'TV',
    members: 1000,
    popularityRank: 10,
    broadcastDay: 'friday',
    broadcastTime: '23:00',
    broadcastTimezones: { JST: '23:00', EST: '09:00', GMT: '14:00' },
    season: 'fall',
    year: 2026
  }))
})

async function tools(): Promise<Record<string, unknown>> {
  fakes.searchAnime.mockResolvedValue({ results: [], total: 0 })
  fakes.getAnimeSchedule.mockResolvedValue(schedule(0))
  const notFound = [
    await every(() => handleAnime(command('search', { query: 'frieren' }).interaction as never)),
    await every(() => handleAnime(command('browse').interaction as never)),
    await every(() => handleSchedule(command('search', { anime: 'frieren' }).interaction as never))
  ]

  fakes.searchAnime.mockResolvedValue({ results: anime(6), total: 6 })
  fakes.getAnimeSchedule.mockResolvedValue(schedule(6))
  const animePages = command('browse')
  await handleAnime(animePages.interaction as never)
  const schedulePages = command('browse')
  await handleSchedule(schedulePages.interaction as never)

  return {
    'tools.notFound': digest(notFound),
    'tools.notYours': digest([
      await animePages.pressAsStranger('anime_next_interaction-1'),
      await schedulePages.pressAsStranger('sched_next_interaction-1')
    ]),
    'tools.error': digest(
      await every(async () => {
        const interaction = failing('remind')
        await createToolCommandHandler()(interaction as never)
        return interaction.reply.mock.calls
      })
    )
  }
}

async function reminders(): Promise<Record<string, unknown>> {
  const remind = (subcommand: string, options: Record<string, string | number> = {}) =>
    handleRemind(command(subcommand, options).interaction as never)

  fakes.reminders.createReminder.mockReturnValue({ id: 0, success: false, message: 'You already have 5 reminders.' })
  const refused = [remind('in', { task: 'tea', minutes: 15 }), remind('at', { task: 'tea', hour: 21 })]
  fakes.reminders.createReminder.mockReturnValue({ id: 7, success: true, message: 'Reminder set' })
  const set = [
    await every(() => remind('in', { task: 'tea', minutes: 15 })),
    await every(() => remind('at', { task: 'tea', hour: 21, minute: 5 }))
  ]
  fakes.reminders.getActiveReminders.mockReturnValue([])
  const none = remind('list')
  fakes.reminders.getReminderById.mockReturnValueOnce(null)
  const missing = remind('cancel', { id: 7 })
  fakes.reminders.getReminderById.mockReturnValueOnce({ id: 7, userId: 'stranger', reminder: 'tea', dueAt: NOW })
  const notYours = remind('cancel', { id: 7 })
  fakes.reminders.getReminderById.mockReturnValueOnce({ id: 7, userId: 'user-1', reminder: 'tea', dueAt: NOW })
  const cancelled = remind('cancel', { id: 7 })

  fakes.reminders.getDueReminders.mockReturnValueOnce([
    { id: 1, userId: 'user-1', channelId: 'open', reminder: 'water the plants' },
    { id: 2, userId: 'user-1', channelId: 'gone', reminder: 'call home' },
    { id: 3, userId: 'user-1', channelId: 'broken', reminder: 'stretch' }
  ])
  const sent: unknown[] = []
  const send = async (message: unknown) => {
    sent.push(message)
  }
  const client = {
    channels: {
      fetch: async (id: string) => {
        if (id === 'broken') throw new Error('Missing Access')
        return id === 'open' ? { send } : null
      }
    },
    users: { fetch: async () => ({ send }) }
  }
  startReminderScheduler(client as unknown as Client)
  await vi.advanceTimersByTimeAsync(config.reminders.checkIntervalMs)
  stopReminderScheduler()

  return {
    'reminders.command': digest([remind('nap'), ...refused, ...set, none, missing, notYours, cancelled]),
    'reminders.delivery': digest(sent)
  }
}

async function games(): Promise<Record<string, unknown>> {
  const sent: unknown[] = []
  const channel = {
    send: async (message: unknown) => {
      sent.push(message)
    }
  }
  createGameCommandHandler({ channels: { cache: new Map([['channel-1', channel]]) } } as unknown as Client)
  fakes.hangmanTimeout?.('channel-1', 'sakura')
  fakes.shiritoriGame = { active: false, currentPlayerOrder: ['Ren'], currentTurnIndex: 0 }
  fakes.shiritoriTimeout?.('channel-1', 'Mika')
  fakes.shiritoriGame = { active: true, currentPlayerOrder: ['Ren', 'Yuzu'], currentTurnIndex: 1 }
  fakes.shiritoriTimeout?.('channel-1', 'Mika')

  const failed = failing('hangman')
  await createGameCommandHandler()(failed as never)

  return { games: digest([...sent, ...failed.reply.mock.calls, handleHangmanGuide()]) }
}

async function status(): Promise<string[]> {
  let state = ''
  const client = {
    user: {
      setPresence: (presence: { activities: Array<{ state: string }> }) => {
        state = presence.activities[0].state
      }
    }
  } as unknown as Client
  const hours: string[] = []
  for (let hour = 0; hour < 24; hour++) {
    vi.setSystemTime(new Date(`2026-10-10T${String(hour).padStart(2, '0')}:30:00Z`))
    const lines = await every(() => {
      startStatusCycler(client)
      stopStatusCycler()
      return state
    })
    hours.push(lines.join('\n'))
  }
  vi.setSystemTime(NOW)
  return hours
}

async function stats(): Promise<Record<string, unknown>> {
  const guild = {
    client: { user: { id: 'bot-user' } },
    channels: { cache: new Map([['channel-1', { name: 'general' }]]) },
    members: {
      fetch: async (userId: string) => ({
        displayName: `Member ${userId}`,
        displayAvatarURL: () => `https://avatar.example/${userId}.png`
      })
    }
  }
  const views: unknown[] = []
  for (const rich of [true, false]) {
    fakes.richStats = rich
    for (const view of STATS_VIEWS) {
      views.push((await buildStatsView('guild-1', guild as never, view)).components[0].toJSON())
    }
  }
  fakes.richStats = true

  const letter = command('')
  await handleStatsCommand(letter.interaction as never)
  const ledger = command('', {}, { guildId: 'guild-1', guild })
  await handleStatsCommand(ledger.interaction as never)

  return {
    'stats.views': digest(views),
    'stats.command': digest([letter.interaction.reply.mock.calls, await ledger.pressAsStranger('stats:view')]),
    'stats.palette': digest([ROKA_CHART_PALETTE])
  }
}

function footers(): string[] {
  const footer = (payload: unknown) => JSON.stringify(payload).match(/-# 🌸[^"\\]*/)?.[0] ?? ''
  const reply = (
    toolsUsed: string[],
    post: SocialPostLookup = { status: 'none' },
    outcome: ReplyOutcome = 'none',
    watch: WatchOutcome | null = null
  ) => footer(buildRokaMessage('Hello there.', 'playful', toolsUsed, [], post, outcome, watch))
  const tools = [
    'roll_dice',
    'flip_coin',
    'get_current_time',
    'get_weather',
    'search_web',
    'search_anime',
    'get_anime_schedule',
    'set_reminder',
    'list_reminders',
    'cancel_reminder',
    'remember_user',
    'recall_user',
    'forget_user'
  ]
  const platforms: SocialPlatform[] = [
    'x',
    'bluesky',
    'youtube',
    'tiktok',
    'reddit',
    'instagram',
    'bilibili',
    'threads'
  ]
  const watches = (['video', 'audio'] as const).flatMap((kind): WatchOutcome[] => [
    { status: 'watched', kind, coverage: 'whole', durationSec: 60 },
    { status: 'watched', kind, coverage: 'part', startSec: 0, endSec: 40, durationSec: 60 },
    { status: 'watched', kind, coverage: 'part', startSec: 0, endSec: 10, durationSec: 60 },
    { status: 'watched', kind, coverage: 'skim' },
    { status: 'remembered', kind },
    { status: 'failed', kind }
  ])
  const found = (platform: SocialPlatform) =>
    ({ status: 'found', post: { platform, canonicalUrl: `https://example.com/${platform}` } }) as SocialPostLookup
  return [
    ...tools.map((tool) => reply([tool])),
    reply(tools),
    ...platforms.flatMap((platform) => [
      reply([], found(platform)),
      reply([], { status: 'failed', platform, reason: 'gone' }),
      ...watches.map((watch) => reply([], found(platform), 'none', { ...watch, fromLink: true }))
    ]),
    ...watches.map((watch) => reply([], { status: 'none' }, 'none', watch)),
    reply([], { status: 'none' }, 'found'),
    reply([], { status: 'none' }, 'failed'),
    String(MAX_TOOL_FOOTER_CHARS)
  ]
}

async function pools(draws: ReadonlyArray<() => string>): Promise<string> {
  const drawn: string[][] = []
  for (const draw of draws) drawn.push(await every(draw))
  return digest(drawn)
}

async function computeGolden(): Promise<Record<string, unknown>> {
  return {
    replies: await pools([getRandomDecline, getRandomBusy, getRandomError]),
    attachments: await pools([
      getRandomUnsupportedAttachment,
      getRandomPartialAttachment,
      getRandomOversizedAttachment,
      getRandomSkippedAttachments
    ]),
    reliability: digest([SAFETY_DEFLECTION, RECITATION_DEFLECTION, TERMINAL_DEFLECTION, ...KNOWN_FALLBACKS]),
    ...(await tools()),
    ...(await reminders()),
    ...(await games()),
    status: digest(await status()),
    commands: digest([buildCommandBody()]),
    ...(await stats()),
    footers: digest(footers())
  }
}

describe('lines golden', () => {
  it('posts exactly the lines it posted before', async () => {
    ;(config as { timezone?: string }).timezone = 'UTC'
    vi.useFakeTimers({ now: NOW })
    const golden = await computeGolden()
    vi.useRealTimers()
    if (process.env.UPDATE_LINES_GOLDEN === '1' || !existsSync(FIXTURE)) {
      writeFileSync(FIXTURE, `${JSON.stringify(golden, null, 2)}\n`)
    }
    expect(golden).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')))
  })
})
