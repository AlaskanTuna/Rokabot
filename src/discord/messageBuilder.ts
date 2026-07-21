import { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder } from '@discordjs/builders'
import { MessageFlags } from 'discord.js'
import type { ToneKey } from '../agent/prompts/tones.js'
import { logger } from '../utils/logger.js'
import { getExpressionUrl } from './expressions.js'
import { getToneStyle } from './toneStyles.js'

/** Build a Components V2 container message with tone-appropriate styling */
export function buildRokaMessage(text: string, tone: ToneKey) {
  const style = getToneStyle(tone)
  const imageUrl = getExpressionUrl(tone) || style.imageUrl

  const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))

  if (imageUrl) {
    section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: imageUrl } }))
  }

  const container = new ContainerBuilder().setAccentColor(style.color).addSectionComponents(section)

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }

  logger.debug({ tone, color: style.color, imageUrl }, 'Built Components V2 message')

  return payload
}
