/**
 * Shiritori (word chain) mini-game state manager.
 * Each word must start with the last letter of the previous word.
 * Players take turns, and invalid submissions eliminate the player.
 */

import { createRequire } from 'node:module'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const require = createRequire(import.meta.url)

export interface ShiritoriGame {
  channelId: string
  players: Map<string, number> // displayName -> score
  usedWords: Set<string>
  currentWord: string
  currentPlayerOrder: string[] // ordered list of player displayNames
  currentTurnIndex: number
  active: boolean
  started: boolean // true once first move has been made (joining locked)
  timeoutTimer: ReturnType<typeof setTimeout> | null
  timeoutAt: number
  onTimeout?: (channelId: string, playerName: string) => void
}

export interface ShiritoriResult {
  success: boolean
  message: string
  gameOver?: boolean
  winner?: string
  scores?: Map<string, number>
}

const STARTER_WORDS = [
  'apple',
  'beach',
  'brain',
  'candy',
  'dance',
  'eagle',
  'flame',
  'grape',
  'happy',
  'ivory',
  'jolly',
  'lemon',
  'magic',
  'night',
  'ocean',
  'piano',
  'queen',
  'river',
  'smile',
  'table',
  'under',
  'vivid',
  'water',
  'young',
  'zebra'
]

const TIMEOUT_MS = config.games.shiritoriTimeoutMs

let dictionary: Set<string> | null = null

function loadDictionary(): Set<string> {
  if (!dictionary) {
    const words: string[] = require('./data/wordlist.json')
    dictionary = new Set(words)
  }
  return dictionary
}

/** Exposed for testing — override the dictionary with a custom set. */
export function setDictionary(words: Set<string>): void {
  dictionary = words
}

const activeGames = new Map<string, ShiritoriGame>()

let onTimeoutCallback: ((channelId: string, playerName: string) => void) | null = null

export function setTimeoutCallback(cb: (channelId: string, playerName: string) => void): void {
  onTimeoutCallback = cb
}

function getLastLetter(word: string): string {
  return word[word.length - 1].toLowerCase()
}

function resetTimeout(game: ShiritoriGame): void {
  if (game.timeoutTimer) {
    clearTimeout(game.timeoutTimer)
    game.timeoutTimer = null
  }

  if (!game.active || !game.started || game.currentPlayerOrder.length < 2) return

  game.timeoutAt = Math.floor((Date.now() + TIMEOUT_MS) / 1000)
  game.timeoutTimer = setTimeout(() => {
    handleTimeout(game)
  }, TIMEOUT_MS)
}

function handleTimeout(game: ShiritoriGame): void {
  if (!game.active || !game.started) return

  const timedOutPlayer = game.currentPlayerOrder[game.currentTurnIndex]
  logger.info({ channelId: game.channelId, player: timedOutPlayer }, 'Shiritori player timed out')

  // Remove the player from order
  game.currentPlayerOrder.splice(game.currentTurnIndex, 1)

  // Adjust turn index if needed
  if (game.currentTurnIndex >= game.currentPlayerOrder.length) {
    game.currentTurnIndex = 0
  }

  // Fire the timeout callback if set
  if (game.onTimeout) {
    game.onTimeout(game.channelId, timedOutPlayer)
  }

  // Check if only one player remains
  if (game.currentPlayerOrder.length <= 1) {
    game.active = false
    if (game.timeoutTimer) {
      clearTimeout(game.timeoutTimer)
      game.timeoutTimer = null
    }
    return
  }

  // Reset timeout for next player
  resetTimeout(game)
}

export function startGame(channelId: string, starterName: string): ShiritoriResult {
  if (activeGames.has(channelId)) {
    return { success: false, message: 'There is already an active game in this channel!' }
  }

  const starterWord = STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)]

  const game: ShiritoriGame = {
    channelId,
    players: new Map([[starterName, 0]]),
    usedWords: new Set([starterWord]),
    currentWord: starterWord,
    currentPlayerOrder: [starterName],
    currentTurnIndex: 0,
    active: true,
    started: false,
    timeoutTimer: null,
    timeoutAt: 0,
    onTimeout: onTimeoutCallback ?? undefined
  }

  activeGames.set(channelId, game)
  logger.info({ channelId, starterName, starterWord }, 'Shiritori game started')

  return {
    success: true,
    message: `Game started! The starting word is **${starterWord}**. Next letter: **${getLastLetter(starterWord).toUpperCase()}**. Use \`/shiritori join\` to join, then \`/shiritori play\` to start!`
  }
}

export function joinGame(channelId: string, playerName: string): ShiritoriResult {
  const game = activeGames.get(channelId)

  if (!game || !game.active) {
    return { success: false, message: 'There is no active game in this channel!' }
  }

  if (game.started) {
    return { success: false, message: 'The game has already started! Wait for the next round~' }
  }

  if (game.players.has(playerName)) {
    return { success: false, message: 'You are already in the game!' }
  }

  game.players.set(playerName, 0)
  game.currentPlayerOrder.push(playerName)

  logger.info({ channelId, playerName }, 'Player joined shiritori')

  return {
    success: true,
    message: `**${playerName}** joined the game! (${game.currentPlayerOrder.length} players)`
  }
}

