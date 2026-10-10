import { ActivityType, type Client } from 'discord.js'
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cfg = vi.hoisted(() => ({ timezone: 'UTC' as string | undefined, statusCycleMs: 900_000 }))

vi.mock('../../config.js', () => ({ config: cfg }))
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { logger } from '../../utils/logger.js'
import { startStatusCycler, stopStatusCycler } from '../statusCycler.js'

const BUCKETS = {
  lateNight: ['Should be sleeping... 💤', "Couldn't sleep... 🌙", 'Late night snack time~ 🍡'],
  morning: ['Opening up the shop~ ☀️', 'Preparing the morning sweets~ 🍡', 'Brewing tea before customers arrive~ 🍵'],
  midMorning: [
    'Managing the sweets shop~ 🍡',
    'Serving customers with a smile~ ♪',
    'Arranging wagashi on the display~ 🌸'
  ],
  lunch: ['Taking a lunch break~ 🍙', "Taste-testing today's specials~ 🍳", 'Eating onigiri behind the counter~ 🍙'],
  afternoon: [
    'Quiet afternoon at the shop~ 🍵',
    'Restocking shelves between customers~ ♪',
    'Enjoying afternoon tea time~ ☕'
  ],
  evening: ['Closing up shop for the day~ 🌅', "Counting today's sales~ ♪", 'Preparing dinner~ 🍳'],
  night: ['Relaxing after a long day~ 🌙', 'Watching anime before bed~ ✨', 'Reading by the lamp light~ 📖']
} as const

type Bucket = keyof typeof BUCKETS
type PresenceMock = Mock<(...args: unknown[]) => unknown>

function createClient(setPresence: PresenceMock | null): Client {
  return { user: setPresence ? { setPresence } : null } as unknown as Client
}

function newPresenceMock(): PresenceMock {
  return vi.fn<(...args: unknown[]) => unknown>()
}

function lastPayload(setPresence: PresenceMock): { activities: Array<{ state: string }>; status: string } {
  return setPresence.mock.calls.at(-1)?.[0] as { activities: Array<{ state: string }>; status: string }
}

function lastState(setPresence: PresenceMock): string {
  return lastPayload(setPresence).activities[0].state
}

