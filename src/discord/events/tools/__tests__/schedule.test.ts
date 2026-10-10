import { ComponentType, MessageFlags } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GetAnimeScheduleResult, ScheduleEntry } from '../../../../agent/tools/getAnimeSchedule.js'

const { getAnimeSchedule } = vi.hoisted(() => ({ getAnimeSchedule: vi.fn() }))

vi.mock('../../../../agent/tools/getAnimeSchedule.js', () => ({ getAnimeSchedule }))

import { handleSchedule } from '../schedule.js'

const CURIOUS_ACCENT = 0xb2ebf2

interface JsonNode {
  type: number
  content?: string
  accent_color?: number
  custom_id?: string
  disabled?: boolean
  components?: JsonNode[]
}

interface Renderable {
  components: { toJSON(): unknown }[]
  flags?: number
}

type Handler = (arg?: never) => Promise<void>

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    title: 'Sousou no Frieren',
    titleJapanese: null,
    type: 'TV',
    episodes: 28,
    status: 'Currently Airing',
    score: 9.1,
    members: 500_000,
    popularityRank: 12,
    broadcastDay: 'friday',
    broadcastTime: '23:00',
    broadcastTimezones: { JST: '23:00', EST: '09:00', GMT: '14:00', CET: '15:00', SGT: '22:00' },
    season: 'winter',
    year: 2026,
    url: 'https://myanimelist.net/anime/52991',
    ...overrides
  }
}

function makeEntries(count: number): ScheduleEntry[] {
  return Array.from({ length: count }, (_, index) => makeEntry({ title: `Show ${index + 1}` }))
}

function makeResult(entries: ScheduleEntry[]): GetAnimeScheduleResult {
  return { scope: 'day', label: 'Friday', entries, total: entries.length }
}

function makeCollector() {
  const handlers: Record<string, Handler> = {}
  const collector = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers[event] = handler
      return collector
    })
  }
  return { collector, handlers }
}

function makeInteraction(subcommand: 'browse' | 'search' = 'browse', values: Record<string, string> = {}) {
  const { collector, handlers } = makeCollector()
  const reply = { createMessageComponentCollector: vi.fn(() => collector) }
  const interaction = {
    id: 'interaction-1',
    user: { id: 'user-1' },
    options: {
      getSubcommand: vi.fn(() => subcommand),
      getString: vi.fn((name: string) => values[name] ?? null)
    },
    editReply: vi.fn().mockResolvedValue(reply)
  }
  return { interaction, reply, handlers }
}

async function press(handlers: Record<string, Handler>, customId: string, userId = 'user-1') {
  const update = vi.fn().mockResolvedValue(undefined)
  const reply = vi.fn().mockResolvedValue(undefined)
  await handlers.collect({ user: { id: userId }, customId, update, reply } as never)
  return { update, reply }
}

function containerOf(message: Renderable): JsonNode {
  return message.components[0].toJSON() as JsonNode
}

function textOf(container: JsonNode): string {
  return (container.components ?? [])
    .filter((node) => node.type === ComponentType.TextDisplay)
    .map((node) => node.content ?? '')
    .join('\n')
}

function buttonsOf(container: JsonNode): JsonNode[] {
  return (container.components ?? [])
    .filter((node) => node.type === ComponentType.ActionRow)
    .flatMap((row) => row.components ?? [])
}

describe('/schedule option parsing', () => {
  beforeEach(() => {
    getAnimeSchedule.mockReset()
    getAnimeSchedule.mockResolvedValue(makeResult([makeEntry()]))
  })

  it('browse defaults to today with no sort override when no options are given', async () => {
    const { interaction } = makeInteraction()

    await handleSchedule(interaction as never)

    expect(getAnimeSchedule).toHaveBeenCalledWith({ scope: 'day', sort_by: undefined, limit: 25, anime: undefined })
  })

  it.each(['day', 'week', 'season'])('browse passes the %s scope and the chosen sort to the tool', async (scope) => {
    const { interaction } = makeInteraction('browse', { scope, sort_by: 'members' })

    await handleSchedule(interaction as never)

    expect(getAnimeSchedule).toHaveBeenCalledWith({ scope, sort_by: 'members', limit: 25, anime: undefined })
  })

  it('search passes only the anime name and ignores the browse-only options', async () => {
    const { interaction } = makeInteraction('search', { anime: 'Frieren', scope: 'week', sort_by: 'title' })

    await handleSchedule(interaction as never)

    expect(getAnimeSchedule).toHaveBeenCalledWith({ scope: 'day', sort_by: undefined, limit: 25, anime: 'Frieren' })
  })
})

