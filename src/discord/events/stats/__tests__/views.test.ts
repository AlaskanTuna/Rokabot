import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queries = vi.hoisted(() => ({
  activeClaimCount: vi.fn(),
  activityByDay: vi.fn(),
  busiestChannel: vi.fn(),
  chatsSince: vi.fn(),
  distinctRememberedUsers: vi.fn(),
  hourHistogram: vi.fn(),
  latencyPercentiles: vi.fn(),
  legacyFactCount: vi.fn(),
  outcomeBreakdown: vi.fn(),
  retrySummary: vi.fn(),
  tokenTotals: vi.fn(),
  topTones: vi.fn()
}))

const charts = vi.hoisted(() => ({
  renderActivitySparkline: vi.fn(),
  renderToneBarChart: vi.fn()
}))

vi.mock('../queries.js', () => queries)
vi.mock('../charts.js', () => charts)

import { handleStatsCommand } from '../statsCommand.js'
import { TONE_KAOMOJI, buildStatsView } from '../views.js'

function contentFor(payload: Awaited<ReturnType<typeof buildStatsView>>): string {
  return JSON.stringify(payload.components[0].toJSON())
}

function selectsFor(payload: Awaited<ReturnType<typeof buildStatsView>>) {
  return payload.components[0]
    .toJSON()
    .components.filter((component) => component.type === 1)
    .flatMap((row) => row.components)
}

