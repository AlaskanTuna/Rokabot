import {
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from '@discordjs/builders'
import { AttachmentBuilder, type Guild, MessageFlags, SeparatorSpacingSize } from 'discord.js'
import type { ToneKey } from '../../../agent/prompts/tones.js'
import { getToneStyle } from '../../toneStyles.js'
import {
  TONE_EMOJI,
  renderActivityHeatmap,
  renderChannelHistogram,
  renderLatencyTrend,
  renderMemoryGrowth,
  renderMoodDonut
} from './charts.js'
import {
  activeClaimCount,
  activityByDay,
  busiestChannel,
  chatsSince,
  currentAndBestStreak,
  distinctRememberedUsers,
  latencyE2e,
  memoryGrowthSeries,
  mostActiveDay,
  mostActiveHour,
  mostUsedTool,
  newClaimsThisMonth,
  p95ByDay,
  retrySummary,
  successRate,
  tokenTotals,
  topChannels,
  topPredicates,
  topRememberedMembers,
  topTones,
  triggerSplit,
  uniqueChatters
} from './queries.js'

export const STATS_VIEWS = ['overview', 'mood', 'memory', 'nerd'] as const
export type StatsView = (typeof STATS_VIEWS)[number]

const TONE_KEYS: readonly ToneKey[] = [
  'playful',
  'sincere',
  'domestic',
  'flustered',
  'curious',
  'annoyed',
  'tender',
  'confident',
  'nostalgic',
  'mischievous',
  'sleepy',
  'competitive'
]

const VIEW_DETAILS: Record<StatsView, { label: string; emoji: string }> = {
  overview: { label: 'Overview', emoji: '📊' },
  mood: { label: 'Mood', emoji: '🎭' },
  memory: { label: 'Memory', emoji: '🌸' },
  nerd: { label: 'Nerd', emoji: '🔧' }
}

const MOOD_PAIR_LABELS: Record<string, string> = {
  'domestic:flustered': 'A Cozy Little Panic',
  'playful:mischievous': 'Full Teasing Season',
  'sincere:tender': 'Soft Hearts, Open Doors',
  'curious:playful': 'Curious Little Sparks',
  'confident:competitive': 'A Proper Challenge',
  'nostalgic:tender': 'Warm Pages Turning',
  'sleepy:domestic': 'Tea Before Bedtime',
  'annoyed:flustered': 'A Blushing Little Fuss',
  'playful:flustered': 'Teasing With a Pink Cheek',
  'mischievous:competitive': 'Mischief Meets Its Match',
  'sincere:domestic': 'A Gentle Everyday',
  'curious:nostalgic': 'Old Stories, New Questions',
  'confident:playful': 'Bright and Unbothered',
  'tender:flustered': 'A Shy Little Heart',
  'annoyed:playful': 'Fondly Exasperated'
}

const MOOD_FALLBACKS: Record<ToneKey, string> = {
  playful: 'A Playful Little Season',
  sincere: 'Heartfelt Hours',
  domestic: 'A Cozy Little Corner',
  flustered: 'A Flustered Little Moment',
  curious: 'Curiosity Is Calling',
  annoyed: 'A Fond Little Fuss',
  tender: 'A Gentle Little Glow',
  confident: 'Quietly In Command',
  nostalgic: 'Pages of Yesterday',
  mischievous: 'Mischief Is Afoot',
  sleepy: 'A Sleepy Little Hush',
  competitive: 'Game Faces On'
}

export const PREDICATE_PHRASES: Record<string, string> = {
  favorite_anime: 'I remember their favorite anime~',
  favorite_food: 'I remember their favorite food~',
  favorite_game: 'I remember their favorite game~',
  hobbies: 'I remember what they enjoy doing~',
  preferences: 'I remember their little preferences~',
  birthday: 'I remember their special day~',
  timezone: 'I remember when their day begins~',
  pronouns: 'I remember how they like to be addressed~'
}

function sinceFor(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function formatDuration(milliseconds: number): string {
  if (milliseconds >= 60 * 60 * 1000) return `${(milliseconds / (60 * 60 * 1000)).toFixed(1)} hours`
  if (milliseconds >= 60 * 1000) return `${Math.round(milliseconds / (60 * 1000))} minutes`
  if (milliseconds >= 1000) return `${(milliseconds / 1000).toFixed(1)}s`
  return `${Math.round(milliseconds)}ms`
}

function formatLatency(milliseconds: number): string {
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)}s` : `${Math.round(milliseconds)}ms`
}

function titleCase(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function stat(label: string, value: string | number): string {
  return `> **${label}:** \`${value}\``
}

