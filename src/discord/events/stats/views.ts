import {
  ActionRowBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder
} from '@discordjs/builders'
import { AttachmentBuilder, MessageFlags } from 'discord.js'
import { getToneStyle } from '../../toneStyles.js'
import { renderActivitySparkline, renderToneBarChart } from './charts.js'
import {
  activeClaimCount,
  activityByDay,
  busiestChannel,
  chatsSince,
  distinctRememberedUsers,
  hourHistogram,
  latencyPercentiles,
  legacyFactCount,
  outcomeBreakdown,
  retrySummary,
  tokenTotals,
  topTones
} from './queries.js'

export const STATS_VIEWS = ['overview', 'mood', 'memory', 'nerd'] as const
export type StatsView = (typeof STATS_VIEWS)[number]

export const STATS_WINDOWS = ['7d', '30d', '90d'] as const
export type StatsWindow = (typeof STATS_WINDOWS)[number]

const TONE_KEYS = [
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
] as const

type ToneKey = (typeof TONE_KEYS)[number]

export const TONE_KAOMOJI: Record<ToneKey, string> = {
  playful: '(≧▽≦)',
  sincere: '(◕‿◕✿)',
  domestic: '(´▽｀)',
  flustered: '(⁄ ⁄•⁄ω⁄•⁄ ⁄)',
  curious: '(・ω・)ノ',
  annoyed: '(๑•́ ▽ •́๑)',
  tender: '(〃ω〃)',
  confident: 'σ(≧ε≦σ)',
  nostalgic: '(´△｀)',
  mischievous: '(´・ω・\\`)',
  sleepy: '( ˘ω˘ )',
  competitive: "(´；ω；)'"
}

const WINDOW_DAYS: Record<StatsWindow, number> = { '7d': 7, '30d': 30, '90d': 90 }

function sinceFor(window: StatsWindow): number {
  return Date.now() - WINDOW_DAYS[window] * 24 * 60 * 60 * 1000
}

function isToneKey(tone: string): tone is ToneKey {
  return (TONE_KEYS as readonly string[]).includes(tone)
}

function countMap(guildId: string, sinceMs: number): Map<ToneKey, number> {
  const counts = new Map<ToneKey, number>()
  for (const entry of topTones(guildId, sinceMs)) {
    if (isToneKey(entry.tone)) counts.set(entry.tone, entry.count)
  }
  return counts
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function textBar(value: number, maximum: number): string {
  if (value === 0 || maximum === 0) return '────────'
  return `${'█'.repeat(Math.max(1, Math.round((value / maximum) * 8)))}${'░'.repeat(
    Math.max(0, 8 - Math.max(1, Math.round((value / maximum) * 8)))
  )}`
}

function funFact(guildId: string, sinceMs: number, chats: number): string {
  const busiestHour = [...hourHistogram(guildId, sinceMs)].sort((left, right) => right.count - left.count)[0]
  if (busiestHour && busiestHour.hour < 6) {
    return 'Your coziest chatter happens after midnight — this server is full of little night owls, fufu~'
  }
  if (chats >= 25) {
    return 'This place has been quite the chatterbox lately. I can barely keep the tea warm between messages~'
  }
  return 'Even the quiet little chats make the shrine feel lived in, you know~'
}

function buildOverview(guildId: string, sinceMs: number): { content: string; tone: ToneKey } {
  const tones = countMap(guildId, sinceMs)
  const topThree = [...tones.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)
  const tone = topThree[0]?.[0] ?? 'playful'
  const chats = chatsSince(guildId, sinceMs)
  const channel = busiestChannel(guildId, sinceMs)
  const mood = topThree.length
    ? topThree.map(([name, count]) => `${TONE_KAOMOJI[name]} **${name}** ${count}`).join('  ·  ')
    : 'The mood ring is waiting for its first little sparkle~'

  return {
    tone,
    content: `### Roka’s Little Ledger\n-# Overview · recent activity\n\n**Mood Ring**\n${mood}\n\n**Chats in This Window:** ${formatNumber(chats)}\n**Busiest Corner:** ${channel ? `<#${channel.channelId}> (${formatNumber(channel.count)} chats)` : 'Still waiting for visitors'}\n\n-# ${funFact(guildId, sinceMs, chats)}`
  }
}

function buildMood(guildId: string, sinceMs: number, window: StatsWindow): string {
  const windowCounts = countMap(guildId, sinceMs)
  const allTimeCounts = countMap(guildId, 0)
  const maximum = Math.max(
    1,
    ...TONE_KEYS.map((tone) => Math.max(windowCounts.get(tone) ?? 0, allTimeCounts.get(tone) ?? 0))
  )
  const rows = TONE_KEYS.map((tone) => {
    const current = windowCounts.get(tone) ?? 0
    const allTime = allTimeCounts.get(tone) ?? 0
    return `${TONE_KAOMOJI[tone]} ${tone.padEnd(12)} ${textBar(current, maximum)} ${String(current).padStart(3)} | ${textBar(allTime, maximum)} ${String(allTime).padStart(3)}`
  })

  return `### Mood Ring\n-# ${window.toUpperCase()} window | All Time\n\n\`Mood          Recent              | All Time\`\n${rows.map((row) => `\`${row}\``).join('\n')}`
}

function buildMemory(guildId: string): string {
  return `### Memory Garden\n-# These are warm little totals, never anyone’s private details.\n\n**Active Memory Petals:** ${formatNumber(activeClaimCount(guildId))}\n**Friends Remembered:** ${formatNumber(distinctRememberedUsers(guildId))}\n**Legacy Keepsakes:** ${formatNumber(legacyFactCount(guildId))}\n\n-# I only count the flowers here — their stories stay safely tucked away, ne~`
}

