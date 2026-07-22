import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    games: {
      hangmanLives: 6,
      hangmanTimeoutMs: 120_000
    }
  }
}))

import {
  type HangmanGame,
  destroyAllGames,
  getDisplayWord,
  getGame,
  getHangmanArt,
  getTimeoutAt,
  guessLetter,
  guessWord,
  isGameActive,
  startGame
} from '../hangman.js'

beforeEach(() => {
  destroyAllGames()
  vi.useFakeTimers()
})

afterEach(() => {
  destroyAllGames()
  vi.useRealTimers()
})

describe('startGame', () => {
  it('starts a new game and returns display and hint', () => {
    const result = startGame('ch1', 'player1')
    expect(result.success).toBe(true)
    expect(result.display).toBeDefined()
    expect(result.hint).toBeDefined()
    expect(result.message).toContain('hangman')
  })

  it('prevents starting a second game in the same channel', () => {
    startGame('ch1', 'player1')
    const result = startGame('ch1', 'player2')
    expect(result.success).toBe(false)
    expect(result.message).toContain('already a game')
  })

  it('allows games in different channels', () => {
    const r1 = startGame('ch1', 'player1')
    const r2 = startGame('ch2', 'player1')
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
  })

  it('sets the displayed countdown to the configured timeout', () => {
    startGame('ch1', 'player1')

    expect(getTimeoutAt('ch1') * 1000 - Date.now()).toBeGreaterThanOrEqual(119_000)
  })
})

describe('guessLetter', () => {
  it('returns error when no game is active', () => {
    const result = guessLetter('ch1', 'a')
    expect(result.success).toBe(false)
    expect(result.message).toContain('No active game')
  })

  it('reveals correct letter in display', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    // Force a known word for testing
    ;(game as { word: string }).word = 'ramen'

    const result = guessLetter('ch1', 'r')
    expect(result.success).toBe(true)
    expect(result.correct).toBe(true)
    expect(result.display).toContain('r')
    expect(result.gameOver).toBe(false)
  })

  it('decrements lives on wrong guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    const result = guessLetter('ch1', 'z')
    expect(result.success).toBe(true)
    expect(result.correct).toBe(false)
    expect(result.remainingLives).toBe(5)
    expect(result.message).toContain('z')
  })

  it('resets the displayed countdown to the configured timeout after a wrong guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    vi.advanceTimersByTime(10_000)
    guessLetter('ch1', 'z')

    expect(getTimeoutAt('ch1') * 1000 - Date.now()).toBeGreaterThanOrEqual(119_000)
  })

  it('handles duplicate letter guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    guessLetter('ch1', 'r')
    const result = guessLetter('ch1', 'r')
    expect(result.success).toBe(false)
    expect(result.message).toContain('already tried')
  })

  it('detects win condition when all letters guessed', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'hi'

    guessLetter('ch1', 'h')
    const result = guessLetter('ch1', 'i')
    expect(result.success).toBe(true)
    expect(result.won).toBe(true)
    expect(result.gameOver).toBe(true)
    expect(result.word).toBe('hi')
    expect(isGameActive('ch1')).toBe(false)
  })

  it('detects lose condition when lives reach 0', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    guessLetter('ch1', 'b')
    guessLetter('ch1', 'c')
    guessLetter('ch1', 'd')
    guessLetter('ch1', 'f')
    guessLetter('ch1', 'g')
    const result = guessLetter('ch1', 'h')

    expect(result.success).toBe(true)
    expect(result.won).toBe(false)
    expect(result.gameOver).toBe(true)
    expect(result.remainingLives).toBe(0)
    expect(result.word).toBe('ramen')
    expect(isGameActive('ch1')).toBe(false)
  })

  it('does not decrement lives on correct guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    const result = guessLetter('ch1', 'a')
    expect(result.correct).toBe(true)
    expect(result.remainingLives).toBe(6)
  })
})

describe('guessWord', () => {
  it('returns error when no game is active', () => {
    const result = guessWord('ch1', 'ramen')
    expect(result.success).toBe(false)
    expect(result.message).toContain('No active game')
  })

  it('detects correct full word guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    const result = guessWord('ch1', 'ramen')
    expect(result.success).toBe(true)
    expect(result.won).toBe(true)
    expect(result.gameOver).toBe(true)
    expect(result.message).toContain('ramen')
    expect(isGameActive('ch1')).toBe(false)
  })

  it('costs a life on wrong word guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    const result = guessWord('ch1', 'sushi')
    expect(result.success).toBe(true)
    expect(result.won).toBe(false)
    expect(result.gameOver).toBe(false)
    expect(result.remainingLives).toBe(5)
  })

  it('can lose by wrong word guesses exhausting all lives', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    guessWord('ch1', 'sushi')
    guessWord('ch1', 'mochi')
    guessWord('ch1', 'udon')
    guessWord('ch1', 'dango')
    guessWord('ch1', 'gyoza')
    const result = guessWord('ch1', 'natto')

    expect(result.gameOver).toBe(true)
    expect(result.won).toBe(false)
    expect(result.remainingLives).toBe(0)
    expect(isGameActive('ch1')).toBe(false)
  })

  it('is case insensitive', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    const result = guessWord('ch1', 'RAMEN')
    expect(result.won).toBe(true)
  })
})