function text(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content)
}

function separator(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
}

function isToneKey(value: string): value is ToneKey {
  return TONE_KEYS.includes(value as ToneKey)
}

function toneCounts(guildId: string, sinceMs: number): { tone: ToneKey; count: number }[] {
  return topTones(guildId, sinceMs)
    .filter((entry): entry is { tone: ToneKey; count: number } => entry.count > 0 && isToneKey(entry.tone))
    .sort((left, right) => right.count - left.count || left.tone.localeCompare(right.tone))
}

function predicateLabel(predicate: string): string {
  return titleCase(predicate)
}

function predicatePhrase(predicate: string): string {
  return PREDICATE_PHRASES[predicate] ?? `I remember their ${predicateLabel(predicate).toLowerCase()}~`
}

export function getMoodLabel(dominant: ToneKey | null, runnerUp: ToneKey | null): string {
  if (!dominant) return 'A Quiet Little Pause'
  return (runnerUp && MOOD_PAIR_LABELS[`${dominant}:${runnerUp}`]) ?? MOOD_FALLBACKS[dominant]
}

function buildControls(view: StatsView, disabled: boolean) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('stats:view')
    .setPlaceholder('Choose a view')
    .setDisabled(disabled)
    .addOptions(
      STATS_VIEWS.map((value) => ({
        label: VIEW_DETAILS[value].label,
        value,
        emoji: { name: VIEW_DETAILS[value].emoji },
        default: value === view
      }))
    )
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
}

function addChart(container: ContainerBuilder, filename: string, description: string) {
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${filename}`).setDescription(description)
    )
  )
}

function buildOverview(guildId: string, guild: Guild, sinceMs: number, container: ContainerBuilder) {
  const chats = chatsSince(guildId, sinceMs)
  const channel = busiestChannel(guildId, sinceMs)
  const activeDay = mostActiveDay(guildId, sinceMs)
  const activeHour = mostActiveHour(guildId, sinceMs)
  const streak = currentAndBestStreak(guildId, sinceMs)
  const tool = mostUsedTool(guildId, sinceMs)
  const triggers = triggerSplit(guildId, sinceMs).filter(({ count }) => count > 0)
  const channelName = channel ? (guild.channels.cache.get(channel.channelId)?.name ?? 'unknown') : null
  const reachHer = triggers.map(({ trigger, count }) => `${titleCase(trigger)}: ${formatNumber(count)}`).join(' · ')

  container
    .addTextDisplayComponents(text('**Roka’s Server Ledger**\n-# Overview · Last 30 Days'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          '### 📊 Conversation',
          stat('Chats This Month', formatNumber(chats)),
          stat('Unique Chatters', formatNumber(uniqueChatters(guildId, sinceMs))),
          stat(
            'Busiest Channel',
            channel ? `<#${channel.channelId}> · #${channelName} · ${formatNumber(channel.count)}` : 'No chats yet'
          ),
          stat(
            'Most Active Day',
            activeDay ? `${activeDay.day} · ${formatNumber(activeDay.count)} chats` : 'No chats yet'
          ),
          stat(
            'Most Active Hour',
            activeHour
              ? `${String(activeHour.hour).padStart(2, '0')}:00 · ${formatNumber(activeHour.count)} chats`
              : 'No chats yet'
          ),
          stat('Current Streak', `${formatNumber(streak.current)} days (best: ${formatNumber(streak.best)})`),
          stat(
            'Most Used Tool',
            tool ? `${titleCase(tool.tool)} · ${formatNumber(tool.count)} uses` : 'No tool calls recorded yet'
          ),
          ...(reachHer ? [stat('How People Reach Her', reachHer)] : [])
        ].join('\n')
      )
    )
    .addTextDisplayComponents(text('-# Every little chat helps this place feel more like home.'))
}

