/** Gacha / buddy companion command handlers */

import type { ChatInputCommandInteraction } from 'discord.js'
import {
  type BuddyData,
  getBuddy,
  getBuddyCollection,
  getBuddyCount,
  getSpeciesInfo,
  getStreak,
  getTopBuddies,
  hatchDailyBuddy
} from '../../../games/buddy.js'
import {
  type BuddyRarity,
  RARITY_COLORS,
  RARITY_EMOJI,
  RARITY_STAT_RANGE,
  SPECIES,
  STAT_NAMES
} from '../../../games/data/buddySpecies.js'
import { buddySprite, buildBuddyContainer, buildGameContainer, randomFrom } from './shared.js'

/** Build a stat bar: e.g. "CHARM/魅力  ████░░░░░░  4/10" */
function statBar(value: number, max: number = 10): string {
  const filled = '\u2588'.repeat(value)
  const empty = '\u2591'.repeat(max - value)
  return `${filled}${empty}`
}

/** Format a buddy summary for display. */
function formatBuddySummary(buddy: BuddyData): string {
  const info = getSpeciesInfo(buddy.species)
  const rarityEmoji = RARITY_EMOJI[buddy.rarity]
  const shinyTag = buddy.shiny ? ' \u2728 **SHINY**' : ''
  const hatDisplay = buddy.hat !== 'none' ? ` | Hat: ${buddy.hat}` : ''

  const lines = [
    `${info?.emoji ?? ''} **${buddy.name ?? 'Unknown'}** ${rarityEmoji} ${buddy.rarity.toUpperCase()}${shinyTag}`,
    `*${info?.name ?? buddy.species}*${hatDisplay} | Eyes: ${buddy.eyes}`,
    ''
  ]

  if (buddy.personality) {
    lines.push(`> ${buddy.personality}`, '')
  }

  for (const { key, display } of STAT_NAMES) {
    const val = buddy.stats[key] ?? 0
    lines.push(`${display}  ${statBar(val)}  **${val}**/10`)
  }

  return lines.join('\n')
}