describe('getDisplayWord', () => {
  it('shows underscores for unguessed letters', () => {
    const game: HangmanGame = {
      channelId: 'ch1',
      playerId: 'p1',
      word: 'ramen',
      hint: 'food',
      guessedLetters: new Set(),
      remainingLives: 6,
      active: true,
      timeoutTimer: null,
      timeoutAt: 0
    }
    expect(getDisplayWord(game)).toBe('_ _ _ _ _')
  })

  it('reveals guessed letters', () => {
    const game: HangmanGame = {
      channelId: 'ch1',
      playerId: 'p1',
      word: 'ramen',
      hint: 'food',
      guessedLetters: new Set(['r', 'a']),
      remainingLives: 6,
      active: true,
      timeoutTimer: null,
      timeoutAt: 0
    }
    expect(getDisplayWord(game)).toBe('r a _ _ _')
  })

  it('shows fully revealed word', () => {
    const game: HangmanGame = {
      channelId: 'ch1',
      playerId: 'p1',
      word: 'ramen',
      hint: 'food',
      guessedLetters: new Set(['r', 'a', 'm', 'e', 'n']),
      remainingLives: 6,
      active: true,
      timeoutTimer: null,
      timeoutAt: 0
    }
    expect(getDisplayWord(game)).toBe('r a m e n')
  })

  it('handles repeated letters correctly', () => {
    const game: HangmanGame = {
      channelId: 'ch1',
      playerId: 'p1',
      word: 'natto',
      hint: 'food',
      guessedLetters: new Set(['t']),
      remainingLives: 6,
      active: true,
      timeoutTimer: null,
      timeoutAt: 0
    }
    expect(getDisplayWord(game)).toBe('_ _ t t _')
  })
})

describe('getHangmanArt', () => {
  it('returns happy face for 6 lives', () => {
    const art = getHangmanArt(6)
    expect(art).toContain('\u{1F60A}')
  })

  it('returns worried face with body for 5 lives', () => {
    const art = getHangmanArt(5)
    expect(art).toContain('\u{1F61F}')
    expect(art).toContain('\u2502')
  })

  it('returns worried face with one arm for 4 lives', () => {
    const art = getHangmanArt(4)
    expect(art).toContain('/\u2502')
  })

  it('returns worried face with both arms for 3 lives', () => {
    const art = getHangmanArt(3)
    expect(art).toContain('/\u2502\\')
  })

  it('returns worried face with one leg for 2 lives', () => {
    const art = getHangmanArt(2)
    expect(art).toContain('/')
    const lines = art.split('\n')
    expect(lines.length).toBe(3)
  })

  it('returns sweating face with both legs for 1 life', () => {
    const art = getHangmanArt(1)
    expect(art).toContain('\u{1F630}')
    expect(art).toContain('/ \\')
  })

  it('returns skull for 0 lives', () => {
    const art = getHangmanArt(0)
    expect(art).toContain('\u{1F480}')
    expect(art).toContain('/ \\')
  })
})

describe('game lifecycle', () => {
  it('isGameActive returns true during active game', () => {
    expect(isGameActive('ch1')).toBe(false)
    startGame('ch1', 'player1')
    expect(isGameActive('ch1')).toBe(true)
  })

  it('getGame returns game data during active game', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')
    expect(game).toBeDefined()
    expect(game!.channelId).toBe('ch1')
    expect(game!.playerId).toBe('player1')
    expect(game!.remainingLives).toBe(6)
  })

  it('destroyAllGames clears all games', () => {
    startGame('ch1', 'player1')
    startGame('ch2', 'player2')
    expect(isGameActive('ch1')).toBe(true)
    expect(isGameActive('ch2')).toBe(true)

    destroyAllGames()
    expect(isGameActive('ch1')).toBe(false)
    expect(isGameActive('ch2')).toBe(false)
  })

  it('game times out after 120 seconds of inactivity', () => {
    startGame('ch1', 'player1')
    expect(isGameActive('ch1')).toBe(true)

    vi.advanceTimersByTime(120_000)
    expect(isGameActive('ch1')).toBe(false)
  })

  it('timer resets on each guess', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'ramen'

    // Advance 50 seconds (less than 120s timeout)
    vi.advanceTimersByTime(50_000)
    expect(isGameActive('ch1')).toBe(true)

    // Make a guess, which resets the timer
    guessLetter('ch1', 'r')

    // Advance another 50 seconds — should still be active since timer was reset
    vi.advanceTimersByTime(50_000)
    expect(isGameActive('ch1')).toBe(true)

    // Advance to trigger timeout (70s more = 120s total since last guess)
    vi.advanceTimersByTime(70_001)
    expect(isGameActive('ch1')).toBe(false)
  })

  it('allows new game in channel after previous game ends', () => {
    startGame('ch1', 'player1')
    const game = getGame('ch1')!
    ;(game as { word: string }).word = 'hi'

    guessLetter('ch1', 'h')
    guessLetter('ch1', 'i') // win

    expect(isGameActive('ch1')).toBe(false)
    const result = startGame('ch1', 'player1')
    expect(result.success).toBe(true)
  })
})
