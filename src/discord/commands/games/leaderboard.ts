/** Shared leaderboard handler for hangman and shiritori */

import type { ChatInputCommandInteraction } from 'discord.js'
import { getDb } from '../../../storage/database.js'
import { buildGameContainer } from './shared.js'

export function handleLeaderboard(game: 'hangman' | 'shiritori', interaction: ChatInputCommandInteraction) {
  const db = getDb()

  const rows = db
    .prepare(
      `
    SELECT user_id, SUM(score) as total_score, COUNT(*) as games_played
    FROM game_scores
    WHERE game = ?
    GROUP BY user_id
    ORDER BY total_score DESC
    LIMIT 10
  `
    )
    .all(game) as Array<{ user_id: string; total_score: number; games_played: number }>

  if (rows.length === 0) {
    return buildGameContainer({
      accentColor: 0xb0c4de,
      title: `${game === 'hangman' ? '\uD83C\uDFC6 Hangman' : '\uD83C\uDFC6 Shiritori'} Leaderboard`,
      body: 'No scores recorded yet~ Be the first to play!'
    })
  }

  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49']
  const lines = rows.map((row, i) => {
    const prefix = i < 3 ? medals[i] : `**${i + 1}.**`
    return `${prefix} <@${row.user_id}> \u2014 **${row.total_score}** pts (${row.games_played} games)`
  })

  const userId = interaction.user.id
  const userInTop = rows.some((r) => r.user_id === userId)
  let footer: string | undefined
  if (!userInTop) {
    const userRow = db
      .prepare(
        `
      SELECT SUM(score) as total_score, COUNT(*) as games_played
      FROM game_scores
      WHERE game = ? AND user_id = ?
    `
      )
      .get(game, userId) as { total_score: number | null; games_played: number } | undefined

    if (userRow?.total_score !== null && userRow?.total_score !== undefined) {
      footer = `Your score: ${userRow.total_score} pts (${userRow.games_played} games)`
    }
  }

  return buildGameContainer({
    accentColor: 0xffd700,
    title: `${game === 'hangman' ? '\uD83C\uDFC6 Hangman' : '\uD83C\uDFC6 Shiritori'} Leaderboard`,
    body: lines.join('\n'),
    footer
  })
}