function formatHatchTimeRemaining(ms: number): string {
  const minutes = Math.ceil(ms / 60_000)
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** Pet interaction responses grouped by species personality archetypes. */
const PET_RESPONSES: Record<string, string[]> = {
  cute: [
    '*nuzzles against your hand happily~* Ehehe, that tickles!',
    '*purrs softly* ...More pats please~',
    '*wiggles excitedly* You always know just where to scratch!',
    "*rolls over and shows their belly* ...D-Don't get the wrong idea!"
  ],
  cool: [
    "*glances at you* ...Fine, I suppose I'll allow this.",
    "*sits perfectly still* ...I'm not enjoying this. (tail wagging)",
    '*yawns dramatically* How boring... (leans into your hand)',
    '*looks away* ...You may continue.'
  ],
  chaotic: [
    '*bounces off the walls* YAAAA! Again again again!',
    "*shapeshifts into a teacup* ...Ha! Didn't expect that, did you?",
    '*sets something on fire* Oops! ...Worth it though!',
    '*cackles wildly* That was FUN! Do it again!'
  ],
  gentle: [
    '*sways peacefully* Thank you... that feels nice~',
    '*glows softly* Your warmth is really comforting...',
    '*hums a quiet melody* Mmm~ this is nice...',
    '*rustles their leaves/petals contentedly* So peaceful~'
  ]
}

/** Map species to personality archetype for pet responses. */
const SPECIES_ARCHETYPE: Record<string, string> = {
  mochi: 'cute',
  chibi: 'cute',
  usagi: 'cute',
  sakura: 'gentle',
  tsukimi: 'gentle',
  kodama: 'gentle',
  yuki: 'gentle',
  tanuki: 'chaotic',
  bakeneko: 'cool',
  inugami: 'cute',
  kitsune: 'cool',
  kappa: 'chaotic',
  tengu: 'cool',
  nekomata: 'cool',
  tatsu: 'chaotic',
  oni: 'chaotic',
  kaiju: 'chaotic',
  obake: 'chaotic'
}

export function handleHatch(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id
  const result = hatchDailyBuddy(userId)

  if (result.alreadyHatched) {
    const latest = result.buddy
    const info = latest ? getSpeciesInfo(latest.species) : undefined
    const sprite = latest ? buddySprite(latest.species) : undefined
    return buildBuddyContainer({
      accentColor: latest ? RARITY_COLORS[latest.rarity] : 0xb0c4de,
      title: 'Hatch Cooling Down',
      body: `You recently hatched **${latest?.name ?? 'a companion'}** the ${info?.name ?? 'spirit'}~ Come back in **${formatHatchTimeRemaining(result.msUntilNext)}**!`,
      thumbnailUrl: sprite
    })
  }

  const { buddy, count, streak } = result
  const info = getSpeciesInfo(buddy.species)
  const rarityEmoji = RARITY_EMOJI[buddy.rarity]
  const sprite = buddySprite(buddy.species)
  const shinyTag = buddy.shiny ? '\n\u2728 **SHINY VARIANT!** \u2728' : ''

  const body = [
    `A companion spirit has chosen you~!${shinyTag}`,
    '',
    `${info?.emoji ?? ''} **${buddy.name}** ${rarityEmoji} ${buddy.rarity.toUpperCase()}`,
    `*${info?.description ?? ''}*`,
    ''
  ]

  for (const { key, display } of STAT_NAMES) {
    const val = buddy.stats[key] ?? 0
    body.push(`${display}  ${statBar(val)}  **${val}**/10`)
  }

  const streakText = streak > 1 ? ` | \uD83D\uDD25 **${streak}-day streak!**` : ''
  body.push('', `You now have **${count}** companion spirit${count !== 1 ? 's' : ''}~${streakText}`)

  return buildBuddyContainer({
    accentColor: RARITY_COLORS[buddy.rarity],
    title: 'Companion Hatched!',
    body: body.join('\n'),
    thumbnailUrl: sprite
  })
}

export function handleBuddyView(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id
  const buddy = getBuddy(userId)

  if (!buddy) {
    return buildGameContainer({
      accentColor: 0xb0c4de,
      title: 'No Companion',
      body: "You don't have a companion spirit yet~ Use `/gacha hatch` to get one!"
    })
  }

  const count = getBuddyCount(userId)
  const footerParts = [`Companion 1 of ${count}`, `Hatched on ${new Date(buddy.hatchedAt).toLocaleDateString('en-GB')}`]
  const sprite = buddySprite(buddy.species)

  return buildBuddyContainer({
    accentColor: RARITY_COLORS[buddy.rarity],
    title: `${buddy.name ?? 'Your Companion'}`,
    body: formatBuddySummary(buddy),
    thumbnailUrl: sprite,
    footer: footerParts.join(' | ')
  })
}

export function handlePet(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id
  const buddy = getBuddy(userId)

  if (!buddy) {
    return buildGameContainer({
      accentColor: 0xb0c4de,
      title: 'No Companion',
      body: "You don't have a companion spirit yet~ Use `/gacha hatch` to get one!"
    })
  }

  const archetype = SPECIES_ARCHETYPE[buddy.species] ?? 'cute'
  const responses = PET_RESPONSES[archetype] ?? PET_RESPONSES.cute
  const response = randomFrom(responses)
  const info = getSpeciesInfo(buddy.species)
  const sprite = buddySprite(buddy.species)

  return buildBuddyContainer({
    accentColor: RARITY_COLORS[buddy.rarity],
    title: `${info?.emoji ?? ''} ${buddy.name}`,
    body: response,
    thumbnailUrl: sprite
  })
}

export function handleBuddyStats(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id
  const buddy = getBuddy(userId)

  if (!buddy) {
    return buildGameContainer({
      accentColor: 0xb0c4de,
      title: 'No Companion',
      body: "You don't have a companion spirit yet~ Use `/gacha hatch` to get one!"
    })
  }

  const collection = getBuddyCollection(userId)
  const info = getSpeciesInfo(buddy.species)
  const rarityEmoji = RARITY_EMOJI[buddy.rarity]
  const range = RARITY_STAT_RANGE[buddy.rarity]
  const totalStats = Object.values(buddy.stats).reduce((s, v) => s + v, 0)
  const sprite = buddySprite(buddy.species)

  // Collection overview
  const rarityCounts: Record<BuddyRarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 }
  for (const b of collection) rarityCounts[b.rarity]++

  const rarityBreakdown = (Object.entries(rarityCounts) as [BuddyRarity, number][])
    .filter(([, count]) => count > 0)
    .map(([rarity, count]) => `${RARITY_EMOJI[rarity]} ${rarity}: ${count}`)
    .join(' | ')

  const streak = getStreak(userId)
  const streakLine = streak > 0 ? ` | \uD83D\uDD25 ${streak}-day streak` : ''

  const lines = [
    `**Collection:** ${collection.length} companion${collection.length !== 1 ? 's' : ''}${streakLine}`,
    rarityBreakdown,
    '',
    `**Latest:** ${info?.emoji ?? ''} **${buddy.name}** ${rarityEmoji} ${buddy.rarity.toUpperCase()}`,
    '',
    '**Detailed Stats:**',
    ''
  ]

  const statDescriptions: Record<string, string> = {
    charm: 'Social charisma, flirt power',
    wit: 'Cleverness, comedic timing',
    dere: 'Affection level, warmth',
    drama: 'Tendency for dramatic moments',
    luck: 'Plot armor, gacha fortune'
  }

  for (const { key, display } of STAT_NAMES) {
    const val = buddy.stats[key] ?? 0
    lines.push(`**${display}**  ${statBar(val)}  **${val}**/10`)
    lines.push(`-# ${statDescriptions[key] ?? ''}`)
  }

  lines.push('', `**Total:** ${totalStats}/50`)
  lines.push(`**Stat range:** ${range.floor}\u2013${range.max} (${buddy.rarity})`)

  return buildBuddyContainer({
    accentColor: RARITY_COLORS[buddy.rarity],
    title: 'Companion Stats',
    body: lines.join('\n'),
    thumbnailUrl: sprite
  })
}

