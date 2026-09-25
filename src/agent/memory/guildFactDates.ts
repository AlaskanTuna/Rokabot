import { config } from '../../config.js'
import { getLocalDate, localDateStartEpoch } from '../../utils/timezone.js'
import type { GuildFactDate } from './extractionSchema.js'

type CalendarDate = { year: number; month: number; day: number }

const WEEKDAY_INDEX = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6
} as const

function isoDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

function parseIsoDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, yearText, monthText, dayText] = match
  const date = { year: Number(yearText), month: Number(monthText), day: Number(dayText) }
  const candidate = new Date(0)
  candidate.setUTCFullYear(date.year, date.month - 1, date.day)
  candidate.setUTCHours(0, 0, 0, 0)
  if (
    candidate.getUTCFullYear() !== date.year ||
    candidate.getUTCMonth() !== date.month - 1 ||
    candidate.getUTCDate() !== date.day
  ) {
    return null
  }
  return date
}

function addDays(date: CalendarDate, days: number): CalendarDate | null {
  const candidate = new Date(0)
  candidate.setUTCFullYear(date.year, date.month - 1, date.day + days)
  candidate.setUTCHours(0, 0, 0, 0)
  const result = { year: candidate.getUTCFullYear(), month: candidate.getUTCMonth() + 1, day: candidate.getUTCDate() }
  return result.year >= 1 && result.year <= 9999 ? result : null
}

function weekdayOf(date: CalendarDate): number {
  const candidate = new Date(0)
  candidate.setUTCFullYear(date.year, date.month - 1, date.day)
  candidate.setUTCHours(0, 0, 0, 0)
  return (candidate.getUTCDay() + 6) % 7
}

function dateForMonthDay(month: number, day: number, today: CalendarDate): CalendarDate | null {
  const validInLeapYear = parseIsoDate(isoDate({ year: 2000, month, day }))
  if (!validInLeapYear) return null

  for (let year = today.year; year <= 9999; year++) {
    const candidate = parseIsoDate(isoDate({ year, month, day }))
    if (candidate && isoDate(candidate) >= isoDate(today)) return candidate
  }
  return null
}

function resolveLocalDate(date: GuildFactDate, today: CalendarDate): CalendarDate | null {
  const hasYear = date.year !== undefined
  const hasMonth = date.month !== undefined
  const hasDay = date.day !== undefined
  const hasCalendarComponent = hasYear || hasMonth || hasDay
  const hasRelative = date.relative !== undefined
  if (!hasCalendarComponent && !hasRelative && !date.weekday) return null

  let resolved: CalendarDate | null = null
  if (date.relative === 'today' || date.relative === 'tomorrow') {
    if (hasCalendarComponent) return null
    resolved = date.relative === 'today' ? today : addDays(today, 1)
  } else if (date.relative === 'this_week' || date.relative === 'next_week') {
    if (hasCalendarComponent || !date.weekday) return null
    const weekday = WEEKDAY_INDEX[date.weekday]
    const monday = addDays(today, -weekdayOf(today))
    const weekOffset = date.relative === 'next_week' ? 7 : 0
    resolved = monday ? addDays(monday, weekOffset + weekday) : null
  } else if (hasRelative) {
    return null
  } else if (hasYear) {
    if (!hasMonth || !hasDay) return null
    resolved = parseIsoDate(
      isoDate({ year: date.year as number, month: date.month as number, day: date.day as number })
    )
  } else if (hasMonth || hasDay) {
    if (!hasMonth || !hasDay) return null
    resolved = dateForMonthDay(date.month, date.day, today)
  }

  if (!resolved || isoDate(resolved) < isoDate(today)) return null
  if (date.weekday && weekdayOf(resolved) !== WEEKDAY_INDEX[date.weekday]) return null
  return resolved
}

export function resolveGuildFactDate(
  date: GuildFactDate,
  now: number = Date.now(),
  timezone: string | undefined = config.timezone
): { localDate: string; expiresAt: number } | null {
  const today = parseIsoDate(getLocalDate(now, timezone))
  if (!today) return null
  const resolved = resolveLocalDate(date, today)
  if (!resolved) return null

  const nextDay = addDays(resolved, 1)
  if (!nextDay) return null
  const localDate = isoDate(resolved)
  return { localDate, expiresAt: localDateStartEpoch(isoDate(nextDay), timezone) }
}
