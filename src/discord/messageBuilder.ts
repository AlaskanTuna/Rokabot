import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import { MessageFlags, SeparatorSpacingSize } from 'discord.js'
import type { ToneKey } from '../agent/prompts/tones.js'
import type { ReplyOutcome } from '../agent/replyOutcomes.js'
import { logger } from '../utils/logger.js'
import { fitCitations } from './citations.js'
import { getExpressionUrl } from './expressions.js'
import type { SocialPostLookup } from './socialPosts/types.js'
import type { SocialPlatform } from './socialPosts/urls.js'
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

const SOCIAL_POST_KINDS: Record<SocialPlatform, string> = {
  x: 'X post',
  bluesky: 'Bluesky post',
  youtube: 'YouTube video',
  tiktok: 'TikTok video',
  reddit: 'Reddit post',
  instagram: 'Instagram post',
  bilibili: 'Bilibili video',
  threads: 'Threads post'
}

// A linked post is read before the model runs, so it never appears in toolsUsed; without its own label the
// reader cannot tell whether she saw the post or only searched around it.
function socialPostLabel(outcome: 'found' | 'failed', platform: SocialPlatform): string {
  return `${outcome === 'found' ? 'peeked at' : "couldn't open"} the ${SOCIAL_POST_KINDS[platform]}`
}

// A post's replies are the crowd gathered around it at the festival, talking about it.
const REPLY_OUTCOME_LABELS = { found: "heard the crowd's chatter", failed: "couldn't hear the crowd" } as const

const MAX_VISIBLE_TOOL_LABELS = 3

/**
 * Components V2 budgets TextDisplay content across the whole message, not per component, so the reply text,
 * the tool footer and the citation row all draw on this one allowance. config.discord.maxMessageLength bounds
 * the text against it; the citation row takes only what the other two leave and is dropped when nothing does.
 */
export const TEXT_DISPLAY_BUDGET = 4000

export function buildToolFooter(labels: readonly string[], epochSeconds = Math.floor(Date.now() / 1000)) {
  const visibleLabels = labels.slice(0, MAX_VISIBLE_TOOL_LABELS)
  const suffix = labels.length > visibleLabels.length ? ' …and more' : ''
  return `-# 🌸 ${visibleLabels.join(' · ')}${suffix} • <t:${epochSeconds}:R>`
}

function longestFirst(labels: string[]): string[] {
  return [...labels].sort((left, right) => right.length - left.length)
}

const toolLabelsByLength = longestFirst(Object.values(TOOL_USAGE_LABELS))
const longestSocialPostLabel = longestFirst(
  (Object.keys(SOCIAL_POST_KINDS) as SocialPlatform[]).flatMap((platform) => [
    socialPostLabel('found', platform),
    socialPostLabel('failed', platform)
  ])
)[0]
// Math.floor(Date.now() / 1000) has 10 digits until 2286, so this keeps the measurement deterministic.
const TOOL_FOOTER_EPOCH_SAMPLE = 1_784_808_000
const longestReplyLabel = longestFirst(Object.values(REPLY_OUTCOME_LABELS))[0]
const footerLeads = [[], [longestSocialPostLabel], [longestReplyLabel], [longestSocialPostLabel, longestReplyLabel]]
// A turn opens at most one linked post and records one replies outcome, and both lead the footer, so each
// displaces a tool label rather than adding one.
export const MAX_TOOL_FOOTER_CHARS = Math.max(
  ...footerLeads.map(
    (lead) =>
      buildToolFooter([...lead, ...toolLabelsByLength].slice(0, MAX_VISIBLE_TOOL_LABELS + 1), TOOL_FOOTER_EPOCH_SAMPLE)
        .length
  )
)

/** Build a Components V2 container message with tone-appropriate styling */
export function buildRokaMessage(
  text: string,
  tone: ToneKey,
  toolsUsed: readonly string[] = [],
  sources: ReadonlyArray<{ url: string }> = [],
  socialPost: SocialPostLookup = { status: 'none' },
  replyOutcome: ReplyOutcome = 'none'
) {
  const style = getToneStyle(tone)
  const imageUrl = getExpressionUrl(tone) || style.imageUrl

  const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))

  if (imageUrl) {
    section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: imageUrl } }))
  }

  const container = new ContainerBuilder().setAccentColor(style.color).addSectionComponents(section)
  const postLabels =
    socialPost.status === 'found'
      ? [socialPostLabel('found', socialPost.post.platform)]
      : socialPost.status === 'failed'
        ? [socialPostLabel('failed', socialPost.platform)]
        : []
  const toolLabels = [
    ...postLabels,
    ...(replyOutcome === 'none' ? [] : [REPLY_OUTCOME_LABELS[replyOutcome]]),
    ...toolsUsed.flatMap((toolName) => {
      const label = TOOL_USAGE_LABELS[toolName]
      return label ? [label] : []
    })
  ]
  const citedSources = socialPost.status === 'found' ? [{ url: socialPost.post.canonicalUrl }, ...sources] : sources

  const footer = toolLabels.length > 0 ? buildToolFooter(toolLabels) : ''
  // The footer says what she did; the citations say where it came from. Complementary, not duplicated (#19).
  // The newline that joins them below is part of the rendered content, so it is budgeted here rather than
  // silently borrowed — a citation row that exactly filled its budget would otherwise overrun by one.
  const joinChars = footer ? 1 : 0
  const citations = fitCitations(citedSources, TEXT_DISPLAY_BUDGET - text.length - footer.length - joinChars)

  if (footer || citations) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([footer, citations].filter(Boolean).join('\n'))
    )
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }

  logger.debug({ tone, color: style.color, imageUrl }, 'Built Components V2 message')

  return payload
}
