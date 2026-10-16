import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { chatTurns, localHour, parseWindow } from '../persona-turns.js'

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 15, 12, 0, 0)

function fixture() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE session_history (channel_id TEXT, role TEXT, display_name TEXT, content TEXT, timestamp INTEGER, user_id TEXT, username TEXT);
    CREATE TABLE response_events (channel_id TEXT, created_at INTEGER, model_id TEXT, tone TEXT, tools_used TEXT);
  `)
  const say = db.prepare('INSERT INTO session_history VALUES (?, ?, ?, ?, ?, NULL, NULL)')
  const event = db.prepare('INSERT INTO response_events VALUES (?, ?, ?, ?, ?)')
  say.run('c1', 'user', 'Aoi', 'hello roka', T0)
  say.run('c1', 'assistant', 'Roka', 'Oh? Hello~', T0 + 2000)
  event.run('c1', T0 + 1500, 'claude-haiku-5-5', 'playful', '[]')
  say.run('c1', 'user', 'Aoi', 'what is the weather', T0 + 5 * MIN)
  say.run('c1', 'assistant', 'Roka', 'Sunny!', T0 + 5 * MIN + 2000)
  event.run('c1', T0 + 5 * MIN + 1500, 'claude-haiku-5-5', 'curious', '["search_web"]')
  say.run('c1', 'user', 'Aoi', 'roka you there', T0 + 10 * MIN)
  say.run('c1', 'assistant', 'Roka', 'Always~', T0 + 10 * MIN + 2000)
  event.run('c1', T0 + 10 * MIN + 1500, 'gemini-3.5-flash-lite', 'sleepy', null)
  say.run('c2', 'user', 'Ren', '[Replying to Maniwa Roka: [Container: hi]] roka', T0 + 20 * MIN)
  say.run('c2', 'assistant', 'Roka', 'Hm?', T0 + 20 * MIN + 2000)
  event.run('c2', T0 + 20 * MIN + 1500, 'claude-haiku-5-5', 'playful', '[]')
  say.run('c3', 'user', 'Aoi', 'Can you explain this linked post? https://example.test/post', T0 + 25 * MIN)
  say.run('c3', 'assistant', 'Roka', 'It says hello.', T0 + 25 * MIN + 2000)
  event.run('c3', T0 + 25 * MIN + 1500, 'claude-haiku-5-5', 'curious', '[]')
  say.run('c4', 'user', 'Aoi', '[Replying to Roka: [Container: hello]] Please explain this lewd topic', T0 + 30 * MIN)
  say.run('c4', 'assistant', 'Roka', 'Oh!?', T0 + 30 * MIN + 2000)
  event.run('c4', T0 + 30 * MIN + 1500, 'claude-haiku-5-5', 'flustered', '[]')
  return db
}

describe('parseWindow', () => {
  it('reads a name, an ISO range and an optional sample size', () => {
    expect(parseWindow('v2=2026-10-15T10:52:14Z..2026-10-16T05:20:00Z:20')).toEqual({
      name: 'v2',
      from: Date.UTC(2026, 9, 15, 10, 52, 14),
      to: Date.UTC(2026, 9, 16, 5, 20, 0),
      count: 20
    })
    expect(parseWindow('all=2026-10-01T00:00:00Z..2026-10-31T00:00:00Z').count).toBeUndefined()
  })

  it('rejects a range that ends before it starts', () => {
    expect(() => parseWindow('x=2026-10-16T00:00:00Z..2026-10-15T00:00:00Z')).toThrow('ends before it starts')
  })
})

describe('chatTurns', () => {
  const all = [{ name: 'all', from: T0 - MIN, to: T0 + 60 * MIN }]

  it('labels turns with every applicable kind', () => {
    const turns = chatTurns(fixture(), all, { seed: 1, timeZone: 'UTC' })
    expect(turns.map((turn) => turn.kinds)).toEqual([
      ['chat'],
      ['tool'],
      ['chat'],
      ['reply'],
      ['tool'],
      ['tool', 'reply', 'edgy']
    ])
    expect(turns.map((turn) => turn.model)).toEqual([
      'claude-haiku-5-5',
      'claude-haiku-5-5',
      'gemini-3.5-flash-lite',
      'claude-haiku-5-5',
      'claude-haiku-5-5',
      'claude-haiku-5-5'
    ])
  })

  it('gives each turn the history production saw, starting on a user message', () => {
    const turns = chatTurns(fixture(), all, { seed: 1, timeZone: 'UTC' })
    const first = turns.find((turn) => turn.user === 'hello roka')!
    const second = turns.find((turn) => turn.user === 'roka you there')!
    expect(first.messages).toEqual([{ role: 'user', content: '[Aoi]: hello roka' }])
    expect(second.messages.at(-1)).toEqual({ role: 'user', content: '[Aoi]: roka you there' })
    expect(second.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
  })

  it('samples a window deterministically by seed', () => {
    const windowed = [{ name: 'one', from: T0 - MIN, to: T0 + 60 * MIN, count: 1 }]
    const a = chatTurns(fixture(), windowed, { seed: 3, timeZone: 'UTC' })
    const b = chatTurns(fixture(), windowed, { seed: 3, timeZone: 'UTC' })
    expect(a).toHaveLength(1)
    expect(a).toEqual(b)
  })
})

describe('localHour', () => {
  it('reads the hour in the configured time zone', () => {
    expect(localHour(T0, 'UTC')).toBe(12)
    expect(localHour(T0, 'Asia/Kuala_Lumpur')).toBe(20)
  })
})
