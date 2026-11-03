/**
 * Shiritori (word chain) mini-game state manager.
 * Each word must start with the last letter of the previous word.
 * Players take turns, and invalid submissions eliminate the player.
 */

import { createRequire } from 'node:module'
import { character } from '../character/index.js'
import { fillLine } from '../character/lines.js'
import { config } from '../config.js'
import { logger } from '../utils/logger.js'

const require = createRequire(import.meta.url)

const LINES = character.lines.games

export interface ShiritoriPlayer {
  id: string
  name: string
}

export interface ShiritoriGame {
  channelId: string
  players: Map<string, { name: string; score: number }> // user ID -> display name and score
  usedWords: Set<string>
  currentWord: string
  currentPlayerOrder: string[] // ordered list of user IDs
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

  const timedOutPlayerId = game.currentPlayerOrder[game.currentTurnIndex]
  const timedOutPlayer = game.players.get(timedOutPlayerId)?.name ?? timedOutPlayerId
  logger.info({ channelId: game.channelId, player: timedOutPlayer }, 'Shiritori player timed out')

  // Remove the player from order
  game.currentPlayerOrder.splice(game.currentTurnIndex, 1)

  // Adjust turn index if needed
  if (game.currentTurnIndex >= game.currentPlayerOrder.length) {
    game.currentTurnIndex = 0
  }

  // Finish the game before notifying when one player remains
  if (game.currentPlayerOrder.length <= 1) {
    game.active = false
    if (game.timeoutTimer) {
      clearTimeout(game.timeoutTimer)
      game.timeoutTimer = null
    }
  }

  // Fire the timeout callback if set
  if (game.onTimeout) {
    game.onTimeout(game.channelId, timedOutPlayer)
  }

  if (game.currentPlayerOrder.length <= 1) return

  // Reset timeout for next player
  resetTimeout(game)
}

export function startGame(channelId: string, starter: ShiritoriPlayer): ShiritoriResult {
  if (activeGames.has(channelId)) {
    return { success: false, message: LINES.shiritoriAlreadyActive }
  }

  const starterWord = STARTER_WORDS[Math.floor(Math.random() * STARTER_WORDS.length)]

  const game: ShiritoriGame = {
    channelId,
    players: new Map([[starter.id, { name: starter.name, score: 0 }]]),
    usedWords: new Set([starterWord]),
    currentWord: starterWord,
    currentPlayerOrder: [starter.id],
    currentTurnIndex: 0,
    active: true,
    started: false,
    timeoutTimer: null,
    timeoutAt: 0,
    onTimeout: onTimeoutCallback ?? undefined
  }

  activeGames.set(channelId, game)
  logger.info({ channelId, starterName: starter.name, starterWord }, 'Shiritori game started')

  return {
    success: true,
    message: fillLine(LINES.shiritoriStart, { word: starterWord, letter: getLastLetter(starterWord).toUpperCase() })
  }
}

export function joinGame(channelId: string, player: ShiritoriPlayer): ShiritoriResult {
  const game = activeGames.get(channelId)

  if (!game || !game.active) {
    return { success: false, message: LINES.shiritoriNoGame }
  }

  if (game.started) {
    return { success: false, message: LINES.shiritoriAlreadyStarted }
  }

  if (game.players.has(player.id)) {
    return { success: false, message: LINES.shiritoriAlreadyIn }
  }

  game.players.set(player.id, { name: player.name, score: 0 })
  game.currentPlayerOrder.push(player.id)

  logger.info({ channelId, playerName: player.name }, 'Player joined shiritori')

  return {
    success: true,
    message: fillLine(LINES.shiritoriJoined, { name: player.name, count: game.currentPlayerOrder.length })
  }
}

