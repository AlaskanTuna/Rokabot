/** /chat slash command definition */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'

export const chatCommand = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('Talk with Roka')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((option) => option.setName('message').setDescription('What do you want to say?').setRequired(true))
  .addAttachmentOption((option) =>
    option.setName('image').setDescription('Share an image with Roka').setRequired(false)
  )
