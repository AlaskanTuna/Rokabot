/** Shiritori game command handlers */

import type { ChatInputCommandInteraction } from 'discord.js'
import {
  endGame as endShiritori,
  getGame as getShiritoriGame,
  getScores as getShiritoriScores,
  getTimeoutAt as getShiritoriTimeoutAt,
  joinGame as joinShiritori,
  startGame as startShiritori,
  submitWord as submitShiritoriWord
} from '../../../games/shiritori.js'
import { getDb } from '../../../storage/database.js'
import { logger } from '../../../utils/logger.js'
import { buildGameContainer } from './shared.js'

export const SHIRITORI_COLORS = {
  start: 0x6c8aff,
  join: 0x6c8aff,
  valid: 0x34c759,
  invalid: 0xff453a,
  end: 0xffd700,
  scores: 0xb0c4de,
  info: 0xff9f0a
}

function saveShiritoriScore(userId: string, score: number): void {
  try {
    getDb()
      .prepare('INSERT INTO game_scores (user_id, game, score, played_at) VALUES (?, ?, ?, ?)')
      .run(userId, 'shiritori', score, Date.now())
  } catch (error) {
    logger.error({ error, userId, score }, 'Failed to save shiritori score')
  }
}

export function handleShiritoriStart(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const member = interaction.member
  const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName

  const result = startShiritori(channelId, displayName)

  if (!result.success) {
    return buildGameContainer({
      accentColor: SHIRITORI_COLORS.info,
      title: 'Shiritori',
      body: result.message
    })
  }

  return buildGameContainer({
    accentColor: SHIRITORI_COLORS.start,
    title: 'Shiritori',
    body: `Alright~ let's play shiritori! \u266A\n\n${result.message}`,
    footer: 'Use /shiritori join to join'
  })
}

export function handleShiritoriJoin(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const member = interaction.member
  const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName

  const result = joinShiritori(channelId, displayName)

  if (!result.success) {
    return buildGameContainer({
      accentColor: SHIRITORI_COLORS.info,
      title: 'Shiritori',
      body: result.message
    })
  }

  const game = getShiritoriGame(channelId)
  const playerCount = game ? game.currentPlayerOrder.length : 0

  return buildGameContainer({
    accentColor: SHIRITORI_COLORS.join,
    title: 'Shiritori',
    body: `Welcome to the game, **${displayName}**~! ${result.message}\n\n${playerCount} player${playerCount !== 1 ? 's' : ''} in the game`
  })
}

export function handleShiritoriPlay(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const member = interaction.member
  const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName
  const word = interaction.options.getString('word', true)

  const result = submitShiritoriWord(channelId, displayName, word)

  if (!result.success) {
    return buildGameContainer({
      accentColor: SHIRITORI_COLORS.invalid,
      title: 'Shiritori',
      body: result.message
    })
  }

  const timeoutAt = getShiritoriTimeoutAt(channelId)
  const timerLine = timeoutAt > 0 ? `\n\n\u23F1\uFE0F <t:${timeoutAt}:R>` : ''

  return buildGameContainer({
    accentColor: SHIRITORI_COLORS.valid,
    title: 'Shiritori',
    body: `Nice one~ ${result.message}${timerLine}`
  })
}

export function handleShiritoriEnd(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const game = getShiritoriGame(channelId)

  if (!game) {
    return buildGameContainer({
      accentColor: SHIRITORI_COLORS.info,
      title: 'Shiritori',
      body: 'There is no active game in this channel!'
    })
  }

  // Save scores for all players before ending
  const playerUserIds = new Map<string, string>()
  const member = interaction.member
  const displayName = member && 'displayName' in member ? member.displayName : interaction.user.displayName
  playerUserIds.set(displayName, interaction.user.id)

  const result = endShiritori(channelId)

  // Save scores to SQLite
  for (const [name, score] of result.scores) {
    const userId = playerUserIds.get(name) ?? name
    saveShiritoriScore(userId, score)
  }

  return buildGameContainer({
    accentColor: SHIRITORI_COLORS.end,
    title: 'Shiritori',
    body: `Game over! Here are the final scores~\n\n${result.message}`
  })
}

export function handleShiritoriScoresCmd(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const result = getShiritoriScores(channelId)

  if (!result.success) {
    return buildGameContainer({
      accentColor: SHIRITORI_COLORS.info,
      title: 'Shiritori',
      body: result.message
    })
  }

  return buildGameContainer({
    accentColor: SHIRITORI_COLORS.scores,
    title: 'Shiritori',
    body: result.message
  })
}

export function handleShiritoriGuide() {
  return buildGameContainer({
    accentColor: 0xb0c4de,
    title: '\uD83D\uDD17 How to Play Shiritori',
    body: [
      'Shiritori is a Japanese word chain game! Each word must start with the **last letter** of the previous word.',
      '',
      '**Commands:**',
      '\u2022 `/shiritori start` \u2014 Start a new game',
      '\u2022 `/shiritori join` \u2014 Join before the first move',
      '\u2022 `/shiritori play <word>` \u2014 Submit your word',
      '\u2022 `/shiritori scores` \u2014 View current scores',
      '\u2022 `/shiritori end` \u2014 End the game early',
      '',
      '**Rules:**',
      '\u2022 Words must be **real English words** (2+ letters)',
      '\u2022 No repeating words already used',
      '\u2022 Only the current player can submit (turns rotate)',
      "\u2022 Take too long (2 min)? You're out!",
      '\u2022 Need at least **2 players** to start',
      '',
      '**Scoring:**',
      '\u2022 +1 point per valid word',
      '\u2022 Last player standing wins!'
    ].join('\n')
  })
}
