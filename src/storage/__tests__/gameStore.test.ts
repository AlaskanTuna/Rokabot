import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { closeDb, getDb } from '../database.js'
import { gameLeaderboard, gamePlayerTotal } from '../gameStore.js'

beforeEach(() => {
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

function insertScore(userId: string, game: 'hangman' | 'shiritori', score: number): void {
  getDb()
    .prepare('INSERT INTO game_scores (user_id, game, score, played_at) VALUES (?, ?, ?, ?)')
    .run(userId, game, score, Date.now())
}

describe('game store', () => {
  it('ranks the highest total first with right totals and counts for one game', () => {
    insertScore('user-1', 'hangman', 10)
    insertScore('user-1', 'hangman', 20)
    insertScore('user-2', 'hangman', 50)
    insertScore('user-1', 'shiritori', 100)

    expect(gameLeaderboard('hangman')).toEqual([
      { user_id: 'user-2', total_score: 50, games_played: 1 },
      { user_id: 'user-1', total_score: 30, games_played: 2 }
    ])
  })

  it('returns 10 rows by default with 11 players and honours a smaller limit', () => {
    for (let index = 0; index < 11; index++) insertScore(`user-${index}`, 'hangman', index + 1)

    expect(gameLeaderboard('hangman')).toHaveLength(10)
    expect(gameLeaderboard('hangman', 3)).toHaveLength(3)
  })

  it('totals one player in one game and gives a null total with no rows', () => {
    insertScore('user-1', 'hangman', 10)
    insertScore('user-1', 'hangman', 20)
    insertScore('user-1', 'shiritori', 100)
    insertScore('user-2', 'hangman', 5)

    expect(gamePlayerTotal('hangman', 'user-1')).toEqual({ total_score: 30, games_played: 2 })
    expect(gamePlayerTotal('hangman', 'nobody')).toEqual({ total_score: null, games_played: 0 })
  })
})