function buildMood(guildId: string, sinceMs: number, container: ContainerBuilder) {
  const tones = toneCounts(guildId, sinceMs)
  const total = tones.reduce((sum, entry) => sum + entry.count, 0)
  const [dominant, runnerUp, third] = tones
  const summary = dominant
    ? `Mostly ${dominant.tone} (\`${Math.round((dominant.count / total) * 100)}%\`), with ${runnerUp?.tone ?? 'no runner-up'} (\`${runnerUp ? Math.round((runnerUp.count / total) * 100) : 0}%\`) and ${third?.tone ?? 'no third mood'} (\`${third ? Math.round((third.count / total) * 100) : 0}%\`) close behind`
    : 'The server mood is waiting for its first little chat'
  const moodLines = tones
    .slice(0, 3)
    .map(({ tone, count }) =>
      stat(`${TONE_EMOJI[tone]} ${titleCase(tone)}`, `${formatNumber(count)} · ${Math.round((count / total) * 100)}%`)
    )

  container
    .setAccentColor(getToneStyle(dominant?.tone ?? 'playful').color)
    .addTextDisplayComponents(
      text(`**${getMoodLabel(dominant?.tone ?? null, runnerUp?.tone ?? null)}**\n-# Mood · Last 30 Days`)
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(['### 🎭 Top 3 Moods', ...moodLines].join('\n')))
    .addTextDisplayComponents(text(`-# ${summary}`))

  return renderMoodDonut(tones)
}

async function buildMemory(guildId: string, guild: Guild, sinceMs: number, container: ContainerBuilder) {
  const predicates = topPredicates(guildId, sinceMs)
  const predicateText = predicates.length
    ? `Mostly ${predicates.map(({ predicate }) => `\`${predicateLabel(predicate)}\``).join(' and ')}`
    : 'No memory categories yet'

  container
    .addTextDisplayComponents(text('**Roka’s Memory Ledger**\n-# Memory · Last 30 Days'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          '### 🌸 Remembering Together',
          stat('Active Memories', formatNumber(activeClaimCount(guildId))),
          stat('Members Remembered', formatNumber(distinctRememberedUsers(guildId))),
          stat('New This Month', formatNumber(newClaimsThisMonth(guildId, sinceMs))),
          stat('Mostly Remembers', predicateText)
        ].join('\n')
      )
    )
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text('### 🌸 Who She Knows Best'))

  const members = await Promise.all(
    topRememberedMembers(guildId, sinceMs).map(async (entry) => {
      try {
        const member = await guild.members.fetch(entry.userId)
        return member ? { ...entry, member } : null
      } catch {
        return null
      }
    })
  )
  for (const entry of members) {
    if (!entry) continue
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          text(
            `**${entry.member.displayName}**\n\`${formatNumber(entry.count)}\` memories · ${predicatePhrase(entry.predicate)}`
          )
        )
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: entry.member.displayAvatarURL() } }))
    )
  }
  container.addTextDisplayComponents(
    text('-# I keep the details tucked safely away, but I do remember the important things.')
  )
  return renderMemoryGrowth(memoryGrowthSeries(guildId, sinceMs))
}

