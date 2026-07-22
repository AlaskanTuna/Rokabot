import { describe, expect, it, vi } from 'vitest'
import type { BuddyData } from '../../../../games/buddy.js'
import { SPECIES } from '../../../../games/data/buddySpecies.js'

const { getBuddyCollection } = vi.hoisted(() => ({ getBuddyCollection: vi.fn() }))

vi.mock('../../../../games/buddy.js', () => ({ getBuddyCollection }))
vi.mock('../../../../games/hangman.js', () => ({ setTimeoutCallback: vi.fn() }))
vi.mock('../../../../games/shiritori.js', () => ({ getGame: vi.fn(), setTimeoutCallback: vi.fn() }))
vi.mock('../hangman.js', () => ({
  HANGMAN_COLORS: { lose: 0 },
  handleHangmanGuess: vi.fn(),
  handleHangmanGuide: vi.fn(),
  handleHangmanStart: vi.fn()
}))
vi.mock('../leaderboard.js', () => ({ handleLeaderboard: vi.fn() }))
vi.mock('../shiritori.js', () => ({
  SHIRITORI_COLORS: { info: 0 },
  handleShiritoriEnd: vi.fn(),
  handleShiritoriGuide: vi.fn(),
  handleShiritoriJoin: vi.fn(),
  handleShiritoriPlay: vi.fn(),
  handleShiritoriScoresCmd: vi.fn(),
  handleShiritoriStart: vi.fn()
}))

import { createGameCommandHandler } from '../../gameCommands.js'
import { buildCollectionPage, getCollectionPageCount, handleBuddyCollection } from '../collection.js'

function createBuddy(
  name: string,
  species: BuddyData['species'],
  rarity: BuddyData['rarity'],
  hatchedAt: number
): BuddyData {
  return {
    userId: 'user-1',
    species,
    rarity,
    shiny: false,
    eyes: 'round',
    hat: 'none',
    name,
    personality: null,
    stats: {},
    hatchedAt
  }
}

describe('collection pagination helpers', () => {
  it('calculates page counts with one page for an empty collection', () => {
    expect(getCollectionPageCount(0, 2)).toBe(1)
    expect(getCollectionPageCount(1, 2)).toBe(1)
    expect(getCollectionPageCount(5, 2)).toBe(3)
  })

  it('renders only the requested collection slice with buddy details and thumbnails', () => {
    const buddies = [
      createBuddy('Mochimaru', 'mochi', 'common', Date.UTC(2026, 6, 22)),
      createBuddy('Foxchan', 'kitsune', 'rare', Date.UTC(2026, 6, 21)),
      createBuddy('Oniro', 'oni', 'legendary', Date.UTC(2026, 6, 20))
    ]

    const payload = buildCollectionPage(buddies, 1, 2)
    const container = payload.components[0].toJSON()
    const content = JSON.stringify(container)

    expect(content).toContain('Oniro')
    expect(content).toContain('LEGENDARY')
    expect(content).toContain('20/07/2026')
    expect(content).not.toContain('Mochimaru')
    expect(content).not.toContain('Foxchan')
    expect(content).toContain(SPECIES.find(({ id }) => id === 'oni')!.spriteUrl)
  })

  it('renders a friendly empty state without buttons', () => {
    const payload = buildCollectionPage([], 0, 5)
    const container = payload.components[0].toJSON()

    expect(JSON.stringify(container)).toContain('Use `/gacha hatch` to get one!')
    expect(container.components).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 1 })]))
  })

  it('returns a rendered page for a single-buddy collection and an empty collection', async () => {
    const interaction = { user: { id: 'user-1' } } as never

    getBuddyCollection.mockReturnValueOnce([createBuddy('Mochimaru', 'mochi', 'common', Date.UTC(2026, 6, 22))])
    const singlePage = await handleBuddyCollection(interaction)

    expect(JSON.stringify(singlePage?.components[0].toJSON())).toContain('Mochimaru')

    getBuddyCollection.mockReturnValueOnce([])
    const emptyPage = await handleBuddyCollection(interaction)

    expect(JSON.stringify(emptyPage?.components[0].toJSON())).toContain('Use `/gacha hatch` to get one!')
  })

  it('paginates for the invoker and removes controls when the collector ends', async () => {
    const buddies = Array.from({ length: 6 }, (_, index) =>
      createBuddy(`Buddy ${index + 1}`, 'mochi', 'common', Date.UTC(2026, 6, 22 - index))
    )
    const handlers: Record<string, (interaction?: never) => Promise<void>> = {}
    const collector = {
      on: vi.fn((event: string, handler: (interaction?: never) => Promise<void>) => {
        handlers[event] = handler
        return collector
      })
    }
    const reply = { createMessageComponentCollector: vi.fn(() => collector) }
    const editReply = vi.fn().mockResolvedValue(reply)
    const interaction = {
      id: 'interaction-1',
      user: { id: 'user-1' },
      editReply
    } as never

    getBuddyCollection.mockReturnValueOnce(buddies)

    await expect(handleBuddyCollection(interaction)).resolves.toBeUndefined()

    const firstPage = editReply.mock.calls[0][0].components[0].toJSON()
    const firstButtons = firstPage.components.find((component: { type: number }) => component.type === 1)!.components
    expect(firstButtons[0].disabled).toBe(true)
    expect(firstButtons[1].disabled).toBe(false)

    const update = vi.fn().mockResolvedValue(undefined)
    await handlers.collect({ user: { id: 'user-1' }, customId: 'collection_next_interaction-1', update } as never)

    const lastPage = update.mock.calls[0][0].components[0].toJSON()
    const lastButtons = lastPage.components.find((component: { type: number }) => component.type === 1)!.components
    expect(lastButtons[0].disabled).toBe(false)
    expect(lastButtons[1].disabled).toBe(true)

    const reject = vi.fn().mockResolvedValue(undefined)
    await handlers.collect({
      user: { id: 'other-user' },
      customId: 'collection_prev_interaction-1',
      reply: reject
    } as never)
    expect(reject).toHaveBeenCalledOnce()
    expect(update).toHaveBeenCalledOnce()

    await handlers.end()

    const endedPage = editReply.mock.calls.at(-1)![0].components[0].toJSON()
    expect(endedPage.components).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 1 })]))
  })

  it('routes the collection subcommand through a deferred reply', async () => {
    getBuddyCollection.mockReturnValueOnce([createBuddy('Mochimaru', 'mochi', 'common', Date.UTC(2026, 6, 22))])
    const deferReply = vi.fn().mockResolvedValue(undefined)
    const editReply = vi.fn().mockResolvedValue(undefined)
    const interaction = {
      commandName: 'gacha',
      channelId: 'channel-1',
      deferred: false,
      replied: false,
      id: 'interaction-1',
      user: { id: 'user-1' },
      options: { getSubcommand: () => 'collection' },
      deferReply,
      editReply
    } as never

    await expect(createGameCommandHandler()(interaction)).resolves.toBe(true)

    expect(deferReply).toHaveBeenCalledOnce()
    expect(JSON.stringify(editReply.mock.calls[0][0].components[0].toJSON())).toContain('Mochimaru')
  })
})
