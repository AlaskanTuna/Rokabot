import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as shiritori from '../shiritori.js'

const { testConfig } = vi.hoisted(() => ({
  testConfig: {
    games: { shiritoriTimeoutMs: 120_000 },
    logging: { level: 'silent' }
  }
}))

vi.mock('../../config.js', () => ({ config: testConfig }))

import {
  destroyAllGames,
  endGame,
  getGame,
  getScores,
  getTimeoutAt,
  isGameActive,
  joinGame,
  setDictionary,
  startGame,
  submitWord
} from '../shiritori.js'

// Use a small test dictionary
const TEST_DICTIONARY = new Set([
  'apple',
  'elephant',
  'table',
  'eagle',
  'energy',
  'yellow',
  'wonder',
  'rain',
  'night',
  'tree',
  'egg',
  'green',
  'nice',
  'ear',
  'red',
  'dog',
  'game',
  'even',
  'new',
  'west',
  'time',
  'end',
  'day',
  'yes',
  'sun',
  'no',
  'on',
  'net',
  'ten',
  'nest',
  'tea',
  'ace',
  'eat'
])

describe('shiritori', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-22T00:00:00Z'))
    setDictionary(TEST_DICTIONARY)
    destroyAllGames()
  })

  afterEach(() => {
    destroyAllGames()
    vi.useRealTimers()
  })

  describe('startGame', () => {
    it('creates a new game successfully', () => {
      const result = startGame('ch-1', 'Alice')
      expect(result.success).toBe(true)
      expect(result.message).toContain('Game started')
      expect(isGameActive('ch-1')).toBe(true)
    })

    it('rejects starting a second game in the same channel', () => {
      startGame('ch-1', 'Alice')
      const result = startGame('ch-1', 'Bob')
      expect(result.success).toBe(false)
      expect(result.message).toContain('already an active game')
    })

    it('allows games in different channels', () => {
      const r1 = startGame('ch-1', 'Alice')
      const r2 = startGame('ch-2', 'Bob')
      expect(r1.success).toBe(true)
      expect(r2.success).toBe(true)
      expect(isGameActive('ch-1')).toBe(true)
      expect(isGameActive('ch-2')).toBe(true)
    })

    it('initializes the game with correct state', () => {
      startGame('ch-1', 'Alice')
      const game = getGame('ch-1')
      expect(game).toBeDefined()
      expect(game!.players.has('Alice')).toBe(true)
      expect(game!.players.get('Alice')).toBe(0)
      expect(game!.currentPlayerOrder).toEqual(['Alice'])
      expect(game!.active).toBe(true)
      expect(game!.started).toBe(false)
      expect(game!.usedWords.size).toBe(1) // starter word
    })
  })

  describe('joinGame', () => {
    it('allows a player to join an active game', () => {
      startGame('ch-1', 'Alice')
      const result = joinGame('ch-1', 'Bob')
      expect(result.success).toBe(true)
      expect(result.message).toContain('Bob')

      const game = getGame('ch-1')!
      expect(game.players.has('Bob')).toBe(true)
      expect(game.currentPlayerOrder).toContain('Bob')
    })

    it('rejects joining a nonexistent game', () => {
      const result = joinGame('ch-1', 'Alice')
      expect(result.success).toBe(false)
      expect(result.message).toContain('no active game')
    })

    it('rejects duplicate joins', () => {
      startGame('ch-1', 'Alice')
      joinGame('ch-1', 'Bob')
      const result = joinGame('ch-1', 'Bob')
      expect(result.success).toBe(false)
      expect(result.message).toContain('already in the game')
    })

    it('rejects joining after game has started', () => {
      startGame('ch-1', 'Alice')
      joinGame('ch-1', 'Bob')

      // Directly mark game as started (avoids flakiness from random starter word)
      const game = getGame('ch-1')!
      game.started = true

      const result = joinGame('ch-1', 'Charlie')
      expect(result.success).toBe(false)
      expect(result.message).toContain('already started')
    })
  })

  describe('submitWord', () => {
    beforeEach(() => {
      // Set up a game with a known starter word
      startGame('ch-1', 'Alice')
      joinGame('ch-1', 'Bob')
    })

    it('rejects submission when no game exists', () => {
      const result = submitWord('ch-999', 'Alice', 'hello')
      expect(result.success).toBe(false)
      expect(result.message).toContain('no active game')
    })

    it('rejects non-alphabetic words', () => {
      const result = submitWord('ch-1', 'Alice', 'hello123')
      expect(result.success).toBe(false)
      expect(result.message).toContain('2+ letters')
    })

    it('rejects single-character words', () => {
      const result = submitWord('ch-1', 'Alice', 'a')
      expect(result.success).toBe(false)
      expect(result.message).toContain('2+ letters')
    })

    it('rejects words with wrong starting letter', () => {
      const game = getGame('ch-1')!
      const requiredLetter = game.currentWord[game.currentWord.length - 1]
      // Find a word that does NOT start with the required letter
      const wrongWord = [...TEST_DICTIONARY].find((w) => w[0] !== requiredLetter)
      if (wrongWord) {
        const result = submitWord('ch-1', 'Alice', wrongWord)
        expect(result.success).toBe(false)
        expect(result.message).toContain("doesn't start with")
      }
    })

    it('rejects words not in dictionary', () => {
      const game = getGame('ch-1')!
      const requiredLetter = game.currentWord[game.currentWord.length - 1]
      const result = submitWord('ch-1', 'Alice', requiredLetter + 'zzzzz')
      expect(result.success).toBe(false)
      expect(result.message).toContain("don't think")
    })

    it('rejects already used words', () => {
      const game = getGame('ch-1')!
      const starterWord = game.currentWord
      const requiredLetter = starterWord[starterWord.length - 1]

      // Find two valid words starting with requiredLetter
      const validWords = [...TEST_DICTIONARY].filter((w) => w[0] === requiredLetter && !game.usedWords.has(w))

      if (validWords.length >= 1) {
        const word1 = validWords[0]
        submitWord('ch-1', 'Alice', word1) // Alice plays

        // Bob needs to play a word ending in the right letter for Alice to reuse
        const bobLetter = word1[word1.length - 1]
        const bobWord = [...TEST_DICTIONARY].find((w) => w[0] === bobLetter && !game.usedWords.has(w))
        if (bobWord) {
          submitWord('ch-1', 'Bob', bobWord) // Bob plays

          // Now try to reuse word1 (if its starting letter matches)
          const nextLetter = bobWord[bobWord.length - 1]
          if (word1[0] === nextLetter) {
            const result = submitWord('ch-1', 'Alice', word1)
            expect(result.success).toBe(false)
            expect(result.message).toContain('already used')
          }
        }
      }
    })

    it('rejects submission from wrong player (not their turn)', () => {
      const game = getGame('ch-1')!
      const requiredLetter = game.currentWord[game.currentWord.length - 1]
      const validWord = [...TEST_DICTIONARY].find((w) => w[0] === requiredLetter && !game.usedWords.has(w))

      if (validWord) {
        // Bob tries to play when it's Alice's turn
        const result = submitWord('ch-1', 'Bob', validWord)
        expect(result.success).toBe(false)
        expect(result.message).toContain('not your turn')
      }
    })

    it('accepts valid word and advances turn', () => {
      const game = getGame('ch-1')!
      const requiredLetter = game.currentWord[game.currentWord.length - 1]
      const validWord = [...TEST_DICTIONARY].find((w) => w[0] === requiredLetter && !game.usedWords.has(w))

      if (validWord) {
        const result = submitWord('ch-1', 'Alice', validWord)
        expect(result.success).toBe(true)
        expect(result.message).toContain(validWord)
        expect(result.message).toContain('Bob')

        // Score should increment
        expect(game.players.get('Alice')).toBe(1)

        // Turn should advance to Bob
        expect(game.currentPlayerOrder[game.currentTurnIndex]).toBe('Bob')
      }
    })

    it('requires at least 2 players before first move', () => {
      destroyAllGames()
      startGame('ch-2', 'Alice')
      // Only Alice, no one else joined

      const game = getGame('ch-2')!
      const requiredLetter = game.currentWord[game.currentWord.length - 1]
      const validWord = [...TEST_DICTIONARY].find((w) => w[0] === requiredLetter && !game.usedWords.has(w))

      if (validWord) {
        const result = submitWord('ch-2', 'Alice', validWord)
        expect(result.success).toBe(false)
        expect(result.message).toContain('at least 2 players')
      }
    })

    it('handles case-insensitive words', () => {
      const game = getGame('ch-1')!
      const requiredLetter = game.currentWord[game.currentWord.length - 1]
      const validWord = [...TEST_DICTIONARY].find((w) => w[0] === requiredLetter && !game.usedWords.has(w))

      if (validWord) {
        const result = submitWord('ch-1', 'Alice', validWord.toUpperCase())
        expect(result.success).toBe(true)
      }
    })
  })

  describe('turn timeout', () => {
    it('uses the registered callback and configured timeout', () => {
      const onTimeout = vi.fn()
      shiritori.setTimeoutCallback(onTimeout)
      startGame('ch-timeout', 'Alice')
      joinGame('ch-timeout', 'Bob')

      const game = getGame('ch-timeout')!
      game.currentWord = 'apple'
      game.usedWords.add('apple')
      submitWord('ch-timeout', 'Alice', 'energy')

      expect(getTimeoutAt('ch-timeout') * 1000 - Date.now()).toBe(120_000)

      vi.advanceTimersByTime(120_000)

      expect(onTimeout).toHaveBeenCalledWith('ch-timeout', 'Bob')
    })
  })

  describe('endGame', () => {
    it('ends an active game and returns scores', () => {
      startGame('ch-1', 'Alice')
      joinGame('ch-1', 'Bob')

      const result = endGame('ch-1')
      expect(result.message).toContain('Game over')
      expect(result.scores).toBeDefined()
      expect(result.scores.has('Alice')).toBe(true)
      expect(result.scores.has('Bob')).toBe(true)

      // Game should no longer be active
      expect(isGameActive('ch-1')).toBe(false)
      expect(getGame('ch-1')).toBeUndefined()
    })

    it('returns empty scores for nonexistent game', () => {
      const result = endGame('ch-999')
      expect(result.message).toContain('no active game')
      expect(result.scores.size).toBe(0)
    })
  })

  describe('getScores', () => {
    it('returns scores for active game', () => {
      startGame('ch-1', 'Alice')
      joinGame('ch-1', 'Bob')

      const result = getScores('ch-1')
      expect(result.success).toBe(true)
      expect(result.message).toContain('Alice')
      expect(result.message).toContain('Bob')
    })

    it('returns error for nonexistent game', () => {
      const result = getScores('ch-999')
      expect(result.success).toBe(false)
      expect(result.message).toContain('no active game')
    })
  })

  describe('isGameActive', () => {
    it('returns false for nonexistent game', () => {
      expect(isGameActive('ch-999')).toBe(false)
    })

    it('returns true for active game', () => {
      startGame('ch-1', 'Alice')
      expect(isGameActive('ch-1')).toBe(true)
    })

    it('returns false after game ends', () => {
      startGame('ch-1', 'Alice')
      endGame('ch-1')
      expect(isGameActive('ch-1')).toBe(false)
    })
  })

  describe('getGame', () => {
    it('returns undefined for nonexistent game', () => {
      expect(getGame('ch-999')).toBeUndefined()
    })

    it('returns game state for active game', () => {
      startGame('ch-1', 'Alice')
      const game = getGame('ch-1')
      expect(game).toBeDefined()
      expect(game!.channelId).toBe('ch-1')
    })
  })

  describe('destroyAllGames', () => {
    it('clears all active games', () => {
      startGame('ch-1', 'Alice')
      startGame('ch-2', 'Bob')

      expect(isGameActive('ch-1')).toBe(true)
      expect(isGameActive('ch-2')).toBe(true)

      destroyAllGames()

      expect(isGameActive('ch-1')).toBe(false)
      expect(isGameActive('ch-2')).toBe(false)
    })
  })

  describe('full game flow', () => {
    it('plays a complete game with multiple turns', () => {
      // Override dictionary with known words for predictable test
      setDictionary(new Set(['apple', 'eagle', 'ear', 'red', 'dog', 'green', 'net', 'tea', 'ace', 'end']))

      startGame('ch-1', 'Alice')
      joinGame('ch-1', 'Bob')

      const game = getGame('ch-1')!
      // Force a known starter word for test determinism
      game.currentWord = 'apple'
      game.usedWords.clear()
      game.usedWords.add('apple')

      // Alice plays: apple -> e word
      const r1 = submitWord('ch-1', 'Alice', 'eagle')
      expect(r1.success).toBe(true)
      expect(game.currentWord).toBe('eagle')

      // Bob plays: eagle -> e word
      const r2 = submitWord('ch-1', 'Bob', 'ear')
      expect(r2.success).toBe(true)
      expect(game.currentWord).toBe('ear')

      // Alice plays: ear -> r word
      const r3 = submitWord('ch-1', 'Alice', 'red')
      expect(r3.success).toBe(true)
      expect(game.currentWord).toBe('red')

      // Check scores
      expect(game.players.get('Alice')).toBe(2)
      expect(game.players.get('Bob')).toBe(1)

      // End game
      const endResult = endGame('ch-1')
      expect(endResult.scores.get('Alice')).toBe(2)
      expect(endResult.scores.get('Bob')).toBe(1)
    })
  })

  describe('word list', () => {
    it('loads the production dictionary without errors', async () => {
      // Reset to null to force reload of actual dictionary
      setDictionary(null as unknown as Set<string>)

      // Load the actual dictionary JSON via dynamic import
      const { createRequire } = await import('node:module')
      const req = createRequire(import.meta.url)
      const words: string[] = req('../data/wordlist.json')

      expect(words.length).toBeGreaterThan(5000)
      expect(words.every((w: string) => typeof w === 'string')).toBe(true)
      expect(words.every((w: string) => /^[a-z]+$/.test(w))).toBe(true)

      // Restore test dictionary
      setDictionary(TEST_DICTIONARY)
    })
  })
})
