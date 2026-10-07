/** /report slash command definition for filing a bug report with Roka */

import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js'

export const reportCommand = new SlashCommandBuilder()
  .setName('report')
  .setDescription('File a bug report for Roka')
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('What kind of issue are you reporting?')
      .setRequired(true)
      .addChoices(
        { name: 'Something broke', value: 'bug' },
        { name: 'Wrong or made-up answer', value: 'wrong_answer' },
        { name: 'Offensive or unsafe reply', value: 'unsafe' },
        { name: 'Something else', value: 'other' }
      )
  )
  .addStringOption((option) =>
    option.setName('message').setDescription('What happened?').setRequired(true).setMaxLength(1500)
  )
  .addAttachmentOption((option) =>
    option.setName('attachment').setDescription('Optional screenshot or file').setRequired(false)
  )
