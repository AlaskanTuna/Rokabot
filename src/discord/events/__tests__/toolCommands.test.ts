import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleAnime: vi.fn(),
  handleSchedule: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
}))

vi.mock('../tools/anime.js', () => ({ handleAnime: mocks.handleAnime }))
vi.mock('../tools/schedule.js', () => ({ handleSchedule: mocks.handleSchedule }))
vi.mock('../../../utils/logger.js', () => ({ logger: { info: mocks.info, error: mocks.error, debug: vi.fn() } }))
vi.mock('../../responses.js', () => ({ getRandomDecline: () => 'decline' }))

import { createToolCommandHandler } from '../toolCommands.js'

describe('tool command routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handleAnime.mockResolvedValue({ content: 'anime' })
    mocks.handleSchedule.mockResolvedValue({ content: 'schedule' })
  })

  it('routes the anime schedule group to the schedule handler', async () => {
    const interaction = {
      commandName: 'anime',
      channelId: 'channel-1',
      options: { getSubcommandGroup: vi.fn(() => 'schedule') },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined)
    }
    const rateLimiter = { tryConsume: vi.fn(() => true) }

    await createToolCommandHandler(rateLimiter as never)(interaction as never)

    expect(mocks.handleSchedule).toHaveBeenCalledWith(interaction)
    expect(mocks.handleAnime).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'schedule' })
  })
})
