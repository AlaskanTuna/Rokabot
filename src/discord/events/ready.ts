import { Client, REST, Routes } from 'discord.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { buildCommandBody } from '../commands/index.js'
import { startStatusCycler } from '../statusCycler.js'

/** Register slash commands and log startup on Discord ready */
export async function handleReady(client: Client): Promise<void> {
  logger.info({ user: client.user?.tag }, 'Roka is online!')

  startStatusCycler(client)

  const rest = new REST({ version: '10' }).setToken(config.discord.token)

  try {
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: buildCommandBody()
    })
    logger.info('Slash commands registered')
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands')
  }
}
