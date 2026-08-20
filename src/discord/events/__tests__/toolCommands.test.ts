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

import { config } from '../../../config.js'
import { getSharedRateLimiter } from '../../../utils/rateLimiter.js'
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
    await createToolCommandHandler()(interaction as never)

    expect(mocks.handleSchedule).toHaveBeenCalledWith(interaction)
    expect(mocks.handleAnime).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'schedule' })
  })

  // #172: these commands reach Jikan and SQLite, never Gemini. The router used to call `tryConsume` on the
  // shared model limiter as a generic anti-spam guard, which left our own counter believing a request had
  // gone to Google that never had — so the guard refused real turns earlier than Google would have.
  //
  // Asserted against the SHARED limiter, not a fresh instance and not a spy. The handler is no longer given
  // a limiter at all, so asserting an object it has no reference to is untouched could not fail — it would
  // pass against any implementation, including one that re-added the guard. `getSharedRateLimiter` is what
  // a re-added guard would reach for, which is what makes this check able to fail.
  it('leaves the model limiter untouched, because it never reaches the model', async () => {
    const limiter = getSharedRateLimiter(config.rateLimit)
    const before = { rpm: limiter.remainingRpm, rpd: limiter.remainingRpd }
    const interaction = {
      commandName: 'anime',
      channelId: 'channel-1',
      options: { getSubcommandGroup: vi.fn(() => null) },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined)
    }

    await createToolCommandHandler()(interaction as never)

    expect(mocks.handleAnime).toHaveBeenCalled()
    expect({ rpm: limiter.remainingRpm, rpd: limiter.remainingRpd }).toEqual(before)
  })
})
