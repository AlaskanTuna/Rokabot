/**
 * Hangman mini-game state manager.
 * One active game per channel, 6 lives, 120-second idle timeout.
 */

import { config } from '../config.js'
import { HANGMAN_WORDS } from './data/hangmanWords.js'

export interface HangmanGame {
  channelId: string
  playerId: string
  word: string
  hint: string
  guessedLetters: Set<string>
  remainingLives: number
  active: boolean
  timeoutTimer: ReturnType<typeof setTimeout> | null
  timeoutAt: number
}

export interface StartGameResult {
  success: boolean
  message: string
  display?: string
  hint?: string
}

export interface GuessLetterResult {
  success: boolean
  message: string
  display: string
  correct: boolean
  gameOver: boolean
  won: boolean
  word?: string
  remainingLives: number
}

export interface GuessWordResult {
  success: boolean
  message: string
  display: string
  gameOver: boolean
  won: boolean
  remainingLives: number
}

const INITIAL_LIVES = config.games.hangmanLives
const TIMEOUT_MS = config.games.hangmanTimeoutMs

/** Active games keyed by channel ID. */
const activeGames = new Map<string, HangmanGame>()

/** Callback invoked when a game times out. Override for testing. */
let onTimeout: ((channelId: string, word: string) => void) | null = null

/** Set the timeout callback (used by the command handler to notify Discord). */
export function setTimeoutCallback(cb: (channelId: string, word: string) => void): void {
  onTimeout = cb
}

/** Pick a random word from the curated word bank. */
function pickRandomWord(): { word: string; hint: string } {
  const entry = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)]
  return { word: entry.word, hint: entry.hint }
}

/** Reset the idle timer for a game. Ends the game on timeout. */
function resetTimer(game: HangmanGame): void {
  if (game.timeoutTimer) {
    clearTimeout(game.timeoutTimer)
  }
  game.timeoutAt = Math.floor((Date.now() + TIMEOUT_MS) / 1000)
  game.timeoutTimer = setTimeout(() => {
    const word = game.word
    const channelId = game.channelId
    game.active = false
    activeGames.delete(channelId)
    if (onTimeout) {
      onTimeout(channelId, word)
    }
  }, TIMEOUT_MS)
}

/** Get the display string for the current word state (e.g. `t _ _ y _ k i`). */
export function getDisplayWord(game: HangmanGame): string {
  return game.word
    .split('')
    .map((ch) => (game.guessedLetters.has(ch) ? ch : '_'))
    .join(' ')
}

/** Get the hangman ASCII/emoji art for the given remaining lives count. */
export function getHangmanArt(remainingLives: number): string {
  switch (remainingLives) {
    case 6:
      return '  \u{1F60A}'
    case 5:
      return '  \u{1F61F}\n  \u2502'
    case 4:
      return '  \u{1F61F}\n /\u2502'
    case 3:
      return '  \u{1F61F}\n /\u2502\\'
    case 2:
      return '  \u{1F61F}\n /\u2502\\\n /'
    case 1:
      return '  \u{1F630}\n /\u2502\\\n / \\'
    case 0:
      return '  \u{1F480}\n /\u2502\\\n / \\'
    default:
      return '  \u{1F60A}'
  }
}

/** Start a new hangman game in the given channel. */
export function startGame(channelId: string, playerId: string): StartGameResult {
  if (activeGames.has(channelId)) {
    return {
      success: false,
      message: "There's already a game running in this channel~ Finish it first!"
    }
  }

  const { word, hint } = pickRandomWord()
  const game: HangmanGame = {
    channelId,
    playerId,
    word,
    hint,
    guessedLetters: new Set(),
    remainingLives: INITIAL_LIVES,
    active: true,
    timeoutTimer: null,
    timeoutAt: 0
  }

  activeGames.set(channelId, game)
  resetTimer(game)

  return {
    success: true,
    message: "Let's play hangman~ \u266A",
    display: getDisplayWord(game),
    hint
  }
}

