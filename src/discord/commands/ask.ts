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

// A link, not an upload: deliberately typed, so it needs no embed and sidesteps the unfurl-timing problem
// the mention path has. Added after the attachment slots so it reads last in Discord's option list.
command.addStringOption((option) =>
  option.setName('image_url').setDescription('Link to an image for Roka to look at').setRequired(false)
)

export const askCommand = command