beforeEach(() => {
  vi.resetAllMocks()
  queries.topTones.mockReturnValue([
    { tone: 'playful', count: 8 },
    { tone: 'sincere', count: 4 },
    { tone: 'domestic', count: 2 }
  ])
  queries.chatsSince.mockReturnValue(14)
  queries.busiestChannel.mockReturnValue({ channelId: 'channel-1', count: 9 })
  queries.hourHistogram.mockReturnValue([{ hour: 1, count: 6 }])
  queries.activeClaimCount.mockReturnValue(3)
  queries.activityByDay.mockReturnValue([
    { day: '2026-07-20', count: 2 },
    { day: '2026-07-21', count: 5 }
  ])
  queries.distinctRememberedUsers.mockReturnValue(2)
  queries.legacyFactCount.mockReturnValue(4)
  queries.latencyPercentiles.mockReturnValue({
    e2e: { p50: 100, p95: 250 },
    generate: { p50: 80, p95: 220 },
    llm: { p50: 70, p95: 190 }
  })
  queries.retrySummary.mockReturnValue({ totalRetries: 3, retriedChats: 2, retryLatencyMs: 90 })
  queries.outcomeBreakdown.mockReturnValue([
    { outcome: 'ok', count: 12 },
    { outcome: 'fallback', count: 2 }
  ])
  queries.tokenTotals.mockReturnValue({ input: 1234, output: 567, total: 1801 })
  charts.renderActivitySparkline.mockResolvedValue(Buffer.from('sparkline'))
  charts.renderToneBarChart.mockResolvedValue(Buffer.from('bars'))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/stats views', () => {
  it('renders an overview Components V2 payload with mood, channel, night-owl fun fact, and sparkline', async () => {
    const payload = await buildStatsView('guild-1', 'overview', '7d')
    const json = payload.components[0].toJSON()
    const content = contentFor(payload)

    expect(payload.flags).toBeDefined()
    expect(json.type).toBe(17)
    expect(json.accent_color).toBe(0xffb3d9)
    expect(content).toContain('<#channel-1>')
    expect(content).toContain('night owl')
    expect(content).toContain(TONE_KAOMOJI.playful)
    expect(selectsFor(payload)).toHaveLength(2)
    expect(payload.files).toHaveLength(1)
    expect(JSON.stringify(json)).toContain('attachment://stats-activity.png')
  })

  it('preserves the selected window when changing the stats view', async () => {
    const selects = selectsFor(await buildStatsView('guild-1', 'mood', '30d'))
    const viewSelect = selects.find((select) => select.custom_id === 'stats:view:30d')!
    const windowSelect = selects.find((select) => select.custom_id === 'stats:window:mood')!

    expect(viewSelect.options.find((option) => option.value === 'mood')?.default).toBe(true)
    expect(windowSelect.options.find((option) => option.value === '30d')?.default).toBe(true)
  })

  it('preserves the selected view when changing the stats window', async () => {
    const selects = selectsFor(await buildStatsView('guild-1', 'nerd', '90d'))
    const viewSelect = selects.find((select) => select.custom_id === 'stats:view:90d')!
    const windowSelect = selects.find((select) => select.custom_id === 'stats:window:nerd')!

    expect(viewSelect.options.find((option) => option.value === 'nerd')?.default).toBe(true)
    expect(windowSelect.options.find((option) => option.value === '90d')?.default).toBe(true)
  })

  it('renders twelve tone bars beside all-time totals and adds the chart', async () => {
    const payload = await buildStatsView('guild-1', 'mood', '7d')
    const content = contentFor(payload)

    expect(content).toContain('All Time')
    expect(content.match(/playful/g)?.length).toBeGreaterThanOrEqual(1)
    expect(content).toContain('competitive')
    expect(payload.files).toHaveLength(1)
    expect(JSON.stringify(payload.components[0].toJSON())).toContain('attachment://stats-mood.png')
  })

  it('renders memory counts without leaking distinctive fact values', async () => {
    const payload = await buildStatsView('guild-1', 'memory', '7d')
    const content = contentFor(payload)

    expect(content).toContain('3')
    expect(content).toContain('2')
    expect(content).toContain('4')
    expect(content).not.toContain('forbidden-memory-value')
    expect(content).not.toContain('secret-predicate')
    expect(queries.activeClaimCount).toHaveBeenCalledWith('guild-1')
    expect(queries.distinctRememberedUsers).toHaveBeenCalledWith('guild-1')
    expect(queries.legacyFactCount).toHaveBeenCalledWith('guild-1')
    expect(queries.topTones).not.toHaveBeenCalled()
    expect(payload.files).toEqual([])
  })

  it('does not expose seeded memory values in the memory view', async () => {
    vi.doUnmock('../queries.js')
    vi.resetModules()
    vi.stubEnv('ROKABOT_DB_PATH', ':memory:')
    const { closeDb, getDb } = await import('../../../../storage/database.js')
    const { buildStatsView: buildRealStatsView } = await import('../views.js')
    const database = getDb()
    database
      .prepare(
        `INSERT INTO memory_claim (
          guild_id, subject_user_id, predicate, value, source_kind, status, first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('guild-privacy', 'user-1', 'secret-predicate', 'forbidden-memory-value', 'explicit', 'active', 1, 1)
    database
      .prepare('INSERT INTO user_memory (guild_id, user_id, fact_key, fact_value, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('guild-privacy', 'user-1', 'forbidden-fact-key', 'forbidden-legacy-fact', 1)

    const content = JSON.stringify((await buildRealStatsView('guild-privacy', 'memory', '7d')).components[0].toJSON())

    expect(content).not.toContain('secret-predicate')
    expect(content).not.toContain('forbidden-memory-value')
    expect(content).not.toContain('forbidden-legacy-fact')
    closeDb()
  })

  it('renders window-scoped technical metrics', async () => {
    const content = contentFor(await buildStatsView('guild-1', 'nerd', '30d'))

    expect(content).toContain('p50')
    expect(content).toContain('p95')
    expect(content).toContain('1,801')
    expect(queries.latencyPercentiles).toHaveBeenCalledWith('guild-1', expect.any(Number))
  })

  it('uses kaomoji only for all twelve tone faces', () => {
    expect(Object.keys(TONE_KAOMOJI)).toHaveLength(12)
    for (const kaomoji of Object.values(TONE_KAOMOJI)) {
      expect(kaomoji).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })

  it('keeps the text source of truth and omits attachments when chart rendering fails', async () => {
    charts.renderActivitySparkline.mockResolvedValueOnce(null)
    charts.renderToneBarChart.mockResolvedValueOnce(null)

    const overview = await buildStatsView('guild-1', 'overview', '7d')
    const mood = await buildStatsView('guild-1', 'mood', '7d')

    expect(contentFor(overview)).toContain('Chats in This Window')
    expect(contentFor(mood)).toContain('All Time')
    expect(overview.files).toEqual([])
    expect(mood.files).toEqual([])
  })

  it('keeps controls owner-only, rerenders statelessly, and disables them when the collector ends', async () => {
    const handlers: Record<string, (component: never) => Promise<void>> = {}
    const collector = {
      on: vi.fn((event: string, handler: (component: never) => Promise<void>) => {
        handlers[event] = handler
        return collector
      })
    }
    const reply = { createMessageComponentCollector: vi.fn(() => collector) }
    const deferReply = vi.fn().mockResolvedValue(undefined)
    const editReply = vi.fn().mockResolvedValue(reply)
    const interaction = {
      guildId: 'guild-1',
      user: { id: 'owner-1' },
      deferReply,
      editReply
    } as never

    await handleStatsCommand(interaction)

    expect(deferReply).toHaveBeenCalledOnce()
    expect(selectsFor(editReply.mock.calls[0][0])).toHaveLength(2)

    const decline = vi.fn().mockResolvedValue(undefined)
    await handlers.collect({ user: { id: 'other-user' }, reply: decline } as never)
    expect(decline).toHaveBeenCalledWith(expect.objectContaining({ flags: expect.any(Number) }))

    const update = vi.fn().mockResolvedValue(undefined)
    await handlers.collect({
      user: { id: 'owner-1' },
      customId: 'stats:view:30d',
      values: ['nerd'],
      update
    } as never)
    const rerendered = selectsFor(update.mock.calls[0][0])
    expect(update.mock.calls[0][0].files).toEqual([])
    expect(
      rerendered
        .find((select) => select.custom_id === 'stats:window:nerd')
        ?.options.find((option) => option.value === '30d')?.default
    ).toBe(true)

    await handlers.collect({
      user: { id: 'owner-1' },
      customId: 'stats:window:nerd',
      values: ['90d'],
      update
    } as never)
    const windowRerendered = selectsFor(update.mock.calls[1][0])
    expect(
      windowRerendered
        .find((select) => select.custom_id === 'stats:view:90d')
        ?.options.find((option) => option.value === 'nerd')?.default
    ).toBe(true)

    await handlers.end()
    const ended = selectsFor(editReply.mock.calls.at(-1)![0])
    expect(ended).toHaveLength(2)
    expect(ended.every((select) => select.disabled)).toBe(true)
  })
})
