import { describe, expect, it } from 'vitest'
import type { GuildFactDate } from '../extractionSchema.js'

type ResolvedDate = { localDate: string; eventDate: string; expiresAt: number }
type DateResolver = (date: GuildFactDate, now?: number, timezone?: string) => ResolvedDate | null

async function loadResolver(): Promise<DateResolver | undefined> {
  try {
    const specifier = new URL('../guildFactDates.js', import.meta.url).href
    const module = await import(/* @vite-ignore */ specifier)
    return module.resolveGuildFactDate as DateResolver
  } catch {
    return undefined
  }
}

async function expectResolved(
  date: GuildFactDate,
  now: string,
  timezone: string,
  expected: ResolvedDate
): Promise<void> {
  const resolveGuildFactDate = await loadResolver()
  expect(resolveGuildFactDate).toBeTypeOf('function')
  if (!resolveGuildFactDate) return
  expect(resolveGuildFactDate(date, Date.parse(now), timezone)).toEqual(expected)
}

describe('resolveGuildFactDate', () => {
  it('resolves tomorrow to the next Singapore local midnight', async () => {
    await expectResolved({ relative: 'tomorrow' }, '2026-09-25T10:00:00Z', 'Asia/Singapore', {
      localDate: '2026-09-26',
      eventDate: '2026-09-26',
      expiresAt: Date.parse('2026-09-26T16:00:00Z')
    })
  })

  it('resolves today and Monday-first week-relative dates', async () => {
    const resolveGuildFactDate = await loadResolver()
    expect(resolveGuildFactDate).toBeTypeOf('function')
    if (!resolveGuildFactDate) return

    const now = Date.parse('2026-09-25T10:00:00Z')
    expect(resolveGuildFactDate({ relative: 'today' }, now, 'Asia/Singapore')).toEqual({
      localDate: '2026-09-25',
      eventDate: '2026-09-25',
      expiresAt: Date.parse('2026-09-25T16:00:00Z')
    })
    expect(resolveGuildFactDate({ relative: 'this_week', weekday: 'friday' }, now, 'Asia/Singapore')).toEqual({
      localDate: '2026-09-25',
      eventDate: '2026-09-25',
      expiresAt: Date.parse('2026-09-25T16:00:00Z')
    })
    expect(resolveGuildFactDate({ relative: 'next_week', weekday: 'monday' }, now, 'Asia/Singapore')).toEqual({
      localDate: '2026-09-28',
      eventDate: '2026-09-28',
      expiresAt: Date.parse('2026-09-28T16:00:00Z')
    })
  })

  it('uses the 25-hour New York fall-back day before expiring at local midnight', async () => {
    await expectResolved({ year: 2026, month: 11, day: 8 }, '2026-11-06T12:00:00Z', 'America/New_York', {
      localDate: '2026-11-08',
      eventDate: '2026-11-08',
      expiresAt: Date.parse('2026-11-09T05:00:00Z')
    })
  })

  it('uses the local calendar when now is just after midnight', async () => {
    await expectResolved({ relative: 'tomorrow' }, '2026-09-25T16:30:00Z', 'Asia/Singapore', {
      localDate: '2026-09-27',
      eventDate: '2026-09-27',
      expiresAt: Date.parse('2026-09-27T16:00:00Z')
    })
  })

  it('resolves a yearless December 31 and expires on the next calendar year', async () => {
    await expectResolved({ month: 12, day: 31 }, '2026-12-30T10:00:00Z', 'Asia/Singapore', {
      localDate: '2026-12-31',
      eventDate: '2026-12-31',
      expiresAt: Date.parse('2026-12-31T16:00:00Z')
    })
  })

  it('resolves a yearless date before today to its next occurrence', async () => {
    await expectResolved({ month: 9, day: 24 }, '2026-09-25T10:00:00Z', 'Asia/Singapore', {
      localDate: '2027-09-24',
      eventDate: '2027-09-24',
      expiresAt: Date.parse('2027-09-24T16:00:00Z')
    })
  })

  it('resolves a yearless month and expires at the first instant of the next month', async () => {
    await expectResolved({ month: 10 }, '2026-09-25T10:00:00Z', 'Asia/Singapore', {
      localDate: '2026-10-01',
      eventDate: '2026-10',
      expiresAt: Date.parse('2026-10-31T16:00:00Z')
    })
  })

  it('resolves a month that names its year', async () => {
    await expectResolved({ year: 2026, month: 10 }, '2026-09-25T10:00:00Z', 'Asia/Singapore', {
      localDate: '2026-10-01',
      eventDate: '2026-10',
      expiresAt: Date.parse('2026-10-31T16:00:00Z')
    })
  })

  it('expires a December month at the first instant of January', async () => {
    await expectResolved({ month: 12 }, '2026-11-20T10:00:00Z', 'Asia/Singapore', {
      localDate: '2026-12-01',
      eventDate: '2026-12',
      expiresAt: Date.parse('2026-12-31T16:00:00Z')
    })
  })

  it('keeps a yearless month that is the current month', async () => {
    await expectResolved({ month: 9 }, '2026-09-25T10:00:00Z', 'Asia/Singapore', {
      localDate: '2026-09-01',
      eventDate: '2026-09',
      expiresAt: Date.parse('2026-09-30T16:00:00Z')
    })
  })

  it('rolls a yearless month that has passed to the same month next year', async () => {
    await expectResolved({ month: 8 }, '2026-09-25T10:00:00Z', 'Asia/Singapore', {
      localDate: '2027-08-01',
      eventDate: '2027-08',
      expiresAt: Date.parse('2027-08-31T16:00:00Z')
    })
  })

  it('resolves this_month and next_month in the configured timezone', async () => {
    const resolveGuildFactDate = await loadResolver()
    expect(resolveGuildFactDate).toBeTypeOf('function')
    if (!resolveGuildFactDate) return

    const now = Date.parse('2026-09-25T10:00:00Z')
    expect(resolveGuildFactDate({ relative: 'this_month' }, now, 'Asia/Singapore')).toEqual({
      localDate: '2026-09-01',
      eventDate: '2026-09',
      expiresAt: Date.parse('2026-09-30T16:00:00Z')
    })
    expect(resolveGuildFactDate({ relative: 'next_month' }, now, 'Asia/Singapore')).toEqual({
      localDate: '2026-10-01',
      eventDate: '2026-10',
      expiresAt: Date.parse('2026-10-31T16:00:00Z')
    })
  })

  it('rolls next_month across a year boundary', async () => {
    await expectResolved({ relative: 'next_month' }, '2026-12-15T10:00:00Z', 'Asia/Singapore', {
      localDate: '2027-01-01',
      eventDate: '2027-01',
      expiresAt: Date.parse('2027-01-31T16:00:00Z')
    })
  })

  it.each([
    ['an impossible date', { year: 2026, month: 2, day: 30 }],
    ['an incomplete week-relative date', { relative: 'next_week' }],
    ['a contradictory weekday', { year: 2026, month: 9, day: 26, weekday: 'monday' }],
    ['conflicting relative and calendar forms', { relative: 'tomorrow', month: 9, day: 26 }],
    ['a month that has already passed this year', { year: 2026, month: 8 }],
    ['a date before today', { year: 2026, month: 9, day: 24 }]
  ])('rejects %s', async (_, date) => {
    const resolveGuildFactDate = await loadResolver()
    expect(resolveGuildFactDate).toBeTypeOf('function')
    if (!resolveGuildFactDate) return
    expect(resolveGuildFactDate(date as GuildFactDate, Date.parse('2026-09-25T10:00:00Z'), 'Asia/Singapore')).toBeNull()
  })
})
