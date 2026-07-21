import { Client, GatewayIntentBits, Partials } from 'discord.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'
import { getSharedRateLimiter } from '../utils/rateLimiter.js'
import { createInteractionHandler } from './events/interactionCreate.js'
import { createMessageHandler } from './events/messageCreate.js'
import { handleReady } from './events/ready.js'

/** Create and configure the Discord.js client with event handlers and rate limiting */
export function createClient(): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message]
  })

  const rateLimiter = getSharedRateLimiter(config.rateLimit)

  client.once('clientReady', () => handleReady(client))
  client.on('interactionCreate', createInteractionHandler(rateLimiter, client))
  client.on('messageCreate', createMessageHandler(client, rateLimiter))

  client.on('error', (error) => {
    logger.error({ error }, 'Discord client error')
  })

  client.on('warn', (warning) => {
    logger.warn({ warning }, 'Discord client warning')
  })

  return client
}