export function submitWord(channelId: string, player: ShiritoriPlayer, word: string): ShiritoriResult {
  const game = activeGames.get(channelId)

  if (!game || !game.active) {
    return { success: false, message: LINES.shiritoriNoGame }
  }

  const normalizedWord = word.toLowerCase().trim()

  // Validate alphabetic only and 2+ letters
  if (!/^[a-z]{2,}$/.test(normalizedWord)) {
    return { success: false, message: LINES.shiritoriInvalid }
  }

  // Mark game as started on first move (locks joining)
  if (!game.started) {
    if (game.currentPlayerOrder.length < 2) {
      return { success: false, message: LINES.shiritoriNeedPlayers }
    }
    game.started = true
  }

  // Check turn order
  const currentPlayerId = game.currentPlayerOrder[game.currentTurnIndex]
  if (player.id !== currentPlayerId) {
    const currentName = game.players.get(currentPlayerId)?.name ?? currentPlayerId
    return {
      success: false,
      message: fillLine(LINES.shiritoriWrongTurn, { current: currentName })
    }
  }

  // Check starting letter
  const requiredLetter = getLastLetter(game.currentWord)
  if (normalizedWord[0] !== requiredLetter) {
    return {
      success: false,
      message: fillLine(LINES.shiritoriWrongLetter, { letter: requiredLetter.toUpperCase() })
    }
  }

  // Check if already used
  if (game.usedWords.has(normalizedWord)) {
    return { success: false, message: fillLine(LINES.shiritoriAlreadyUsed, { word: normalizedWord }) }
  }

  // Check dictionary
  const dict = loadDictionary()
  if (!dict.has(normalizedWord)) {
    return { success: false, message: fillLine(LINES.shiritoriNotWord, { word: normalizedWord }) }
  }

  // Valid word!
  game.usedWords.add(normalizedWord)
  game.currentWord = normalizedWord
  const score = (game.players.get(player.id)?.score ?? 0) + 1
  game.players.set(player.id, { name: player.name, score })

  // Advance turn
  game.currentTurnIndex = (game.currentTurnIndex + 1) % game.currentPlayerOrder.length
  const nextPlayerId = game.currentPlayerOrder[game.currentTurnIndex]
  const nextPlayer = game.players.get(nextPlayerId)?.name ?? nextPlayerId
  const nextLetter = getLastLetter(normalizedWord)

  // Reset timeout
  resetTimeout(game)

  logger.debug({ channelId, playerName: player.name, word: normalizedWord, nextPlayer }, 'Shiritori word accepted')

  return {
    success: true,
    message: fillLine(LINES.shiritoriCorrect, {
      word: normalizedWord,
      letter: nextLetter.toUpperCase(),
      next: nextPlayer
    })
  }
}

export function endGame(channelId: string): { message: string; scores: Map<string, number> } {
  const game = activeGames.get(channelId)

  if (!game) {
    return { message: LINES.shiritoriNoGame, scores: new Map() }
  }

  if (game.timeoutTimer) {
    clearTimeout(game.timeoutTimer)
    game.timeoutTimer = null
  }

  game.active = false
  const scores = new Map([...game.players].map(([id, entry]) => [id, entry.score] as [string, number]))
  activeGames.delete(channelId)

  logger.info({ channelId, scores: Object.fromEntries(scores) }, 'Shiritori game ended')

  // Build scoreboard
  const sorted = [...game.players.entries()].sort((a, b) => b[1].score - a[1].score)
  const scoreboard = sorted
    .map(([, entry], i) => `${i + 1}. **${entry.name}** — ${entry.score} point${entry.score !== 1 ? 's' : ''}`)
    .join('\n')

  return {
    message: fillLine(LINES.shiritoriGameOver, { board: scoreboard }),
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
    return { success: false, message: LINES.shiritoriNoGame }
  }

  const sorted = [...game.players.entries()].sort((a, b) => b[1].score - a[1].score)
  const scoreboard = sorted
    .map(([, entry], i) => `${i + 1}. **${entry.name}** — ${entry.score} point${entry.score !== 1 ? 's' : ''}`)
    .join('\n')

  const currentPlayerId = game.currentPlayerOrder[game.currentTurnIndex]
  const currentPlayer = game.started
    ? (game.players.get(currentPlayerId)?.name ?? currentPlayerId)
    : '(waiting for players)'
  const nextLetter = getLastLetter(game.currentWord).toUpperCase()

  return {
    success: true,
    message: fillLine(LINES.shiritoriScores, {
      board: scoreboard,
      word: game.currentWord,
      letter: nextLetter,
      turn: currentPlayer
    })
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
