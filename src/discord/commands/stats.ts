/** /stats slash command definition */

import { SlashCommandBuilder } from 'discord.js'

export const statsCommand = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('See Roka’s server activity notebook')
