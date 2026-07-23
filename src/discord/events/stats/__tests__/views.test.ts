import { beforeEach, describe, expect, it, vi } from 'vitest'

const queries = vi.hoisted(() => ({
  activeClaimCount: vi.fn(),
  activityByDay: vi.fn(),
  busiestChannel: vi.fn(),
  chatsSince: vi.fn(),
  currentAndBestStreak: vi.fn(),
  distinctRememberedUsers: vi.fn(),
  latencyE2e: vi.fn(),
  memoryGrowthSeries: vi.fn(),
  mostActiveDay: vi.fn(),
  mostActiveHour: vi.fn(),
  mostUsedTool: vi.fn(),
  newClaimsThisMonth: vi.fn(),
  p95ByDay: vi.fn(),
  retrySummary: vi.fn(),
  successRate: vi.fn(),
  tokenTotals: vi.fn(),
  topPredicates: vi.fn(),
  topRememberedMembers: vi.fn(),
  topTones: vi.fn(),
  topChannels: vi.fn(),
  triggerSplit: vi.fn(),
  uniqueChatters: vi.fn()
}))

const charts = vi.hoisted(() => ({
  TONE_EMOJI: { domestic: '🫖', flustered: '💗', playful: '🎈' },
  renderActivityHeatmap: vi.fn(),
  renderChannelHistogram: vi.fn(),
  renderLatencyTrend: vi.fn(),
  renderMemoryGrowth: vi.fn(),
  renderMoodDonut: vi.fn()
}))

const errors = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }))

vi.mock('../queries.js', () => queries)
vi.mock('../charts.js', () => charts)
vi.mock('../../../errorHandler.js', () => ({ isIgnorableDiscordError: () => false }))
vi.mock('../../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: errors.error, info: vi.fn(), warn: errors.warn }
}))

import { handleStatsCommand } from '../statsCommand.js'
import { buildStatsView, getMoodLabel } from '../views.js'

const guild = {
  channels: { cache: new Map([['channel-1', { name: 'general' }]]) },
  members: {
    fetch: vi.fn(async (userId: string) =>
      userId === 'departed'
        ? null
        : { displayName: `Member ${userId}`, displayAvatarURL: () => `https://avatar/${userId}` }
    )
  }
} as never

function jsonFor(payload: Awaited<ReturnType<typeof buildStatsView>>) {
  return payload.components[0].toJSON()
}

function contentFor(payload: Awaited<ReturnType<typeof buildStatsView>>) {
  return JSON.stringify(jsonFor(payload))
}

function selectsFor(payload: Awaited<ReturnType<typeof buildStatsView>>) {
  return jsonFor(payload)
    .components.filter((component) => component.type === 1)
    .flatMap((row) => row.components)
}

beforeEach(() => {
  vi.resetAllMocks()
  queries.topTones.mockReturnValue([
    { tone: 'domestic', count: 38 },
    { tone: 'flustered', count: 24 },
    { tone: 'playful', count: 21 }
  ])
  queries.chatsSince.mockReturnValue(1234)
  queries.uniqueChatters.mockReturnValue(57)
  queries.busiestChannel.mockReturnValue({ channelId: 'channel-1', count: 42 })
  queries.topChannels.mockReturnValue([{ channelId: 'channel-1', count: 42 }])
  queries.mostActiveDay.mockReturnValue({ day: 'Jul 15', count: 31 })
  queries.mostActiveHour.mockReturnValue({ hour: 1, count: 10 })
  queries.currentAndBestStreak.mockReturnValue({ current: 12, best: 21 })
  queries.mostUsedTool.mockReturnValue({ tool: 'get_weather', count: 8 })
  queries.triggerSplit.mockReturnValue([
    { trigger: 'mention', count: 16 },
    { trigger: 'reply', count: 5 },
    { trigger: 'name_keyword', count: 2 },
    { trigger: 'slash', count: 1 }
  ])
  queries.activeClaimCount.mockReturnValue(13)
  queries.distinctRememberedUsers.mockReturnValue(4)
  queries.newClaimsThisMonth.mockReturnValue(6)
  queries.topPredicates.mockReturnValue([
    { predicate: 'favorite_anime', count: 5 },
    { predicate: 'hobbies', count: 4 }
  ])
  queries.topRememberedMembers.mockReturnValue([
    { userId: 'user-1', count: 5, predicate: 'favorite_anime' },
    { userId: 'departed', count: 4, predicate: 'favorite_food' }
  ])
  queries.memoryGrowthSeries.mockReturnValue([{ day: '2026-07-23', cumulative: 6 }])
  queries.latencyE2e.mockReturnValue({ p50: 3000, p95: 6100, min: 500, max: 9100, total: 1_440_000 })
  queries.successRate.mockReturnValue({ ok: 33, total: 34, failures: [{ outcome: 'fallback', count: 1 }] })
  queries.retrySummary.mockReturnValue({ totalRetries: 3, retriedChats: 2, retryLatencyMs: 90 })
  queries.tokenTotals.mockReturnValue({ input: 188000, output: 3200, total: 191200 })
  queries.p95ByDay.mockReturnValue([{ day: '2026-07-23', p95: 6100 }])
  charts.renderActivityHeatmap.mockResolvedValue(Buffer.from('heatmap'))
  charts.renderChannelHistogram.mockResolvedValue(Buffer.from('channels'))
  charts.renderMoodDonut.mockResolvedValue(Buffer.from('mood'))
  charts.renderMemoryGrowth.mockResolvedValue(Buffer.from('memory'))
  charts.renderLatencyTrend.mockResolvedValue(Buffer.from('latency'))
})

