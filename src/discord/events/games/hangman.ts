/** Hangman game command handlers */

import type { ChatInputCommandInteraction } from 'discord.js'
import {
  getGame,
  getHangmanArt,
  getTimeoutAt as getHangmanTimeoutAt,
  guessLetter,
  guessWord,
  startGame as startHangman
} from '../../../games/hangman.js'
import { getDb } from '../../../storage/database.js'
import { logger } from '../../../utils/logger.js'
import { buildGameContainer } from './shared.js'

export const HANGMAN_COLORS = {
  start: 0x6c8aff,
  correct: 0x34c759,
  wrong: 0xff453a,
  duplicate: 0xff9f0a,
  win: 0xffd700,
  lose: 0x8b0000,
  info: 0xb0c4de
}

function buildHangmanBody(display: string, art: string, lives: number, timeoutAt?: number): string {
  const hearts = '\u2764\uFE0F'.repeat(lives) + '\uD83D\uDDA4'.repeat(6 - lives)
  const lines = [`\`${display}\``, '', `\`\`\`\n${art}\n\`\`\``, '', hearts]

  if (timeoutAt && timeoutAt > 0) {
    lines.push('', `\u23F1\uFE0F <t:${timeoutAt}:R>`)
  }

  return lines.join('\n')
}

function saveHangmanScore(playerId: string, score: number): void {
  try {
    getDb()
      .prepare('INSERT INTO game_scores (user_id, game, score, played_at) VALUES (?, ?, ?, ?)')
      .run(playerId, 'hangman', score, Date.now())
  } catch (error) {
    logger.error({ error, playerId, score }, 'Failed to save hangman score')
  }
}

export function handleHangmanStart(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const playerId = interaction.user.id
  const result = startHangman(channelId, playerId)

  if (!result.success) {
    return buildGameContainer({
      accentColor: HANGMAN_COLORS.info,
      title: 'Hangman',
      body: result.message
    })
  }

  const game = getGame(channelId)!
  const art = getHangmanArt(game.remainingLives)
  const timeoutAt = getHangmanTimeoutAt(channelId)
  const body = [
    `**Hint:** ${result.hint}`,
    '',
    buildHangmanBody(result.display!, art, game.remainingLives, timeoutAt)
  ].join('\n')

  return buildGameContainer({
    accentColor: HANGMAN_COLORS.start,
    title: 'Hangman',
    body: `Let's play hangman~ \u266A\n\n${body}`
  })
}

export function handleHangmanGuess(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId
  const input = interaction.options.getString('letter_or_word', true).toLowerCase().trim()
  const playerId = interaction.user.id

  // Single letter guess
  if (input.length === 1 && /^[a-z]$/.test(input)) {
    const result = guessLetter(channelId, input)

    if (!result.success) {
      // Duplicate letter or no active game
      if (result.display) {
        const art = getHangmanArt(result.remainingLives)
        const timeoutAt = getHangmanTimeoutAt(channelId)
        const body = buildHangmanBody(result.display, art, result.remainingLives, timeoutAt)
        return buildGameContainer({
          accentColor: HANGMAN_COLORS.duplicate,
          title: 'Hangman',
          body: `${result.message}\n\n${body}`
        })
      }
      return buildGameContainer({
        accentColor: HANGMAN_COLORS.info,
        title: 'Hangman',
        body: result.message
      })
    }

    if (result.gameOver) {
      const art = getHangmanArt(result.remainingLives)
      const display = `\`${result.display}\`\n\n\`\`\`\n${art}\n\`\`\``

      if (result.won) {
        const score = result.remainingLives
        saveHangmanScore(playerId, score)
        return buildGameContainer({
          accentColor: HANGMAN_COLORS.win,
          title: 'Hangman',
          body: `${result.message}\n\n${display}`,
          footer: `Score: ${score} point${score !== 1 ? 's' : ''}`
        })
      } else {
        saveHangmanScore(playerId, 0)
        return buildGameContainer({
          accentColor: HANGMAN_COLORS.lose,
          title: 'Hangman',
          body: `${result.message}\n\n${display}`,
          footer: `The word was: ${result.word}`
        })
      }
    }

    const art = getHangmanArt(result.remainingLives)
    const timeoutAt = getHangmanTimeoutAt(channelId)
    const body = buildHangmanBody(result.display, art, result.remainingLives, timeoutAt)
    const color = result.correct ? HANGMAN_COLORS.correct : HANGMAN_COLORS.wrong
    return buildGameContainer({
      accentColor: color,
      title: 'Hangman',
      body: `${result.message}\n\n${body}`
    })
  }

  // Full word guess
  const result = guessWord(channelId, input)

  if (!result.success) {
    return buildGameContainer({
      accentColor: HANGMAN_COLORS.info,
      title: 'Hangman',
      body: result.message
    })
  }

  if (result.gameOver) {
    const art = getHangmanArt(result.remainingLives)
    const display = `\`${result.display}\`\n\n\`\`\`\n${art}\n\`\`\``

    if (result.won) {
      const score = result.remainingLives
      saveHangmanScore(playerId, score)
      return buildGameContainer({
        accentColor: HANGMAN_COLORS.win,
        title: 'Hangman',
        body: `${result.message}\n\n${display}`,
        footer: `Score: ${score} point${score !== 1 ? 's' : ''}`
      })
    } else {
      saveHangmanScore(playerId, 0)
      return buildGameContainer({
        accentColor: HANGMAN_COLORS.lose,
        title: 'Hangman',
        body: `${result.message}\n\n${display}`,
        footer: `The word was: ${result.display}`
      })
    }
  }

  const art = getHangmanArt(result.remainingLives)
  const timeoutAt = getHangmanTimeoutAt(channelId)
  const body = buildHangmanBody(result.display, art, result.remainingLives, timeoutAt)
  return buildGameContainer({
    accentColor: HANGMAN_COLORS.wrong,
    title: 'Hangman',
    body: `${result.message}\n\n${body}`
  })
}

export function handleHangmanGuide() {
  return buildGameContainer({
    accentColor: 0xb0c4de,
    title: '\uD83C\uDFAF How to Play Hangman',
    body: [
      'Roka picks a secret word from her collection of anime, food, and Japanese culture terms. Your job is to guess it!',
      '',
      '**Commands:**',
      '\u2022 `/hangman start` \u2014 Start a new game',
      '\u2022 `/hangman guess <letter>` \u2014 Guess a single letter',
      '\u2022 `/hangman guess <word>` \u2014 Guess the full word (risky!)',
      '',
      '**Rules:**',
      '\u2022 You have **6 lives** \u2014 each wrong letter costs one',
      '\u2022 Guessing the full word wrong also costs a life',
      '\u2022 You have **2 minutes** per guess before time runs out',
      '\u2022 The hint tells you the category~',
      '',
      '**Scoring:**',
      '\u2022 Win = remaining lives as points (max 6)',
      '\u2022 Lose = 0 points'
    ].join('\n')
  })
}
