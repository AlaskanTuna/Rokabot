/** /ask slash command definition — single-turn chat that searches the web on its own when it needs to */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'
import { MAX_IMAGE_ATTACHMENTS, imageOptionName } from '../attachments.js'

const command = new SlashCommandBuilder()
  .setName('ask')
  .setDescription('Ask Roka anything — she looks things up when she needs to')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((option) =>
    option.setName('question').setDescription('What do you want to ask or say?').setRequired(true)
  )

// One option per attachment slot, driven by the same ceiling the mention path uses, so the two surfaces
// cannot drift apart and the count is stated once.
for (let index = 0; index < MAX_IMAGE_ATTACHMENTS; index++) {
  command.addAttachmentOption((option) =>
    option
      .setName(imageOptionName(index))
      .setDescription(
        index === 0 ? 'Share an image with Roka' : `Another image (${index + 1} of ${MAX_IMAGE_ATTACHMENTS})`
      )
      .setRequired(false)
  )
}

export const askCommand = command