export function handleBuddyGuide() {
  const speciesByRarity: Record<BuddyRarity, string[]> = {
    common: [],
    uncommon: [],
    rare: [],
    epic: [],
    legendary: []
  }
  for (const s of SPECIES) {
    speciesByRarity[s.rarity].push(`${s.emoji} ${s.name}`)
  }

  return buildGameContainer({
    accentColor: 0xb0c4de,
    title: 'Companion Spirit Guide',
    body: [
      'Hatch a new companion spirit every day and build your collection~ Each day brings a different companion!',
      '',
      '**Commands:**',
      "\u2022 `/gacha hatch` \u2014 Hatch today's companion (1 per day)",
      '\u2022 `/gacha view` \u2014 View your latest companion',
      '\u2022 `/gacha pet` \u2014 Interact with your latest companion',
      '\u2022 `/gacha stats` \u2014 Collection overview and detailed stats',
      '\u2022 `/gacha collection` \u2014 Browse your full collection',
      '\u2022 `/gacha leaderboard` \u2014 Top companions by total stats',
      '',
      '**Rarity Tiers:**',
      `\u2022 ${RARITY_EMOJI.common} **Common** (60%) \u2014 ${speciesByRarity.common.join(', ')}`,
      `\u2022 ${RARITY_EMOJI.uncommon} **Uncommon** (25%) \u2014 ${speciesByRarity.uncommon.join(', ')}`,
      `\u2022 ${RARITY_EMOJI.rare} **Rare** (10%) \u2014 ${speciesByRarity.rare.join(', ')}`,
      `\u2022 ${RARITY_EMOJI.epic} **Epic** (4%) \u2014 ${speciesByRarity.epic.join(', ')}`,
      `\u2022 ${RARITY_EMOJI.legendary} **Legendary** (1%) \u2014 ${speciesByRarity.legendary.join(', ')}`,
      '',
      '**Stats (5):** CHARM/\u9B45\u529B, WIT/\u6A5F\u77E5, DERE/\u30C7\u30EC, DRAMA/\u4FEE\u7F85\u5834, LUCK/\u904B\u547D',
      '',
      'There is also a **1% chance** of a shiny variant~ Good luck!'
    ].join('\n')
  })
}

export function handleBuddyLeaderboard(interaction: ChatInputCommandInteraction) {
  const topBuddies = getTopBuddies(10)

  if (topBuddies.length === 0) {
    return buildGameContainer({
      accentColor: 0xb0c4de,
      title: 'Companion Leaderboard',
      body: 'No companions hatched yet~ Be the first to use `/gacha hatch`!'
    })
  }

  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49']
  const lines = topBuddies.map((buddy, i) => {
    const prefix = i < 3 ? medals[i] : `**${i + 1}.**`
    const info = getSpeciesInfo(buddy.species)
    const totalStats = Object.values(buddy.stats).reduce((s, v) => s + v, 0)
    const rarityEmoji = RARITY_EMOJI[buddy.rarity]
    const shiny = buddy.shiny ? ' \u2728' : ''
    return `${prefix} <@${buddy.userId}> \u2014 **${buddy.name}** ${info?.emoji ?? ''} ${rarityEmoji}${shiny} (${totalStats} pts)`
  })

  const userId = interaction.user.id
  const userInTop = topBuddies.some((b) => b.userId === userId)
  let footer: string | undefined
  if (!userInTop) {
    const userBuddy = getBuddy(userId)
    if (userBuddy) {
      const userTotal = Object.values(userBuddy.stats).reduce((s, v) => s + v, 0)
      footer = `Your companion: ${userBuddy.name} (${userTotal} pts)`
    }
  }

  return buildGameContainer({
    accentColor: 0xffd700,
    title: 'Companion Leaderboard',
    body: lines.join('\n'),
    footer
  })
}
