import { Client, REST, Routes } from 'discord.js'
import { config } from '../../config.js'
import { logger } from '../../utils/logger.js'
import { chatCommand } from '../commands/chat.js'
import { gameCommands } from '../commands/games.js'
import { toolCommands } from '../commands/tools.js'
import { startStatusCycler } from '../statusCycler.js'

/** Register slash commands and log startup on Discord ready */
export async function handleReady(client: Client): Promise<void> {
  logger.info({ user: client.user?.tag }, 'Roka is online!')

  startStatusCycler(client)

  const rest = new REST({ version: '10' }).setToken(config.discord.token)

  try {
    const commandRoute = config.discord.devGuildId
      ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.devGuildId)
      : Routes.applicationCommands(config.discord.clientId)

    await rest.put(commandRoute, {
      body: [chatCommand.toJSON(), ...toolCommands.map((c) => c.toJSON()), ...gameCommands.map((c) => c.toJSON())]
    })
    logger.info('Slash commands registered')
  } catch (error) {
    logger.error({ error }, 'Failed to register slash commands')
  }
}
