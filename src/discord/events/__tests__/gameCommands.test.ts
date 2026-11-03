import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { character } from '../../../character/index.js'
import { fillLine } from '../../../character/lines.js'
import { destroyAllGames, getGame, joinGame, startGame, submitWord } from '../../../games/shiritori.js'
import { getDb } from '../../../storage/database.js'
import { createGameCommandHandler } from '../gameCommands.js'

describe('gameCommands shiritori timeout', () => {
  const send = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    send.mockReset()
    send.mockResolvedValue(undefined)
    destroyAllGames()
    getDb().prepare('DELETE FROM game_scores').run()
    const client = { channels: { cache: new Map([['ch-1', { send }]]) } }
    createGameCommandHandler(client as never)
  })

  afterEach(() => {
    destroyAllGames()
    vi.useRealTimers()
  })

  it('saves scores by user ID and frees the channel when a timeout leaves one player', () => {
    startGame('ch-1', { id: 'u1', name: 'Ari' })
    joinGame('ch-1', { id: 'u2', name: 'Bo' })

    const game = getGame('ch-1')!
    game.currentWord = 'apple'
    game.usedWords.add('apple')
    expect(submitWord('ch-1', { id: 'u1', name: 'Ari' }, 'energy').success).toBe(true)

    vi.advanceTimersByTime(120_000)

    const expected = fillLine(character.lines.games.shiritoriWinner, { player: 'Bo', winner: 'Ari' })
    expect(send).toHaveBeenCalledTimes(1)
    const container = send.mock.calls[0][0].components[0].toJSON() as {
      components: Array<{ content?: string }>
    }
    const text = container.components.map((block) => block.content ?? '').join('\n')
    expect(text).toContain(expected)

    const rows = getDb().prepare("SELECT user_id, score FROM game_scores WHERE game = 'shiritori'").all() as Array<{
      user_id: string
      score: number
    }>
    const sorted = [...rows].sort((a, b) => a.user_id.localeCompare(b.user_id))
    expect(sorted).toEqual([
      { user_id: 'u1', score: 1 },
      { user_id: 'u2', score: 0 }
    ])

    expect(startGame('ch-1', { id: 'u3', name: 'Cid' }).success).toBe(true)
  })

  it('saves scores and frees the channel when the channel is not cached', () => {
    createGameCommandHandler({ channels: { cache: new Map() } } as never)
    startGame('ch-1', { id: 'u1', name: 'Ari' })
    joinGame('ch-1', { id: 'u2', name: 'Bo' })

    const game = getGame('ch-1')!
    game.currentWord = 'apple'
    game.usedWords.add('apple')
    expect(submitWord('ch-1', { id: 'u1', name: 'Ari' }, 'energy').success).toBe(true)

    vi.advanceTimersByTime(120_000)

    expect(send).not.toHaveBeenCalled()

    const rows = getDb().prepare("SELECT user_id, score FROM game_scores WHERE game = 'shiritori'").all() as Array<{
      user_id: string
      score: number
    }>
    const sorted = [...rows].sort((a, b) => a.user_id.localeCompare(b.user_id))
    expect(sorted).toEqual([
      { user_id: 'u1', score: 1 },
      { user_id: 'u2', score: 0 }
    ])

    expect(startGame('ch-1', { id: 'u3', name: 'Cid' }).success).toBe(true)
  })

  it('keeps the game active when a timeout leaves two players, then finishes on the next timeout', () => {
    startGame('ch-1', { id: 'u1', name: 'Ari' })
    joinGame('ch-1', { id: 'u2', name: 'Bo' })
    joinGame('ch-1', { id: 'u3', name: 'Cid' })

    const game = getGame('ch-1')!
    game.currentWord = 'apple'
    game.usedWords.add('apple')
    expect(submitWord('ch-1', { id: 'u1', name: 'Ari' }, 'energy').success).toBe(true)

    vi.advanceTimersByTime(120_000)

    const nextExpected = fillLine(character.lines.games.shiritoriNext, { player: 'Bo', next: 'Cid' })
    expect(send).toHaveBeenCalledTimes(1)
    const nextContainer = send.mock.calls[0][0].components[0].toJSON() as {
      components: Array<{ content?: string }>
    }
    expect(nextContainer.components.map((block) => block.content ?? '').join('\n')).toContain(nextExpected)

    expect(getGame('ch-1')?.active).toBe(true)
    expect(getDb().prepare("SELECT user_id, score FROM game_scores WHERE game = 'shiritori'").all()).toEqual([])
    expect(startGame('ch-1', { id: 'u4', name: 'Dee' }).success).toBe(false)

    vi.advanceTimersByTime(120_000)

    const winExpected = fillLine(character.lines.games.shiritoriWinner, { player: 'Cid', winner: 'Ari' })
    expect(send).toHaveBeenCalledTimes(2)
    const winContainer = send.mock.calls[1][0].components[0].toJSON() as {
      components: Array<{ content?: string }>
    }
    expect(winContainer.components.map((block) => block.content ?? '').join('\n')).toContain(winExpected)

    const rows = getDb().prepare("SELECT user_id, score FROM game_scores WHERE game = 'shiritori'").all() as Array<{
      user_id: string
      score: number
    }>
    const sorted = [...rows].sort((a, b) => a.user_id.localeCompare(b.user_id))
    expect(sorted).toEqual([
      { user_id: 'u1', score: 1 },
      { user_id: 'u2', score: 0 },
      { user_id: 'u3', score: 0 }
    ])

    expect(startGame('ch-1', { id: 'u4', name: 'Dee' }).success).toBe(true)
  })
})
