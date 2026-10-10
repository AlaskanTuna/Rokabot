import Database from 'better-sqlite3'
import type { Client } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../config.js', () => ({
  config: {
    logging: { level: 'silent' },
    reminders: { checkIntervalMs: 5_000, maxPerUser: 5, staleThresholdMs: 300_000 }
  }
}))

vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

let testDb: Database.Database

vi.mock('../../storage/database.js', () => ({
  getDb: () => testDb
}))

import { createReminder } from '../../storage/reminderStore.js'
import { startReminderScheduler, stopReminderScheduler } from '../reminderScheduler.js'

const NOW = Date.parse('2026-06-01T12:00:00Z')
const CHECK_MS = 5_000
const DM_NOTE = "-# (Sent as DM because I couldn't reach the original channel)"

type FakeSender = { send: ReturnType<typeof vi.fn> }

function sender(): FakeSender {
  return { send: vi.fn().mockResolvedValue(undefined) }
}

function rejectingSender(): FakeSender {
  return { send: vi.fn().mockRejectedValue(new Error('Missing Permissions')) }
}

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      reminder TEXT NOT NULL,
      due_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      delivered INTEGER DEFAULT 0
    );
  `)
  return db
}

function isDelivered(id: number): boolean {
  const row = testDb.prepare('SELECT delivered FROM reminders WHERE id = ?').get(id) as { delivered: number }
  return row.delivered === 1
}

let channels: Map<string, unknown>
let users: Map<string, FakeSender>
let client: Client

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  testDb = createTestDb()
  channels = new Map()
  users = new Map()
  client = {
    channels: {
      fetch: vi.fn(async (id: string) => {
        const channel = channels.get(id)
        if (channel instanceof Error) throw channel
        return channel ?? null
      })
    },
    users: {
      fetch: vi.fn(async (id: string) => {
        const user = users.get(id)
        if (!user) throw new Error('Unknown User')
        return user
      })
    }
  } as unknown as Client
})

afterEach(() => {
  stopReminderScheduler()
  vi.useRealTimers()
  testDb.close()
})

async function advanceChecks(count = 1): Promise<void> {
  await vi.advanceTimersByTimeAsync(CHECK_MS * count)
}

describe('startReminderScheduler', () => {
  it('delivers a due reminder to its channel with the mention and text', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    const id = createReminder('user-1', 'ch-1', 'buy milk', NOW).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(channel.send).toHaveBeenCalledTimes(1)
    expect(channel.send).toHaveBeenCalledWith('Hey <@user-1>~ you asked me to remind you: "buy milk" ♪')
    expect(isDelivered(id)).toBe(true)
  })

  it('does not check for reminders before the first check interval elapses', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    createReminder('user-1', 'ch-1', 'buy milk', NOW)

    startReminderScheduler(client)
    await vi.advanceTimersByTimeAsync(CHECK_MS - 1)
    expect(channel.send).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(channel.send).toHaveBeenCalledTimes(1)
  })

  it('holds a reminder until its due time', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    const id = createReminder('user-1', 'ch-1', 'stretch', NOW + 60_000).id

    startReminderScheduler(client)
    await advanceChecks()
    expect(channel.send).not.toHaveBeenCalled()
    expect(isDelivered(id)).toBe(false)

    await advanceChecks(11)
    expect(channel.send).toHaveBeenCalledTimes(1)
    expect(isDelivered(id)).toBe(true)
  })

  it('delivers each due reminder to its own channel in one pass', async () => {
    const first = sender()
    const second = sender()
    channels.set('ch-1', first)
    channels.set('ch-2', second)
    createReminder('user-1', 'ch-1', 'tea', NOW)
    createReminder('user-2', 'ch-2', 'bread', NOW)

    startReminderScheduler(client)
    await advanceChecks()

    expect(first.send).toHaveBeenCalledWith('Hey <@user-1>~ you asked me to remind you: "tea" ♪')
    expect(second.send).toHaveBeenCalledWith('Hey <@user-2>~ you asked me to remind you: "bread" ♪')
  })

  it('sends each reminder only once across later checks', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    createReminder('user-1', 'ch-1', 'buy milk', NOW)

    startReminderScheduler(client)
    await advanceChecks(4)

    expect(channel.send).toHaveBeenCalledTimes(1)
  })

  it('delivers a reminder that is up to five minutes overdue', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    const id = createReminder('user-1', 'ch-1', 'late tea', NOW - 240_000).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(channel.send).toHaveBeenCalledTimes(1)
    expect(isDelivered(id)).toBe(true)
  })

  it('drops a reminder more than five minutes overdue without sending it', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    const id = createReminder('user-1', 'ch-1', 'very late tea', NOW - 360_000).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(channel.send).not.toHaveBeenCalled()
    expect(isDelivered(id)).toBe(true)
  })

  it('falls back to a DM when the channel cannot be fetched', async () => {
    const dm = sender()
    users.set('user-1', dm)
    channels.set('ch-1', new Error('Unknown Channel'))
    const id = createReminder('user-1', 'ch-1', 'buy milk', NOW).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(dm.send).toHaveBeenCalledWith(`Hey~ you asked me to remind you: "buy milk" ♪\n\n${DM_NOTE}`)
    expect(isDelivered(id)).toBe(true)
  })

  it('falls back to a DM when the channel fetch returns nothing', async () => {
    const dm = sender()
    users.set('user-1', dm)
    createReminder('user-1', 'ch-missing', 'buy milk', NOW)

    startReminderScheduler(client)
    await advanceChecks()

    expect(dm.send).toHaveBeenCalledWith(`Hey~ you asked me to remind you: "buy milk" ♪\n\n${DM_NOTE}`)
  })

  it('falls back to a DM when the fetched channel cannot receive messages', async () => {
    const dm = sender()
    users.set('user-1', dm)
    channels.set('ch-voice', { id: 'ch-voice' })
    createReminder('user-1', 'ch-voice', 'buy milk', NOW)

    startReminderScheduler(client)
    await advanceChecks()

    expect(dm.send).toHaveBeenCalledWith(`Hey~ you asked me to remind you: "buy milk" ♪\n\n${DM_NOTE}`)
  })

  it('falls back to a DM when sending to the channel fails', async () => {
    const dm = sender()
    users.set('user-1', dm)
    channels.set('ch-1', rejectingSender())
    const id = createReminder('user-1', 'ch-1', 'buy milk', NOW).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(dm.send).toHaveBeenCalledWith(`Hey~ you asked me to remind you: "buy milk" ♪\n\n${DM_NOTE}`)
    expect(isDelivered(id)).toBe(true)
  })

  it('gives up on a reminder whose channel and DM both fail, without resending it', async () => {
    const dm = rejectingSender()
    users.set('user-1', dm)
    channels.set('ch-1', new Error('Unknown Channel'))
    const id = createReminder('user-1', 'ch-1', 'buy milk', NOW).id

    startReminderScheduler(client)
    await advanceChecks(3)

    expect(dm.send).toHaveBeenCalledTimes(1)
    expect(isDelivered(id)).toBe(true)
  })

  it('marks a reminder delivered when its channel cannot receive messages and the user cannot be fetched', async () => {
    channels.set('ch-voice', { id: 'ch-voice' })
    const id = createReminder('user-unknown', 'ch-voice', 'buy milk', NOW).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(isDelivered(id)).toBe(true)
  })

  it('keeps delivering the other reminders when one reminder fails entirely', async () => {
    const healthy = sender()
    channels.set('ch-ok', healthy)
    channels.set('ch-broken', new Error('Unknown Channel'))
    users.set('user-1', rejectingSender())
    const broken = createReminder('user-1', 'ch-broken', 'broken', NOW).id
    const ok = createReminder('user-2', 'ch-ok', 'fine', NOW).id

    startReminderScheduler(client)
    await advanceChecks()

    expect(healthy.send).toHaveBeenCalledWith('Hey <@user-2>~ you asked me to remind you: "fine" ♪')
    expect(isDelivered(broken)).toBe(true)
    expect(isDelivered(ok)).toBe(true)
  })
})

describe('stopReminderScheduler', () => {
  it('stops delivering reminders and leaves them undelivered', async () => {
    const channel = sender()
    channels.set('ch-1', channel)
    const id = createReminder('user-1', 'ch-1', 'buy milk', NOW).id

    startReminderScheduler(client)
    stopReminderScheduler()
    await advanceChecks(3)

    expect(channel.send).not.toHaveBeenCalled()
    expect(isDelivered(id)).toBe(false)
  })

  it('clears the interval timer it started', () => {
    startReminderScheduler(client)
    expect(vi.getTimerCount()).toBe(1)

    stopReminderScheduler()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does nothing when called without a running scheduler', () => {
    expect(() => stopReminderScheduler()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('delivers again after the scheduler is restarted', async () => {
    const channel = sender()
    channels.set('ch-1', channel)

    startReminderScheduler(client)
    stopReminderScheduler()
    startReminderScheduler(client)
    createReminder('user-1', 'ch-1', 'buy milk', NOW)
    await advanceChecks()

    expect(channel.send).toHaveBeenCalledTimes(1)
  })
})