function buildNerd(guildId: string, sinceMs: number, container: ContainerBuilder) {
  const latency = latencyE2e(guildId, sinceMs)
  const success = successRate(guildId, sinceMs)
  const retries = retrySummary(guildId, sinceMs)
  const tokens = tokenTotals(guildId, sinceMs)
  const heard = Math.round(tokens.input * 0.75)
  const spoken = Math.round(tokens.output * 0.75)
  const average = success.total > 0 ? Math.round(spoken / success.total) : 0
  const failureText = success.failures
    .filter(({ count }) => count > 0)
    .map(({ outcome, count }) => `${outcome}: ${count}`)
    .join(' · ')
  const successPercent = success.total === 0 ? 0 : Math.round((success.ok / success.total) * 100)
  const retryPercent = success.total === 0 ? 0 : Math.round((retries.retriedChats / success.total) * 100)

  container
    .addTextDisplayComponents(text('**Roka’s Quiet Mechanics**\n-# Nerd · Last 30 Days'))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(
      text(
        [
          '### 🔧 Reply Health',
          stat('Response Time', `${formatLatency(latency.p50)} / ${formatLatency(latency.p95)}`),
          stat('Fastest / Slowest Reply', `${formatLatency(latency.min)} / ${formatLatency(latency.max)}`),
          stat('Success Rate', `${successPercent}% (${formatNumber(success.ok)}/${formatNumber(success.total)})`),
          ...(failureText ? [stat('Failures', failureText)] : []),
          stat('Retry Rate', `${retryPercent}%`),
          stat('Total Thinking Time', formatDuration(latency.total)),
          stat(
            'Words Exchanged',
            `~${formatNumber(heard)} words heard, ~${formatNumber(spoken)} spoken, avg ~${formatNumber(average)} per reply`
          )
        ].join('\n')
      )
    )
    .addTextDisplayComponents(text('-# The gears are humming along nicely behind the counter.'))
  return renderLatencyTrend(p95ByDay(guildId, sinceMs))
}

export async function buildStatsView(guildId: string, guild: Guild, view: StatsView, disabled: boolean = false) {
  const sinceMs = sinceFor(30)
  const container = new ContainerBuilder().setAccentColor(getToneStyle('playful').color)
  const files: AttachmentBuilder[] = []

  if (view === 'overview') {
    const heatmap = await renderActivityHeatmap(activityByDay(guildId, sinceFor(365)))
    buildOverview(guildId, guild, sinceMs, container)
    if (heatmap) {
      container.addSeparatorComponents(separator())
      addChart(container, 'stats-activity.png', 'Server activity over the last 12 months')
      files.push(new AttachmentBuilder(heatmap, { name: 'stats-activity.png' }))
    }
    const histogram = await renderChannelHistogram(
      topChannels(guildId, sinceMs).map(({ channelId, count }) => ({
        label: `#${guild.channels.cache.get(channelId)?.name ?? 'unknown'}`,
        count
      }))
    )
    if (histogram) {
      container.addSeparatorComponents(separator())
      addChart(container, 'stats-channels.png', 'Most active channels')
      files.push(new AttachmentBuilder(histogram, { name: 'stats-channels.png' }))
    }
  } else if (view === 'mood') {
    const chart = await buildMood(guildId, sinceMs, container)
    if (chart) {
      container.addSeparatorComponents(separator())
      addChart(container, 'stats-mood.png', 'Detected reply tones')
      files.push(new AttachmentBuilder(chart, { name: 'stats-mood.png' }))
    }
  } else if (view === 'memory') {
    const chart = await buildMemory(guildId, guild, sinceMs, container)
    if (chart) {
      container.addSeparatorComponents(separator())
      addChart(container, 'stats-memory.png', 'Memory growth over the last 30 days')
      files.push(new AttachmentBuilder(chart, { name: 'stats-memory.png' }))
    }
  } else {
    const chart = await buildNerd(guildId, sinceMs, container)
    if (chart) {
      container.addSeparatorComponents(separator())
      addChart(container, 'stats-latency.png', 'Daily p95 response latency')
      files.push(new AttachmentBuilder(chart, { name: 'stats-latency.png' }))
    }
  }

  container.addActionRowComponents(buildControls(view, disabled))
  return {
    components: [container],
    files,
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}
