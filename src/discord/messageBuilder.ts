import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import { MessageFlags, SeparatorSpacingSize } from 'discord.js'
import type { ToneKey } from '../agent/prompts/tones.js'
import { logger } from '../utils/logger.js'
import { getExpressionUrl } from './expressions.js'
import { getToneStyle } from './toneStyles.js'

const TOOL_USAGE_LABELS: Record<string, string> = {
  roll_dice: 'cast the fortune dice',
  flip_coin: 'tossed a shrine coin',
  get_current_time: 'peeked at the temple clock',
  get_weather: "divined today's weather",
  search_web: 'searched the wider world',
  search_anime: 'leafed through anime scrolls',
  get_anime_schedule: 'checked the airing almanac',
  set_reminder: 'tied a reminder charm',
  list_reminders: 'counted her reminder charms',
  cancel_reminder: 'untied a reminder charm',
  remember_user: 'pressed a memory flower',
  recall_user: 'recalled a pressed memory'
}

/** Build a Components V2 container message with tone-appropriate styling */
export function buildRokaMessage(text: string, tone: ToneKey, toolsUsed: readonly string[] = []) {
  const style = getToneStyle(tone)
  const imageUrl = getExpressionUrl(tone) || style.imageUrl

  const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))

  if (imageUrl) {
    section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: imageUrl } }))
  }

  const container = new ContainerBuilder().setAccentColor(style.color).addSectionComponents(section)
  const toolLabels = toolsUsed.flatMap((toolName) => {
    const label = TOOL_USAGE_LABELS[toolName]
    return label ? [label] : []
  })

  if (toolLabels.length > 0) {
    const visibleLabels = toolLabels.slice(0, 3)
    const suffix = toolLabels.length > visibleLabels.length ? ' …and more' : ''
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# 🌸 ${visibleLabels.join(' · ')}${suffix}`)
    )
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }

  logger.debug({ tone, color: style.color, imageUrl }, 'Built Components V2 message')

  return payload
}