function setClockTo(hour: number, minute = 30): void {
  vi.setSystemTime(new Date(`2026-10-10T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  cfg.timezone = 'UTC'
  cfg.statusCycleMs = 900_000
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  stopStatusCycler()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('startStatusCycler', () => {
  it('sets an online custom status immediately, before any interval tick', () => {
    setClockTo(8)
    const setPresence = newPresenceMock()

    startStatusCycler(createClient(setPresence))

    expect(setPresence).toHaveBeenCalledTimes(1)
    expect(setPresence).toHaveBeenCalledWith({
      activities: [{ name: 'custom', type: ActivityType.Custom, state: BUCKETS.morning[0] }],
      status: 'online'
    })
  })

  it.each([
    [0, 'lateNight'],
    [4, 'lateNight'],
    [5, 'morning'],
    [8, 'morning'],
    [9, 'midMorning'],
    [11, 'midMorning'],
    [12, 'lunch'],
    [13, 'lunch'],
    [14, 'afternoon'],
    [16, 'afternoon'],
    [17, 'evening'],
    [19, 'evening'],
    [20, 'night'],
    [22, 'night'],
    [23, 'lateNight']
  ] satisfies Array<[number, Bucket]>)('picks a status from the schedule bucket for %i:30 UTC', (hour, bucket) => {
    setClockTo(hour)
    const setPresence = newPresenceMock()

    startStatusCycler(createClient(setPresence))

    expect(BUCKETS[bucket]).toContain(lastState(setPresence))
  })

  it('switches from the late-night bucket to the morning bucket at exactly 05:00', () => {
    setClockTo(4, 59)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))
    expect(BUCKETS.lateNight).toContain(lastState(setPresence))

    stopStatusCycler()
    setClockTo(5, 0)
    startStatusCycler(createClient(setPresence))

    expect(BUCKETS.morning).toContain(lastState(setPresence))
  })

  it('chooses the status with Math.random, first entry at 0 and last entry near 1', () => {
    setClockTo(8)
    const setPresence = newPresenceMock()
    vi.mocked(Math.random).mockReturnValue(0.999)

    startStatusCycler(createClient(setPresence))

    expect(lastState(setPresence)).toBe(BUCKETS.morning[2])
  })

  it('logs the start with the configured interval', () => {
    setClockTo(8)

    startStatusCycler(createClient(newPresenceMock()))

    expect(logger.info).toHaveBeenCalledWith({ intervalMs: 900_000 }, 'Status cycler started')
  })

  it('logs the hour and chosen status at debug level on each update', () => {
    setClockTo(8)

    startStatusCycler(createClient(newPresenceMock()))

    expect(logger.debug).toHaveBeenCalledWith({ hour: 8, status: BUCKETS.morning[0] }, 'Bot status updated')
  })

  it('starts without error when client.user is missing, and sets presence on a later tick once the user exists', () => {
    setClockTo(8)
    const client = createClient(null)

    expect(() => startStatusCycler(client)).not.toThrow()
    expect(logger.info).toHaveBeenCalledWith({ intervalMs: 900_000 }, 'Status cycler started')

    const setPresence = newPresenceMock()
    client.user = { setPresence } as unknown as Client['user']
    vi.advanceTimersByTime(900_000)

    expect(setPresence).toHaveBeenCalledTimes(1)
    expect(lastState(setPresence)).toBe(BUCKETS.morning[0])
  })

  it('lets a setPresence error from the first update propagate and starts no interval', () => {
    setClockTo(8)
    const setPresence = newPresenceMock()
    setPresence.mockImplementationOnce(() => {
      throw new Error('shard not ready')
    })

    expect(() => startStatusCycler(createClient(setPresence))).toThrow('shard not ready')
    expect(logger.info).not.toHaveBeenCalledWith({ intervalMs: 900_000 }, 'Status cycler started')

    vi.advanceTimersByTime(900_000 * 2)
    expect(setPresence).toHaveBeenCalledTimes(1)
  })
})

describe('status rotation', () => {
  it('sets a new status once per statusCycleMs and not before', () => {
    setClockTo(8)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))

    vi.advanceTimersByTime(899_999)
    expect(setPresence).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    expect(setPresence).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(900_000)
    expect(setPresence).toHaveBeenCalledTimes(3)
  })

  it('uses the interval from config.statusCycleMs', () => {
    cfg.statusCycleMs = 60_000
    setClockTo(8)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))

    vi.advanceTimersByTime(60_000)

    expect(setPresence).toHaveBeenCalledTimes(2)
  })

  it('moves to the next time-of-day bucket when a tick crosses an hour boundary', () => {
    setClockTo(8, 50)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))
    expect(BUCKETS.morning).toContain(lastState(setPresence))

    vi.advanceTimersByTime(15 * 60_000)

    expect(setPresence).toHaveBeenCalledTimes(2)
    expect(BUCKETS.midMorning).toContain(lastState(setPresence))
  })

  it('keeps the same time-of-day bucket across ticks inside one window', () => {
    setClockTo(10, 0)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))

    vi.advanceTimersByTime(900_000 * 2)

    expect(setPresence).toHaveBeenCalledTimes(3)
    for (const [payload] of setPresence.mock.calls as Array<[{ activities: Array<{ state: string }> }]>) {
      expect(BUCKETS.midMorning).toContain(payload.activities[0].state)
    }
  })
})

describe('stopStatusCycler', () => {
  it('stops further presence updates', () => {
    setClockTo(8)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))

    stopStatusCycler()
    vi.advanceTimersByTime(900_000 * 3)

    expect(setPresence).toHaveBeenCalledTimes(1)
  })

  it('logs the stop once, and a second stop does nothing', () => {
    setClockTo(8)
    startStatusCycler(createClient(newPresenceMock()))

    stopStatusCycler()
    stopStatusCycler()

    const stopLogs = vi.mocked(logger.info).mock.calls.filter(([msg]) => msg === 'Status cycler stopped')
    expect(stopLogs).toHaveLength(1)
  })

  it('does nothing and logs nothing when the cycler was never started', () => {
    expect(() => stopStatusCycler()).not.toThrow()

    expect(logger.info).not.toHaveBeenCalledWith('Status cycler stopped')
  })

  it('resumes rotating after a stop followed by a new start', () => {
    setClockTo(8)
    const setPresence = newPresenceMock()
    startStatusCycler(createClient(setPresence))
    stopStatusCycler()

    startStatusCycler(createClient(setPresence))
    expect(setPresence).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(900_000)
    expect(setPresence).toHaveBeenCalledTimes(3)

    stopStatusCycler()
    vi.advanceTimersByTime(900_000 * 2)
    expect(setPresence).toHaveBeenCalledTimes(3)
  })
})
