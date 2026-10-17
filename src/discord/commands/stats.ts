/** /stats slash command definition */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { character } from '../../character/index.js'

export const statsCommand = new SlashCommandBuilder()
  .setName('stats')
  .setDescription(character.lines.commands.stats)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