/** Guess a single letter in the active game for the given channel. */
export function guessLetter(channelId: string, letter: string): GuessLetterResult {
  const game = activeGames.get(channelId)
  if (!game || !game.active) {
    return {
      success: false,
      message: 'No active game in this channel~ Use `/hangman start` to begin!',
      display: '',
      correct: false,
      gameOver: false,
      won: false,
      remainingLives: 0
    }
  }

  const normalizedLetter = letter.toLowerCase()

  if (game.guessedLetters.has(normalizedLetter)) {
    return {
      success: false,
      message: `You already tried **${normalizedLetter}**~ Pay attention!`,
      display: getDisplayWord(game),
      correct: false,
      gameOver: false,
      won: false,
      remainingLives: game.remainingLives
    }
  }

  game.guessedLetters.add(normalizedLetter)
  const correct = game.word.includes(normalizedLetter)

  if (!correct) {
    game.remainingLives--
  }

  const lives = game.remainingLives
  const display = getDisplayWord(game)
  const won = !display.includes('_')
  const lost = lives <= 0
  const gameOver = won || lost

  if (gameOver) {
    if (game.timeoutTimer) clearTimeout(game.timeoutTimer)
    game.active = false
    activeGames.delete(channelId)
  } else {
    resetTimer(game)
  }

  if (won) {
    return {
      success: true,
      message: `You got it! The word was **${game.word}**! \u{1F389} As expected~`,
      display,
      correct: true,
      gameOver: true,
      won: true,
      word: game.word,
      remainingLives: lives
    }
  }

  if (lost) {
    return {
      success: true,
      message: `Oh no... the word was **${game.word}**. Better luck next time~ \u{1F495}`,
      display,
      correct: false,
      gameOver: true,
      won: false,
      word: game.word,
      remainingLives: 0
    }
  }

  return {
    success: true,
    message: correct
      ? `Nice~ **${normalizedLetter}** is in there! \u266A`
      : `Mou~ **${normalizedLetter}** isn't in the word!`,
    display,
    correct,
    gameOver: false,
    won: false,
    remainingLives: lives
  }
}

/** Guess the full word in the active game for the given channel. */
export function guessWord(channelId: string, word: string): GuessWordResult {
  const game = activeGames.get(channelId)
  if (!game || !game.active) {
    return {
      success: false,
      message: 'No active game in this channel~ Use `/hangman start` to begin!',
      display: '',
      gameOver: false,
      won: false,
      remainingLives: 0
    }
  }

  const normalizedWord = word.toLowerCase()

  if (normalizedWord === game.word) {
    const lives = game.remainingLives
    if (game.timeoutTimer) clearTimeout(game.timeoutTimer)
    game.active = false
    activeGames.delete(channelId)

    // Reveal all letters in display
    game.guessedLetters = new Set(game.word.split(''))
    const display = getDisplayWord(game)

    return {
      success: true,
      message: `Wow, you figured it out! The word was **${game.word}**! \u2728`,
      display,
      gameOver: true,
      won: true,
      remainingLives: lives
    }
  }

  // Wrong full-word guess costs a life
  game.remainingLives--
  const lives = game.remainingLives
  const display = getDisplayWord(game)
  const lost = lives <= 0

  if (lost) {
    if (game.timeoutTimer) clearTimeout(game.timeoutTimer)
    game.active = false
    activeGames.delete(channelId)

    return {
      success: true,
      message: `Oh no... the word was **${game.word}**. Better luck next time~ \u{1F495}`,
      display,
      gameOver: true,
      won: false,
      remainingLives: 0
    }
  }

  resetTimer(game)

  return {
    success: true,
    message: "Nope, that's not it~ And that costs you a life!",
    display,
    gameOver: false,
    won: false,
    remainingLives: lives
  }
}

/** Get the timeout-at Unix timestamp (seconds) for a channel's active game. */
export function getTimeoutAt(channelId: string): number {
  const game = activeGames.get(channelId)
  return game?.timeoutAt ?? 0
}

/** Get the active game for a channel, if any. */
export function getGame(channelId: string): HangmanGame | undefined {
  return activeGames.get(channelId)
}

/** Check if a game is active in the given channel. */
export function isGameActive(channelId: string): boolean {
  return activeGames.has(channelId)
}

/** Destroy all active games. Used for graceful shutdown. */
export function destroyAllGames(): void {
  for (const game of activeGames.values()) {
    if (game.timeoutTimer) clearTimeout(game.timeoutTimer)
  }
  activeGames.clear()
}
