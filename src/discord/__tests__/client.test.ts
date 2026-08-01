import { GatewayIntentBits } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    discord: { token: 'test-token' },
    rateLimit: { rpm: 15, rpd: 500 }
  }
}))
vi.mock('../events/interactionCreate.js', () => ({ createInteractionHandler: () => vi.fn() }))
vi.mock('../events/messageCreate.js', () => ({ createMessageHandler: () => vi.fn() }))
vi.mock('../events/ready.js', () => ({ handleReady: vi.fn() }))
vi.mock('../../utils/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { createClient } from '../client.js'

describe('Discord client', () => {
  it('includes the required guild intents', () => {
    const client = createClient()

    try {
      const intents = client.options.intents

      expect(intents.has(GatewayIntentBits.Guilds)).toBe(true)
      expect(intents.has(GatewayIntentBits.GuildMessages)).toBe(true)
      expect(intents.has(GatewayIntentBits.MessageContent)).toBe(true)
    } finally {
      client.destroy()
    }
  })

  // Adding a DM message intent would create an unbudgeted second trigger surface in every DM and group DM, sharing the rate-limit bucket enforced in src/utils/rateLimiter.ts.
  it('excludes every DM-adjacent gateway intent', () => {
    const client = createClient()

    try {
      const intents = client.options.intents

      expect(intents.has(GatewayIntentBits.DirectMessages)).toBe(false)
      expect(intents.has(GatewayIntentBits.DirectMessageReactions)).toBe(false)
      expect(intents.has(GatewayIntentBits.DirectMessageTyping)).toBe(false)
      expect(intents.has(GatewayIntentBits.DirectMessagePolls)).toBe(false)
    } finally {
      client.destroy()
    }
  })

  // Exhaustiveness check: catches any intent bit added outside the DM-adjacent set that the named
  // assertions above don't enumerate. Kept last so it can never mask a named assertion's failure.
  it('pins the exact intent bitfield', () => {
    const client = createClient()

    try {
      const intents = client.options.intents

      expect(intents.bitfield).toBe(
        GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages | GatewayIntentBits.MessageContent
      )
    } finally {
      client.destroy()
    }
  })
})
