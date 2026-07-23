import { Client, REST, Routes } from 'discord.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { chatCommand } from '../commands/chat.js'
import { gameCommands } from '../commands/games.js'
import { statsCommand } from '../commands/stats.js'
import { toolCommands } from '../commands/tools.js'
import { startStatusCycler } from '../statusCycler.js'

/** Register slash commands and log startup on Discord ready */
export async function handleReady(client: Client): Promise<void> {
  logger.info({ user: client.user?.tag }, 'Roka is online!')

  startStatusCycler(client)

  const rest = new REST({ version: '10' }).setToken(config.discord.token)

  try {
    await rest.put(Routes.applicationCommands(config.discord.clientId), {
      body: [
        chatCommand.toJSON(),
        ...toolCommands.map((c) => c.toJSON()),
        ...gameCommands.map((c) => c.toJSON()),
        statsCommand.toJSON()
      ]
    })
    logger.info('Slash commands registered')
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands')
  }
}