export function submitWord(channelId: string, playerName: string, word: string): ShiritoriResult {
  const game = activeGames.get(channelId)

  if (!game || !game.active) {
    return { success: false, message: 'There is no active game in this channel!' }
  }

  const normalizedWord = word.toLowerCase().trim()

  // Validate alphabetic only and 2+ letters
  if (!/^[a-z]{2,}$/.test(normalizedWord)) {
    return { success: false, message: 'Words must be 2+ letters and contain only letters!' }
  }

  // Mark game as started on first move (locks joining)
  if (!game.started) {
    if (game.currentPlayerOrder.length < 2) {
      return { success: false, message: 'Need at least 2 players! Ask someone to `/shiritori join` first~' }
    }
    game.started = true
  }

  // Check turn order
  const currentPlayer = game.currentPlayerOrder[game.currentTurnIndex]
  if (playerName !== currentPlayer) {
    return {
      success: false,
      message: `It's not your turn! It's **${currentPlayer}**'s turn~`
    }
  }

  // Check starting letter
  const requiredLetter = getLastLetter(game.currentWord)
  if (normalizedWord[0] !== requiredLetter) {
    return {
      success: false,
      message: `That word doesn't start with **${requiredLetter.toUpperCase()}**! Try again~`
    }
  }

  // Check if already used
  if (game.usedWords.has(normalizedWord)) {
    return { success: false, message: `**${normalizedWord}** was already used! Try something else~` }
  }

  // Check dictionary
  const dict = loadDictionary()
  if (!dict.has(normalizedWord)) {
    return { success: false, message: `I don't think **${normalizedWord}** is a real word...` }
  }

  // Valid word!
  game.usedWords.add(normalizedWord)
  game.currentWord = normalizedWord
  const score = (game.players.get(playerName) ?? 0) + 1
  game.players.set(playerName, score)

  // Advance turn
  game.currentTurnIndex = (game.currentTurnIndex + 1) % game.currentPlayerOrder.length
  const nextPlayer = game.currentPlayerOrder[game.currentTurnIndex]
  const nextLetter = getLastLetter(normalizedWord)

  // Reset timeout
  resetTimeout(game)

  logger.debug({ channelId, playerName, word: normalizedWord, nextPlayer }, 'Shiritori word accepted')

  return {
    success: true,
    message: `**${normalizedWord}** is correct! Next letter: **${nextLetter.toUpperCase()}**. Your turn, **${nextPlayer}**!`
  }
}

export function endGame(channelId: string): { message: string; scores: Map<string, number> } {
  const game = activeGames.get(channelId)

  if (!game) {
    return { message: 'There is no active game in this channel!', scores: new Map() }
  }

  if (game.timeoutTimer) {
    clearTimeout(game.timeoutTimer)
    game.timeoutTimer = null
  }

  game.active = false
  const scores = new Map(game.players)
  activeGames.delete(channelId)

  logger.info({ channelId, scores: Object.fromEntries(scores) }, 'Shiritori game ended')

  // Build scoreboard
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1])
  const scoreboard = sorted.map(([name, s], i) => `${i + 1}. **${name}** — ${s} point${s !== 1 ? 's' : ''}`).join('\n')

  return {
    message: `Game over!\n\n${scoreboard}`,
    scores
  }
}

/** Get the timeout-at Unix timestamp (seconds) for a channel's active game. */
export function getTimeoutAt(channelId: string): number {
  const game = activeGames.get(channelId)
  return game?.timeoutAt ?? 0
}

export function getGame(channelId: string): ShiritoriGame | undefined {
  return activeGames.get(channelId)
}

export function isGameActive(channelId: string): boolean {
  const game = activeGames.get(channelId)
  return game?.active ?? false
}

export function getScores(channelId: string): ShiritoriResult {
  const game = activeGames.get(channelId)

  if (!game || !game.active) {
    return { success: false, message: 'There is no active game in this channel!' }
  }

  const sorted = [...game.players.entries()].sort((a, b) => b[1] - a[1])
  const scoreboard = sorted.map(([name, s], i) => `${i + 1}. **${name}** — ${s} point${s !== 1 ? 's' : ''}`).join('\n')

  const currentPlayer = game.started ? game.currentPlayerOrder[game.currentTurnIndex] : '(waiting for players)'
  const nextLetter = getLastLetter(game.currentWord).toUpperCase()

  return {
    success: true,
    message: `**Current Scores**\n${scoreboard}\n\nCurrent word: **${game.currentWord}** | Next letter: **${nextLetter}** | Turn: **${currentPlayer}**`
  }
}

export function destroyAllGames(): void {
  for (const game of activeGames.values()) {
    if (game.timeoutTimer) {
      clearTimeout(game.timeoutTimer)
      game.timeoutTimer = null
    }
  }
  activeGames.clear()
  logger.info('All shiritori games destroyed')
}
