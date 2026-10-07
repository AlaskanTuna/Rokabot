import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn }
}))

import { closeDb, getDb } from '../database.js'
import { MAX_CONTEXT_JSON_BYTES, countReportsSince, createReportIfAllowed } from '../reportStore.js'

const options = { maxPerUserPerHour: 5, historyMessages: 20, historyMaxAgeMs: 7_200_000 }

function reportInput(overrides: Partial<Parameters<typeof createReportIfAllowed>[0]> = {}) {
  return {
    type: 'bug' as const,
    message: 'The last reply was wrong',
    userId: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    context: 'guild' as const,
    guildId: 'guild-1',
    channelId: 'channel-1',
    interactionId: `interaction-${Math.random()}`,
    locale: 'en-US',
    attachment: null,
    botVersion: '1.2.3',
    gitCommit: 'abc1234',
    geminiModel: 'gemini-test',
    fallbackModel: 'fallback-test',
    uptimeS: 42,
    ...overrides
  }
}

beforeEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = ':memory:'
  getDb()
  warn.mockClear()
})

afterEach(() => {
  closeDb()
  process.env.ROKABOT_DB_PATH = undefined
})

describe('reportStore', () => {
  it('stores report fields and snapshots recent channel rows from all four event tables', () => {
    const db = getDb()
    const now = Date.now()
    db.prepare(
      'INSERT INTO session_history (channel_id, role, display_name, content, timestamp, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('channel-1', 'user', 'Alice', 'the question', now - 400, 'user-1')
    db.prepare(
      'INSERT INTO session_history (channel_id, role, display_name, content, timestamp) VALUES (?, ?, ?, ?, ?)'
    ).run('channel-1', 'assistant', 'Roka', 'the reported answer', now - 300)
    db.prepare(
      `INSERT INTO response_events (
        guild_id, channel_id, user_id, trigger, tone, outcome, kind, e2e_ms, generate_ms, llm_ms,
        retry_latency_ms, retries, tokens_in_est, tokens_out_est, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('guild-1', 'channel-1', 'user-1', 'mention', 'playful', 'ok', 'ok', 12, 10, 9, 0, 0, 4, 2, now - 200)
    db.prepare(
      `INSERT INTO failure_diagnostics (guild_id, channel_id, user_id, outcome, kind, user_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('guild-1', 'channel-1', 'user-1', 'deflection', 'safety', 'trigger text', now - 100)
    db.prepare(
      `INSERT INTO jev_events (kind, guild_id, channel_id, question, answer, applied, latency_ms, input_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('turn', 'guild-1', 'channel-1', 'question key', 'answer', 1, 8, 3, now - 50)

    const reportId = createReportIfAllowed(reportInput(), options)
    const row = db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(reportId) as Record<string, unknown>
    const snapshot = JSON.parse(row.context_json as string)

    expect(row).toMatchObject({
      type: 'bug',
      status: 'open',
      message: 'The last reply was wrong',
      user_id: 'user-1',
      username: 'alice',
      display_name: 'Alice',
      context: 'guild',
      guild_id: 'guild-1',
      channel_id: 'channel-1',
      interaction_id: expect.stringMatching(/^interaction-/),
      bot_version: '1.2.3',
      git_commit: 'abc1234',
      gemini_model: 'gemini-test',
      fallback_model: 'fallback-test',
      uptime_s: 42
    })
    expect(snapshot.recentMessages).toEqual([
      { role: 'user', display_name: 'Alice', content: 'the question', timestamp: now - 400, user_id: 'user-1' },
      { role: 'assistant', display_name: 'Roka', content: 'the reported answer', timestamp: now - 300 }
    ])
    expect(snapshot.recentResponses).toHaveLength(1)
    expect(snapshot.recentResponses[0]).toMatchObject({ model: null, channel_id: 'channel-1', created_at: now - 200 })
    expect(snapshot.recentFailures[0]).toMatchObject({ user_message: 'trigger text', created_at: now - 100 })
    expect(snapshot.recentJev[0]).toMatchObject({ answer: 'answer', created_at: now - 50 })
  })

  it('trims oldest snapshot entries until the serialized context fits the cap', () => {
    const db = getDb()
    const now = Date.now()
    const insert = db.prepare(
      'INSERT INTO session_history (channel_id, role, display_name, content, timestamp, user_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    for (let index = 0; index < 100; index++) {
      insert.run(
        'channel-1',
        'user',
        `User ${index}`,
        `message-${index}-${'x'.repeat(900)}`,
        now - (100 - index),
        'user-1'
      )
    }

    const reportId = createReportIfAllowed(reportInput(), { ...options, historyMessages: 100 })
    const json = (
      db.prepare('SELECT context_json FROM bug_reports WHERE id = ?').get(reportId) as { context_json: string }
    ).context_json
    const snapshot = JSON.parse(json)

    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(MAX_CONTEXT_JSON_BYTES)
    expect(snapshot.recentMessages[0].content).not.toContain('message-0-')
    expect(snapshot.recentMessages.at(-1).content).toContain('message-99-')
  })

  it('counts reports for one user since a rolling-window cutoff', () => {
    const now = Date.now()
    const db = getDb()
    db.prepare(
      "INSERT INTO bug_reports (created_at, type, message, user_id, context, interaction_id, context_json) VALUES (?, 'bug', 'm', ?, 'bot_dm', 'i1', '{}')"
    ).run(now - 500, 'user-1')
    db.prepare(
      "INSERT INTO bug_reports (created_at, type, message, user_id, context, interaction_id, context_json) VALUES (?, 'bug', 'm', ?, 'bot_dm', 'i2', '{}')"
    ).run(now - 100, 'user-1')
    db.prepare(
      "INSERT INTO bug_reports (created_at, type, message, user_id, context, interaction_id, context_json) VALUES (?, 'bug', 'm', ?, 'bot_dm', 'i3', '{}')"
    ).run(now - 100, 'user-2')

    expect(countReportsSince('user-1', now - 300)).toBe(1)
    expect(countReportsSince('user-2', now - 300)).toBe(1)
  })

  it('files a report with partial context when one snapshot query fails', () => {
    const db = getDb()
    db.exec('DROP TABLE response_events')

    const reportId = createReportIfAllowed(reportInput(), options)
    const row = db.prepare('SELECT context_json FROM bug_reports WHERE id = ?').get(reportId) as {
      context_json: string
    }

    expect(JSON.parse(row.context_json)).toEqual({
      recentMessages: [],
      recentResponses: [],
      recentFailures: [],
      recentJev: []
    })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'channel-1', section: 'recentResponses' }),
      'Failed to capture bug report context snapshot'
    )
  })
})