describe('/stats redesigned views', () => {
  it.each(['overview', 'mood', 'memory', 'nerd'] as const)('renders a valid %s Components V2 payload', async (view) => {
    const payload = await buildStatsView('guild-1', guild, view)
    const content = contentFor(payload)

    expect(payload.flags).toBeDefined()
    expect(jsonFor(payload).type).toBe(17)
    expect(content).toContain('Last 30 Days')
    expect(content).toMatch(/### [📊🎭🌸🔧]/u)
    expect(content).toMatch(/> \*\*.+:\*\* `.+`/)
    expect(content).not.toMatch(/[\^_]{2,}/)
  })

  it('renders overview-only server activity with two chart attachments and one emoji view select', async () => {
    const payload = await buildStatsView('guild-1', guild, 'overview')
    const content = contentFor(payload)
    const select = selectsFor(payload).at(0)!

    expect(content).toContain('Chats This Month')
    expect(content).toContain('<#channel-1>')
    expect(content).not.toContain('Top 3 Moods')
    expect(payload.files).toHaveLength(2)
    expect(select.custom_id).toBe('stats:view')
    expect(selectsFor(payload)).toHaveLength(1)
    expect(select.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Overview', emoji: { name: '📊' }, default: true }),
        expect.objectContaining({ label: 'Mood', emoji: { name: '🎭' } }),
        expect.objectContaining({ label: 'Memory', emoji: { name: '🌸' } }),
        expect.objectContaining({ label: 'Nerd', emoji: { name: '🔧' } })
      ])
    )
    expect(queries.activityByDay).toHaveBeenCalledWith('guild-1', expect.any(Number))
  })

  it('labels mood deterministically and uses its top-three summary as the sole caption', async () => {
    const payload = await buildStatsView('guild-1', guild, 'mood')
    const content = contentFor(payload)

    expect(getMoodLabel('domestic', 'flustered')).toBe('A Cozy Little Panic')
    expect(getMoodLabel('sleepy', null)).toBeTruthy()
    expect(content).toContain('A Cozy Little Panic')
    expect(content).toContain('Mostly domestic (`46%`), with flustered (`29%`) and playful (`25%`) close behind')
    expect(payload.files).toHaveLength(1)
  })

  it('renders memory sections with avatars while omitting values and departed members', async () => {
    const payload = await buildStatsView('guild-1', guild, 'memory')
    const content = contentFor(payload)

    expect(content).toContain('Active Memories')
    expect(content).toContain('Member user-1')
    expect(content).toContain('I remember their favorite anime~')
    expect(content).not.toContain('departed')
    expect(content).not.toContain('forbidden-memory-value')
    expect(content).not.toContain('secret-predicate')
    expect(queries.topRememberedMembers).toHaveBeenCalledWith('guild-1', expect.any(Number))
    expect(payload.files).toHaveLength(1)
    const countComponents = (node: { components?: unknown[] }): number =>
      1 + (node.components ?? []).reduce<number>((sum, child) => sum + countComponents(child as never), 0)
    expect(countComponents(jsonFor(payload))).toBeLessThanOrEqual(40)
    expect(content.length).toBeLessThanOrEqual(4000)
  })

  it('renders e2e-only nerd metrics, including nonzero failures and word estimates', async () => {
    const content = contentFor(await buildStatsView('guild-1', guild, 'nerd'))

    expect(content).toContain('Response Time')
    expect(content).toContain('3.0s / 6.1s')
    expect(content).toContain('fallback: 1')
    expect(content).toContain('141,000')
    expect(content).not.toContain('Generate')
    expect(content).not.toContain('LLM')
  })

  it('keeps text fallbacks when a chart renderer is unavailable', async () => {
    charts.renderMoodDonut.mockResolvedValueOnce(null)
    const payload = await buildStatsView('guild-1', guild, 'mood')

    expect(contentFor(payload)).toContain('Top 3 Moods')
    expect(payload.files).toEqual([])
  })

  it('keeps the single select owner-only and disables it after 120 seconds', async () => {
    const handlers: Record<string, (component: never) => Promise<void>> = {}
    const collector = {
      on: vi.fn((event: string, handler: (component: never) => Promise<void>) => {
        handlers[event] = handler
        return collector
      })
    }
    const reply = { createMessageComponentCollector: vi.fn(() => collector) }
    const editReply = vi.fn().mockResolvedValue(reply)
    const interaction = {
      guildId: 'guild-1',
      guild,
      user: { id: 'owner-1' },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply
    } as never

    await handleStatsCommand(interaction)
    expect(reply.createMessageComponentCollector).toHaveBeenCalledWith(expect.objectContaining({ time: 120_000 }))

    const decline = vi.fn().mockResolvedValue(undefined)
    await handlers.collect({ user: { id: 'other-user' }, reply: decline } as never)
    expect(decline).toHaveBeenCalledOnce()

    const update = vi.fn().mockResolvedValue(undefined)
    await handlers.collect({ user: { id: 'owner-1' }, customId: 'stats:view', values: ['nerd'], update } as never)
    expect(
      selectsFor(update.mock.calls[0][0])
        .at(0)
        ?.options.find((option) => option.value === 'nerd')?.default
    ).toBe(true)

    await handlers.end()
    expect(selectsFor(editReply.mock.calls.at(-1)![0]).at(0)?.disabled).toBe(true)
  })
})