describe('/schedule browse payload', () => {
  beforeEach(() => {
    getAnimeSchedule.mockReset()
    getAnimeSchedule.mockResolvedValue(makeResult([makeEntry()]))
  })

  it('sends one Components V2 container with a ranked header, entries and the accent colour when everything fits on one page', async () => {
    getAnimeSchedule.mockResolvedValueOnce(
      makeResult([
        makeEntry(),
        makeEntry({
          title: 'Second Show',
          score: 7.5,
          broadcastDay: 'monday',
          broadcastTime: '01:30',
          broadcastTimezones: { JST: '01:30', EST: '11:30', GMT: '16:30' }
        })
      ])
    )
    const { interaction } = makeInteraction()

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable
    const container = containerOf(message)
    const text = textOf(container)

    expect(message.flags).toBe(MessageFlags.IsComponentsV2)
    expect(container.type).toBe(ComponentType.Container)
    expect(container.accent_color).toBe(CURIOUS_ACCENT)
    expect(text).toContain('📅 **Friday** (sorted by score)')
    expect(text).toContain('1. **Sousou no Frieren** ⭐ 9.1\n   Friday at 23:00 JST (09:00 EST | 14:00 GMT)')
    expect(text).toContain('2. **Second Show** ⭐ 7.5\n   Monday at 01:30 JST (11:30 EST | 16:30 GMT)')
    expect(text).toContain('Showing 1-2 of 2 results')
    expect(buttonsOf(container)).toEqual([])
    expect(interaction.editReply).not.toHaveBeenCalled()
  })

  it('labels the header with the sort order the user asked for', async () => {
    const { interaction } = makeInteraction('browse', { sort_by: 'title' })

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable

    expect(textOf(containerOf(message))).toContain('(sorted by title)')
  })

  it('shows Broadcast TBA with no timezone suffix and no star for an entry without a slot', async () => {
    getAnimeSchedule.mockResolvedValueOnce(
      makeResult([
        makeEntry({
          title: 'Unscheduled',
          score: null,
          broadcastDay: null,
          broadcastTime: null,
          broadcastTimezones: null
        })
      ])
    )
    const { interaction } = makeInteraction()

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable
    const text = textOf(containerOf(message))

    expect(text).toContain('1. **Unscheduled** \n   Broadcast TBA')
    expect(text).not.toContain('⭐')
  })

  it('falls back to the first two timezones in the list when neither EST nor GMT is present', async () => {
    getAnimeSchedule.mockResolvedValueOnce(
      makeResult([makeEntry({ broadcastTimezones: { JST: '23:00', CET: '15:00', SGT: '22:00' } })])
    )
    const { interaction } = makeInteraction()

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable

    expect(textOf(containerOf(message))).toContain('Friday at 23:00 JST (23:00 JST | 15:00 CET)')
  })
})

describe('/schedule empty and single-anime results', () => {
  beforeEach(() => {
    getAnimeSchedule.mockReset()
  })

  it('answers with a not-found message in the accent colour when the schedule is empty', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult([]))
    const { interaction } = makeInteraction()

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable
    const container = containerOf(message)

    expect(container.accent_color).toBe(CURIOUS_ACCENT)
    expect(textOf(container)).toContain('nothing found for that')
    expect(buttonsOf(container)).toEqual([])
    expect(interaction.editReply).not.toHaveBeenCalled()
  })

  it('search with no match returns the same not-found message', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult([]))
    const { interaction } = makeInteraction('search', { anime: 'Nope' })

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable

    expect(getAnimeSchedule).toHaveBeenCalledWith(expect.objectContaining({ anime: 'Nope' }))
    expect(textOf(containerOf(message))).toContain('nothing found for that')
  })

  it('search renders the matched anime with score, broadcast, timezones, season and MAL link', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult([makeEntry()]))
    const { interaction } = makeInteraction('search', { anime: 'Frieren' })

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable
    const container = containerOf(message)
    const text = textOf(container)

    expect(text).toContain('🔍 **Sousou no Frieren**')
    expect(text).toContain('TV • 28 eps • ⭐ 9.1 • Currently Airing')
    expect(text).toContain('📅 Friday at 23:00 JST')
    expect(text).toContain('🕐 23:00 JST | 09:00 EST | 14:00 GMT | 15:00 CET | 22:00 SGT')
    expect(text).toContain('🌸 Winter 2026')
    expect(text).toContain('[↗ MAL](https://myanimelist.net/anime/52991)')
    expect(buttonsOf(container)).toEqual([])
    expect(interaction.editReply).not.toHaveBeenCalled()
  })

  it('search falls back to placeholders when episodes, score, broadcast and season are unknown', async () => {
    getAnimeSchedule.mockResolvedValueOnce(
      makeResult([
        makeEntry({
          episodes: null,
          score: null,
          status: 'Not yet aired',
          broadcastDay: null,
          broadcastTime: null,
          broadcastTimezones: null,
          season: null,
          year: null
        })
      ])
    )
    const { interaction } = makeInteraction('search', { anime: 'Frieren' })

    const message = (await handleSchedule(interaction as never)) as unknown as Renderable
    const text = textOf(containerOf(message))

    expect(text).toContain('TV • ? eps • No score yet • Not yet aired')
    expect(text).toContain('📅 Broadcast TBA')
    expect(text).not.toContain('🕐')
    expect(text).not.toContain('🌸')
  })
})

