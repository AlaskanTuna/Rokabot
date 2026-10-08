import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import { MessageFlags, SeparatorSpacingSize } from 'discord.js'
import type { WatchOutcome } from '../agent/media/types.js'
import type { ToneKey } from '../agent/prompts/tones.js'
import type { ReplyOutcome } from '../agent/replyOutcomes.js'
import { logger } from '../utils/logger.js'
import { fitCitations } from './citations.js'
import { getExpressionUrl } from './expressions.js'
import type { SocialPostLookup } from './socialPosts/types.js'
import type { SocialPlatform } from './socialPosts/urls.js'
import { getToneStyle } from './toneStyles.js'

const TOOL_USAGE_LABELS: Record<string, string> = {
  roll_dice: 'cast the dice',
  flip_coin: 'tossed a coin',
  get_current_time: 'checked the clock',
  get_weather: 'checked the weather',
  search_web: 'searched the web',
  search_anime: 'looked up anime',
  get_anime_schedule: 'checked airing times',
  set_reminder: 'set a reminder',
  list_reminders: 'listed reminders',
  cancel_reminder: 'cancelled a reminder',
  remember_user: 'saved a memory',
  recall_user: 'recalled a memory'
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

const SOCIAL_PLATFORM_NAMES: Record<SocialPlatform, string> = {
  x: 'X',
  bluesky: 'Bluesky',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  reddit: 'Reddit',
  instagram: 'Instagram',
  bilibili: 'Bilibili',
  threads: 'Threads'
}

// A linked post is read before the model runs, so it never appears in toolsUsed; without its own label the
// reader cannot tell whether she saw the post or only searched around it.
function socialPostLabel(outcome: 'found' | 'failed', platform: SocialPlatform): string {
  return `${outcome === 'found' ? 'peeked at' : "couldn't open"} the ${SOCIAL_POST_KINDS[platform]}`
}

const REPLY_OUTCOME_LABELS = { found: 'read the replies', failed: "couldn't read the replies" } as const

// A watch runs before the model, like a post lookup, and the footer is the one place a reader can check whether
// she really watched what she talks about. How much she watched is a word, not times: the reply cites moments.
const WATCH_NOUNS = { video: 'video', audio: 'clip' } as const

function watchLabel(outcome: WatchOutcome, noun: string = WATCH_NOUNS[outcome.kind]): string {
  const heard = outcome.kind === 'audio'
  if (outcome.status !== 'watched') {
    return outcome.status === 'failed' ? `couldn't ${heard ? 'hear' : 'watch'} the ${noun}` : `remembered the ${noun}`
  }
  if (outcome.coverage === 'skim') return `skimmed the ${noun}`
  const watched = heard ? 'heard' : 'watched'
  if (outcome.coverage === 'whole') return `${watched} the ${noun}`
  const most = outcome.endSec - outcome.startSec >= outcome.durationSec / 2
  return `${watched} ${most ? 'most' : 'part'} of the ${noun}`
}

// A linked post's own video gets one label naming the platform rather than a post label and a watch label.
function postMediaNoun(platform: SocialPlatform, outcome: WatchOutcome): string {
  return `${SOCIAL_PLATFORM_NAMES[platform]} ${WATCH_NOUNS[outcome.kind]}`
}

// Every wording a watch label can take: lengths do not depend on the times, only on which wording applies.
const WATCH_OUTCOME_SAMPLES = (['video', 'audio'] as const).flatMap(
  (kind) =>
    [
      { status: 'watched', kind, coverage: 'whole', durationSec: 1 },
      { status: 'watched', kind, coverage: 'part', startSec: 0, endSec: 1, durationSec: 1 },
      { status: 'watched', kind, coverage: 'part', startSec: 0, endSec: 0, durationSec: 1 },
      { status: 'watched', kind, coverage: 'skim' },
      { status: 'remembered', kind },
      { status: 'failed', kind }
    ] satisfies WatchOutcome[]
)

const PLATFORMS = Object.keys(SOCIAL_POST_KINDS) as SocialPlatform[]
const POST_MEDIA_LABELS = PLATFORMS.flatMap((platform) =>
  WATCH_OUTCOME_SAMPLES.map((outcome) => watchLabel(outcome, postMediaNoun(platform, outcome)))
)
// Footers from before the post and watch labels merged say `peeked at the …` with the watch separate.
const OPENED_POST_LABELS = [
  ...Object.values(SOCIAL_POST_KINDS).map((kind) => `peeked at the ${kind}`),
  ...POST_MEDIA_LABELS
]

/**
 * The post one of Roka's replies was about, read back from that reply's components: when its footer says she
 * opened a post, the post is always the first citation. Search citations are never taken for a post she viewed.
 */
export function openedPostCitation(componentTexts: readonly string[]): string | null {
  const footer = componentTexts.find((text) => text.startsWith('-# 🌸 '))
  const labels = footer?.split('\n')[0] ?? ''
  if (!OPENED_POST_LABELS.some((label) => labels.includes(label))) return null
  return footer?.match(/-# 🔗 \[[^\]]*\]\(<([^>]+)>\)/)?.[1] ?? null
}

const MAX_VISIBLE_TOOL_LABELS = 2

/**
 * Components V2 budgets TextDisplay content across the whole message, not per component, so the reply text,
 * the tool footer and the citation row all draw on this one allowance. config.discord.maxMessageLength bounds
 * the text against it; the citation row takes only what the other two leave and is dropped when nothing does.
 */
export const TEXT_DISPLAY_BUDGET = 4000

export function buildToolFooter(labels: readonly string[]) {
  const visibleLabels = labels.slice(0, MAX_VISIBLE_TOOL_LABELS)
  const hidden = labels.length - visibleLabels.length
  return `-# 🌸 ${visibleLabels.join(' · ')}${hidden > 0 ? ` +${hidden}` : ''}`
}

function longest(labels: string[]): string {
  return labels.reduce((best, label) => (label.length > best.length ? label : best), '')
}

const toolLabelsByLength = [...Object.values(TOOL_USAGE_LABELS)].sort((left, right) => right.length - left.length)
const longestPostLabel = longest(
  PLATFORMS.flatMap((platform) => [socialPostLabel('found', platform), socialPostLabel('failed', platform)])
)
const longestWatchLabel = longest(WATCH_OUTCOME_SAMPLES.map((outcome) => watchLabel(outcome)))
const longestPostMediaLabel = longest(POST_MEDIA_LABELS)
const longestReplyLabel = longest(Object.values(REPLY_OUTCOME_LABELS))
// A turn opens at most one linked post, watches at most one item for the footer and records one replies
// outcome, and all lead the footer ahead of the tools. A post's own video takes one merged label instead of a
// post label and a watch label. Every tool counts as reachable, since the hidden count sets the suffix width.
const footerLeads = [
  ...[[], [longestPostLabel]].flatMap((post) => [[], [longestWatchLabel]].map((watch) => [...post, ...watch])),
  [longestPostMediaLabel]
].flatMap((lead) => [lead, [...lead, longestReplyLabel]])
export const MAX_TOOL_FOOTER_CHARS = Math.max(
  ...footerLeads.map((lead) => buildToolFooter([...lead, ...toolLabelsByLength]).length)
)

/** Build a Components V2 container message with tone-appropriate styling */
export function buildRokaMessage(
  text: string,
  tone: ToneKey,
  toolsUsed: readonly string[] = [],
  sources: ReadonlyArray<{ url: string }> = [],
  socialPost: SocialPostLookup = { status: 'none' },
  replyOutcome: ReplyOutcome = 'none',
  watchOutcome: WatchOutcome | null = null
) {
  const style = getToneStyle(tone)
  const imageUrl = getExpressionUrl(tone) || style.imageUrl

  const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))

  if (imageUrl) {
    section.setThumbnailAccessory(new ThumbnailBuilder({ media: { url: imageUrl } }))
  }

  const container = new ContainerBuilder().setAccentColor(style.color).addSectionComponents(section)
  const postNoun =
    socialPost.status === 'found' && watchOutcome?.fromLink
      ? postMediaNoun(socialPost.post.platform, watchOutcome)
      : null
  const postLabels =
    postNoun !== null
      ? []
      : socialPost.status === 'found'
        ? [socialPostLabel('found', socialPost.post.platform)]
        : socialPost.status === 'failed'
          ? [socialPostLabel('failed', socialPost.platform)]
          : []
  const toolLabels = [
    ...postLabels,
    ...(watchOutcome ? [watchLabel(watchOutcome, postNoun ?? undefined)] : []),
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