function buildNerd(guildId: string, sinceMs: number, window: StatsWindow): string {
  const latency = latencyPercentiles(guildId, sinceMs)
  const retries = retrySummary(guildId, sinceMs)
  const outcomes = outcomeBreakdown(guildId, sinceMs)
  const tokens = tokenTotals(guildId, sinceMs)
  const outcomeText = outcomes.length
    ? outcomes.map(({ outcome, count }) => `${outcome}: ${count}`).join(' · ')
    : 'No replies yet'

  return `### Shrine Ledger, Deep Cut\n-# ${window.toUpperCase()} window · numbers only, no mysteries spilled\n\n**Latency (p50 / p95)**\nEnd-to-end: ${latency.e2e.p50}ms / ${latency.e2e.p95}ms\nGenerate: ${latency.generate.p50}ms / ${latency.generate.p95}ms\nLLM: ${latency.llm.p50}ms / ${latency.llm.p95}ms\n\n**Retries:** ${retries.totalRetries} across ${retries.retriedChats} chats (${retries.retryLatencyMs}ms)\n**Outcomes:** ${outcomeText}\n**Token Totals:** ${formatNumber(tokens.input)} in · ${formatNumber(tokens.output)} out · **${formatNumber(tokens.total)} total**`
}

function buildControls(view: StatsView, window: StatsWindow, disabled: boolean) {
  const viewSelect = new StringSelectMenuBuilder()
    .setCustomId(`stats:view:${window}`)
    .setPlaceholder('Choose a page')
    .setDisabled(disabled)
    .addOptions(
      STATS_VIEWS.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value, default: value === view }))
    )
  const windowSelect = new StringSelectMenuBuilder()
    .setCustomId(`stats:window:${view}`)
    .setPlaceholder('Choose a window')
    .setDisabled(disabled)
    .addOptions(STATS_WINDOWS.map((value) => ({ label: value.toUpperCase(), value, default: value === window })))

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(viewSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(windowSelect)
  ]
}

export async function buildStatsView(guildId: string, view: StatsView, window: StatsWindow, disabled: boolean = false) {
  const sinceMs = sinceFor(window)
  const overview = view === 'overview' ? buildOverview(guildId, sinceMs) : undefined
  const content =
    overview?.content ??
    (view === 'mood'
      ? buildMood(guildId, sinceMs, window)
      : view === 'memory'
        ? buildMemory(guildId)
        : buildNerd(guildId, sinceMs, window))
  const tone = overview?.tone ?? 'playful'
  const container = new ContainerBuilder()
    .setAccentColor(getToneStyle(tone).color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))

  const chart =
    view === 'overview'
      ? await renderActivitySparkline(activityByDay(guildId, sinceMs))
      : view === 'mood'
        ? await renderToneBarChart(countMap(guildId, sinceMs))
        : null
  const chartFilename = view === 'overview' ? 'stats-activity.png' : 'stats-mood.png'

  if (chart) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(`attachment://${chartFilename}`)
          .setDescription(view === 'overview' ? 'Daily chat activity' : 'Detected tone counts')
      )
    )
  }

  for (const control of buildControls(view, window, disabled)) container.addActionRowComponents(control)

  return {
    components: [container],
    ...(chart ? { files: [new AttachmentBuilder(chart, { name: chartFilename })] } : { files: [] }),
    flags: MessageFlags.IsComponentsV2 as typeof MessageFlags.IsComponentsV2
  }
}