describe('/schedule pagination', () => {
  beforeEach(() => {
    getAnimeSchedule.mockReset()
  })

  it('a multi-page browse edits the reply with page one, Prev disabled, Next enabled and a 60-second collector', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult(makeEntries(7)))
    const { interaction, reply } = makeInteraction()

    const payload = await handleSchedule(interaction as never)

    expect(payload).toBeUndefined()
    expect(interaction.editReply).toHaveBeenCalledOnce()
    const sent = interaction.editReply.mock.calls[0][0]
    const container = containerOf(sent)
    const text = textOf(container)
    expect(sent.flags).toBe(MessageFlags.IsComponentsV2)
    expect(container.accent_color).toBe(CURIOUS_ACCENT)
    expect(text).toContain('Show 5')
    expect(text).not.toContain('Show 6')
    expect(text).toContain('Showing 1-5 of 7 results • Page 1/2')
    const [prev, next] = buttonsOf(container)
    expect(prev).toMatchObject({ custom_id: 'sched_prev_interaction-1', disabled: true })
    expect(next).toMatchObject({ custom_id: 'sched_next_interaction-1', disabled: false })
    expect(reply.createMessageComponentCollector).toHaveBeenCalledWith({
      componentType: ComponentType.Button,
      time: 60_000
    })
  })

  it('Next and Prev move the page for the user who ran the command', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult(makeEntries(7)))
    const { interaction, handlers } = makeInteraction()
    await handleSchedule(interaction as never)

    const next = await press(handlers, 'sched_next_interaction-1')
    const nextContainer = containerOf(next.update.mock.calls[0][0])
    expect(textOf(nextContainer)).toContain('Show 6')
    expect(textOf(nextContainer)).toContain('Showing 6-7 of 7 results • Page 2/2')
    const [prevOnLast, nextOnLast] = buttonsOf(nextContainer)
    expect(prevOnLast).toMatchObject({ disabled: false })
    expect(nextOnLast).toMatchObject({ disabled: true })

    const prev = await press(handlers, 'sched_prev_interaction-1')
    expect(textOf(containerOf(prev.update.mock.calls[0][0]))).toContain('Showing 1-5 of 7 results • Page 1/2')
  })

  it('Next stops at the last page and Prev stops at the first', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult(makeEntries(7)))
    const { interaction, handlers } = makeInteraction()
    await handleSchedule(interaction as never)

    const atStart = await press(handlers, 'sched_prev_interaction-1')
    expect(textOf(containerOf(atStart.update.mock.calls[0][0]))).toContain('Page 1/2')

    await press(handlers, 'sched_next_interaction-1')
    const pastEnd = await press(handlers, 'sched_next_interaction-1')
    expect(textOf(containerOf(pastEnd.update.mock.calls[0][0]))).toContain('Page 2/2')
  })

  it("ignores another user's button press with an ephemeral reply and leaves the page alone", async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult(makeEntries(7)))
    const { interaction, handlers } = makeInteraction()
    await handleSchedule(interaction as never)

    const intruder = await press(handlers, 'sched_next_interaction-1', 'other-user')

    expect(intruder.reply).toHaveBeenCalledWith({
      content: "Those buttons aren't for you~",
      flags: MessageFlags.Ephemeral
    })
    expect(intruder.update).not.toHaveBeenCalled()
  })

  it('removes the buttons and keeps the current page when the collector ends', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult(makeEntries(7)))
    const { interaction, handlers } = makeInteraction()
    await handleSchedule(interaction as never)
    await press(handlers, 'sched_next_interaction-1')

    await handlers.end()

    const endedContainer = containerOf(interaction.editReply.mock.calls.at(-1)?.[0])
    expect(buttonsOf(endedContainer)).toEqual([])
    expect(textOf(endedContainer)).toContain('Page 2/2')
  })

  it('swallows a failed edit when the collector ends', async () => {
    getAnimeSchedule.mockResolvedValueOnce(makeResult(makeEntries(7)))
    const { interaction, reply, handlers } = makeInteraction()
    interaction.editReply.mockResolvedValueOnce(reply).mockRejectedValueOnce(new Error('Unknown Message'))
    await handleSchedule(interaction as never)

    await expect(handlers.end()).resolves.toBeUndefined()
  })
})

describe('/schedule tool failure', () => {
  beforeEach(() => {
    getAnimeSchedule.mockReset()
  })

  it('lets a rejected lookup propagate so the router can answer with its error message', async () => {
    getAnimeSchedule.mockRejectedValueOnce(new Error('Jikan unavailable'))
    const { interaction } = makeInteraction()

    await expect(handleSchedule(interaction as never)).rejects.toThrow('Jikan unavailable')
    expect(interaction.editReply).not.toHaveBeenCalled()
  })
})
