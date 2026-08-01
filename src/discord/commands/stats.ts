/** /stats slash command definition */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'

export const statsCommand = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('See Roka’s server activity notebook')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
  .setContexts(InteractionContextType.Guild)
