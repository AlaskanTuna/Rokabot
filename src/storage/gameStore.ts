import { logger } from '../utils/logger.js'
import { getDb } from './database.js'

export function saveGameScore(userId: string, game: 'hangman' | 'shiritori', score: number): void {
  try {
    getDb()
      .prepare('INSERT INTO game_scores (user_id, game, score, played_at) VALUES (?, ?, ?, ?)')
      .run(userId, game, score, Date.now())
  } catch (error) {
    logger.error({ error, userId, game, score }, `Failed to save ${game} score`)
  }
}

export function gameLeaderboard(
  game: 'hangman' | 'shiritori',
  limit = 10
): Array<{ user_id: string; total_score: number; games_played: number }> {
  return getDb()
    .prepare(
      `SELECT user_id, SUM(score) as total_score, COUNT(*) as games_played
       FROM game_scores
       WHERE game = ?
       GROUP BY user_id
       ORDER BY total_score DESC
       LIMIT ?`
    )
    .all(game, limit) as Array<{ user_id: string; total_score: number; games_played: number }>
}

export function gamePlayerTotal(
  game: 'hangman' | 'shiritori',
  userId: string
): { total_score: number | null; games_played: number } | undefined {
  return getDb()
    .prepare(
      `SELECT SUM(score) as total_score, COUNT(*) as games_played
       FROM game_scores
       WHERE game = ? AND user_id = ?`
    )
    .get(game, userId) as { total_score: number | null; games_played: number } | undefined
}
