/** /ask slash command definition — single-turn chat that searches the web on its own when it needs to */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'

export const askCommand = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask Roka anything — she looks things up when she needs to')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((option) =>
    option.setName('question').setDescription('What do you want to ask or say?').setRequired(true)
  )
  .addAttachmentOption((option) =>
    option.setName('image').setDescription('Share an image with Roka').setRequired(false)
  )
